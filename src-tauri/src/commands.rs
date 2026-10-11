use crate::ffmpeg::{
    args_to_display, build_ffmpeg_args, build_proxy as run_build_proxy, cancel_proxy,
    detect_encoders, extract_preview as run_extract_preview, find_tool, preview_seek_time,
    probe_video as run_probe_video, resolve_tools, tool_version, EncoderInfo, ProcessManager,
    ProxySlot, ToolPaths,
};
use crate::models::{ProcessingJob, VideoMetadata};
use crate::services::{load_settings, save_settings, AppSettings};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

pub struct AppState {
    pub process_mgr: Arc<ProcessManager>,
    pub proxy: ProxySlot,
}

#[tauri::command]
pub fn get_tools(
    custom_ffmpeg: Option<String>,
    custom_ffprobe: Option<String>,
) -> Option<ToolPaths> {
    resolve_tools(custom_ffmpeg.as_deref(), custom_ffprobe.as_deref())
}

#[tauri::command]
pub fn get_encoders(ffmpeg_exe: String) -> Vec<EncoderInfo> {
    detect_encoders(&ffmpeg_exe)
}

#[tauri::command]
pub fn probe_video(path: String, ffprobe_exe: String) -> Result<VideoMetadata, String> {
    run_probe_video(&path, &ffprobe_exe)
}

#[tauri::command]
pub fn extract_preview(
    path: String,
    ffmpeg_exe: String,
    duration: f64,
) -> Result<String, String> {
    let seek = preview_seek_time(duration);
    run_extract_preview(&path, &ffmpeg_exe, Some(seek), Some(1920))
}

/// Grants the webview's asset protocol read access to exactly one file, so the
/// player can stream it with Range requests (no whole-disk scope).
#[tauri::command]
pub fn allow_playback(app: AppHandle, path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.is_file() {
        return Err(format!("File not found: {}", path));
    }
    app.asset_protocol_scope()
        .allow_file(p)
        .map_err(|e| e.to_string())
}

/// Fallback for sources the webview cannot decode: builds (or reuses) a small
/// video-only H.264 proxy and returns its path.
#[tauri::command]
pub async fn build_playback_proxy(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    ffmpeg_exe: String,
) -> Result<String, String> {
    let slot = state.proxy.clone();
    let proxy_path = tauri::async_runtime::spawn_blocking(move || {
        run_build_proxy(&slot, &path, &ffmpeg_exe)
    })
    .await
    .map_err(|e| e.to_string())??;

    app.asset_protocol_scope()
        .allow_file(Path::new(&proxy_path))
        .map_err(|e| e.to_string())?;
    Ok(proxy_path)
}

#[tauri::command]
pub fn cancel_playback_proxy(state: State<'_, AppState>) {
    cancel_proxy(&state.proxy);
}

#[tauri::command]
pub fn suggest_output_path(input_path: String, last_output_dir: Option<String>) -> String {
    let p = Path::new(&input_path);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("video");
    let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("mp4");

    let target_dir = if let Some(dir) = last_output_dir {
        if !dir.is_empty() && Path::new(&dir).is_dir() {
            PathBuf::from(dir)
        } else {
            p.parent().unwrap_or(Path::new(".")).to_path_buf()
        }
    } else {
        p.parent().unwrap_or(Path::new(".")).to_path_buf()
    };

    let filename = format!("{}_cropped.{}", stem, ext);
    let mut candidate = target_dir.join(&filename);

    if candidate.exists() {
        let mut i = 2;
        loop {
            let alt_name = format!("{}_cropped_{}.{}", stem, i, ext);
            let alt = target_dir.join(&alt_name);
            if !alt.exists() {
                candidate = alt;
                break;
            }
            i += 1;
        }
    }

    candidate.to_string_lossy().to_string()
}

#[tauri::command]
pub fn select_input_file(window: tauri::WebviewWindow, default_dir: Option<String>) -> Option<String> {
    let mut dialog = rfd::FileDialog::new()
        .set_parent(&window)
        .set_title("Open Video")
        .add_filter(
            "Video Files",
            &[
                "mp4", "mkv", "mov", "avi", "webm", "m4v", "mpg", "mpeg", "ts", "m2ts", "wmv",
                "flv", "ogv",
            ],
        );

    if let Some(d) = default_dir {
        if !d.is_empty() {
            dialog = dialog.set_directory(Path::new(&d));
        }
    }

    dialog.pick_file().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn select_output_file(window: tauri::WebviewWindow, default_path: Option<String>) -> Option<String> {
    let mut dialog = rfd::FileDialog::new()
        .set_parent(&window)
        .set_title("Save Output Video");

    if let Some(dp) = default_path {
        let p = Path::new(&dp);
        if let Some(parent) = p.parent() {
            dialog = dialog.set_directory(parent);
        }
        if let Some(file_name) = p.file_name().and_then(|s| s.to_str()) {
            dialog = dialog.set_file_name(file_name);
        }
    }

    dialog.save_file().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn select_exe_file(window: tauri::WebviewWindow, title: String) -> Option<String> {
    rfd::FileDialog::new()
        .set_parent(&window)
        .set_title(&title)
        .add_filter("Executables", &["exe"])
        .pick_file()
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn start_encode(
    app: AppHandle,
    state: State<'_, AppState>,
    job: ProcessingJob,
    ffmpeg_exe: String,
    allow_overwrite: bool,
) -> Result<String, String> {
    // 1. Validation
    if job.input_path.is_empty() || !Path::new(&job.input_path).is_file() {
        return Err("No input video is loaded.".into());
    }
    if job.output_path.is_empty() {
        return Err("Choose an output file.".into());
    }
    if Path::new(&job.input_path) == Path::new(&job.output_path) {
        return Err("Output must be different from the input.\nThe source file is never overwritten.".into());
    }
    if Path::new(&job.output_path).exists() && !allow_overwrite {
        return Err("NEEDS_CONFIRM".into());
    }
    if job.crop.width < 2 || job.crop.height < 2 {
        return Err("Crop region is empty. Drag on the preview to select the area to keep.".into());
    }
    if job.output_width < 2 || job.output_height < 2 {
        return Err("Output resolution is invalid.".into());
    }

    let bw = job.crop.bound_w;
    let bh = job.crop.bound_h;
    if bw > 0 && (job.crop.x + job.crop.width > bw || job.crop.y + job.crop.height > bh) {
        return Err("Crop extends outside the video frame.".into());
    }

    // Ensure output parent directory exists
    let out_p = PathBuf::from(&job.output_path);
    if let Some(parent) = out_p.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }

    let argv = build_ffmpeg_args(&job, &ffmpeg_exe, true);
    let display_cmd = args_to_display(&argv);

    state
        .process_mgr
        .start(app, argv, out_p, job.duration)
        .await?;

    Ok(display_cmd)
}

#[tauri::command]
pub async fn cancel_encode(state: State<'_, AppState>) -> Result<(), String> {
    state.process_mgr.cancel().await
}

#[tauri::command]
pub fn get_diagnostics(
    ffmpeg_exe: Option<String>,
    ffprobe_exe: Option<String>,
) -> String {
    let ff = ffmpeg_exe.or_else(|| find_tool("ffmpeg", None)).unwrap_or_default();
    let fp = ffprobe_exe.or_else(|| find_tool("ffprobe", None)).unwrap_or_default();

    let ff_ver = if !ff.is_empty() {
        tool_version(&ff)
    } else {
        "not found".to_string()
    };
    let fp_ver = if !fp.is_empty() {
        tool_version(&fp)
    } else {
        "not found".to_string()
    };

    let os_info = format!("{} {}", std::env::consts::OS, std::env::consts::ARCH);

    format!(
        "Video Cropper 0.2.0 (Rust + Tauri v2)\nOS: {}\nffmpeg: {}\n  {}\nffprobe: {}\n  {}",
        os_info, ff, ff_ver, fp, fp_ver
    )
}

#[tauri::command]
pub fn get_settings() -> AppSettings {
    load_settings()
}

#[tauri::command]
pub fn set_settings(settings: AppSettings) -> Result<(), String> {
    save_settings(&settings)
}

#[tauri::command]
pub fn exit_app(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.close();
    } else {
        app.exit(0);
    }
}
