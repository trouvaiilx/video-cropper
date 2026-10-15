//! Low-resolution playback proxy.
//!
//! The in-app player uses the webview's native decoder. Containers/codecs it
//! cannot decode (AVI, WMV, FLV, HEVC without OS codecs, ...) fall back to a
//! small video-only H.264 proxy generated here. Only one proxy is kept on disk
//! and only one proxy job runs at a time.

use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread::sleep;
use std::time::Duration;

/// Proxy height cap in pixels. Small on purpose: this is only a preview.
const PROXY_MAX_HEIGHT: u32 = 480;

#[derive(Default)]
pub struct ProxyJob {
    generation: u64,
    child: Option<Child>,
}

pub type ProxySlot = Arc<Mutex<ProxyJob>>;

pub fn new_proxy_slot() -> ProxySlot {
    Arc::new(Mutex::new(ProxyJob::default()))
}

fn proxy_dir() -> PathBuf {
    std::env::temp_dir().join("VideoCropper").join("proxy")
}

pub fn remove_file_with_retry_sync(path: &Path) {
    if !path.exists() {
        return;
    }
    for _ in 0..20 {
        if fs::remove_file(path).is_ok() || !path.exists() {
            return;
        }
        sleep(Duration::from_millis(50));
    }
}

/// Stable-per-session cache name derived from path, size, mtime, and audio flag.
fn proxy_name(input: &Path, has_audio: bool) -> Result<String, String> {
    let meta = fs::metadata(input).map_err(|e| format!("Cannot read input file: {}", e))?;
    let mut hasher = DefaultHasher::new();
    "proxy_v2".hash(&mut hasher);
    input.hash(&mut hasher);
    meta.len().hash(&mut hasher);
    if let Ok(modified) = meta.modified() {
        modified.hash(&mut hasher);
    }
    has_audio.hash(&mut hasher);
    Ok(format!("{:016x}", hasher.finish()))
}

pub fn build_proxy_args(input: &str, output: &str, has_audio: bool) -> Vec<String> {
    let scale = format!("scale=w=-2:h='min({},ih)'", PROXY_MAX_HEIGHT);
    let mut args = vec![
        "-hide_banner".to_string(),
        "-v".to_string(),
        "error".to_string(),
        "-y".to_string(),
        "-i".to_string(),
        input.to_string(),
        "-map".to_string(),
        "0:v:0".to_string(),
    ];

    if has_audio {
        args.extend([
            "-map".to_string(),
            "0:a:0?".to_string(),
            "-c:a".to_string(),
            "aac".to_string(),
            "-b:a".to_string(),
            "96k".to_string(),
            "-ac".to_string(),
            "2".to_string(),
        ]);
    } else {
        args.push("-an".to_string());
    }

    args.extend([
        "-sn".to_string(),
        "-dn".to_string(),
        "-vf".to_string(),
        scale,
        "-c:v".to_string(),
        "libx264".to_string(),
        "-preset".to_string(),
        "ultrafast".to_string(),
        "-tune".to_string(),
        "fastdecode".to_string(),
        "-crf".to_string(),
        "30".to_string(),
        "-g".to_string(),
        "30".to_string(),
        "-pix_fmt".to_string(),
        "yuv420p".to_string(),
        "-movflags".to_string(),
        "+faststart".to_string(),
        output.to_string(),
    ]);

    args
}

/// Cancel any running proxy job (also invalidates a worker waiting on it).
pub fn cancel_proxy(slot: &ProxySlot) {
    if let Ok(mut job) = slot.lock() {
        job.generation += 1;
        if let Some(mut child) = job.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// Blocking: returns the path of a ready proxy file, generating it if needed.
pub fn build_proxy(
    slot: &ProxySlot,
    input_path: &str,
    ffmpeg_exe: &str,
    has_audio: bool,
) -> Result<String, String> {
    let input = Path::new(input_path);
    if !input.is_file() {
        return Err(format!("File not found: {}", input_path));
    }

    let dir = proxy_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create proxy folder: {}", e))?;

    let name = proxy_name(input, has_audio)?;
    let final_path = dir.join(format!("{}.mp4", name));
    if final_path.is_file() {
        return Ok(final_path.to_string_lossy().to_string());
    }

    // Keep exactly one proxy on disk: drop everything else (incl. stale partials).
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p != final_path {
                let _ = fs::remove_file(p);
            }
        }
    }

    let tmp_path = dir.join(format!("{}.tmp.mp4", name));
    let args = build_proxy_args(input_path, &tmp_path.to_string_lossy(), has_audio);

    let mut cmd = Command::new(ffmpeg_exe);
    cmd.args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    // Supersede any previous job, then register ours.
    let my_generation = {
        let mut job = slot.lock().map_err(|_| "Proxy state poisoned".to_string())?;
        job.generation += 1;
        if let Some(mut old) = job.child.take() {
            let _ = old.kill();
            let _ = old.wait();
        }
        let child = cmd
            .spawn()
            .map_err(|e| format!("ffmpeg could not be started: {}", e))?;
        job.child = Some(child);
        job.generation
    };

    loop {
        sleep(Duration::from_millis(100));
        let mut job = slot.lock().map_err(|_| "Proxy state poisoned".to_string())?;

        if job.generation != my_generation {
            remove_file_with_retry_sync(&tmp_path);
            return Err("Preview preparation was cancelled.".into());
        }

        let status = match job.child.as_mut() {
            Some(child) => child.try_wait(),
            None => {
                remove_file_with_retry_sync(&tmp_path);
                return Err("Preview preparation was cancelled.".into());
            }
        };

        match status {
            Ok(None) => continue,
            Ok(Some(status)) => {
                job.child = None;
                drop(job);
                if status.success() && tmp_path.is_file() {
                    fs::rename(&tmp_path, &final_path)
                        .map_err(|e| format!("Cannot finalize proxy: {}", e))?;
                    return Ok(final_path.to_string_lossy().to_string());
                }
                remove_file_with_retry_sync(&tmp_path);
                return Err("Could not prepare a playback preview for this file.".into());
            }
            Err(e) => {
                job.child = None;
                remove_file_with_retry_sync(&tmp_path);
                return Err(format!("Proxy process error: {}", e));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proxy_args_are_video_only_when_no_audio() {
        let args = build_proxy_args("in.mkv", "out.mp4", false);
        assert!(args.contains(&"-an".to_string()));
        assert!(!args.contains(&"-c:a".to_string()));
        assert!(args.iter().any(|a| a.contains("min(480,ih)")));
        assert_eq!(args.last().map(String::as_str), Some("out.mp4"));
        let i = args.iter().position(|a| a == "-i").unwrap();
        assert_eq!(args[i + 1], "in.mkv");
    }

    #[test]
    fn test_proxy_args_include_lightweight_audio_when_has_audio() {
        let args = build_proxy_args("in.mkv", "out.mp4", true);
        assert!(!args.contains(&"-an".to_string()));
        assert!(args.contains(&"-c:a".to_string()));
        assert!(args.contains(&"aac".to_string()));
        assert!(args.contains(&"96k".to_string()));
        assert!(args.contains(&"0:a:0?".to_string()));
        assert!(args.iter().any(|a| a.contains("min(480,ih)")));
        assert_eq!(args.last().map(String::as_str), Some("out.mp4"));
    }
}
