use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Child;
use tokio::sync::Mutex;

use crate::ffmpeg::progress::FfmpegProgressParser;

pub struct ProcessManager {
    child: Arc<Mutex<Option<Child>>>,
    cancelling: Arc<AtomicBool>,
    current_output: Arc<Mutex<Option<PathBuf>>>,
    stderr_tail: Arc<Mutex<Vec<String>>>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            cancelling: Arc::new(AtomicBool::new(false)),
            current_output: Arc::new(Mutex::new(None)),
            stderr_tail: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub async fn is_running(&self) -> bool {
        let child_guard = self.child.lock().await;
        child_guard.is_some()
    }

    pub async fn cancel(&self) -> Result<(), String> {
        self.cancelling.store(true, Ordering::SeqCst);
        let mut child_guard = self.child.lock().await;
        if let Some(mut child) = child_guard.take() {
            let _ = child.kill().await;
            let _ = child.wait().await;
        }

        // Clean up partial output file
        let mut output_guard = self.current_output.lock().await;
        if let Some(path) = output_guard.take() {
            if path.is_file() {
                let _ = tokio::fs::remove_file(&path).await;
            }
        }
        self.cancelling.store(false, Ordering::SeqCst);
        Ok(())
    }

    pub async fn start(
        &self,
        app: AppHandle,
        argv: Vec<String>,
        output_path: PathBuf,
        duration: f64,
    ) -> Result<(), String> {
        if self.is_running().await {
            return Err("An encoding process is already running.".to_string());
        }

        self.cancelling.store(false, Ordering::SeqCst);
        {
            let mut out_guard = self.current_output.lock().await;
            *out_guard = Some(output_path.clone());
            let mut err_guard = self.stderr_tail.lock().await;
            err_guard.clear();
        }

        let mut cmd = tokio::process::Command::new(&argv[0]);
        cmd.args(&argv[1..])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to start FFmpeg: {}", e))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to capture FFmpeg stdout".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Failed to capture FFmpeg stderr".to_string())?;

        {
            let mut child_guard = self.child.lock().await;
            *child_guard = Some(child);
        }

        let child_arc = self.child.clone();
        let cancelling_arc = self.cancelling.clone();
        let output_arc = self.current_output.clone();
        let stderr_arc = self.stderr_tail.clone();

        // Spawn background task to monitor stdout (progress)
        let app_clone = app.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            let mut parser = FfmpegProgressParser::new(duration);
            let start_t = Instant::now();

            while let Ok(Some(line)) = reader.next_line().await {
                let elapsed = start_t.elapsed().as_secs_f64();
                if let Some(upd) = parser.feed_line(&line, elapsed) {
                    let _ = app_clone.emit("ffmpeg-progress", &upd);
                }
            }
        });

        // Spawn background task to capture stderr tail
        let stderr_arc_clone = stderr_arc.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let mut tail = stderr_arc_clone.lock().await;
                tail.push(line);
                if tail.len() > 60 {
                    let trim_count = tail.len() - 60;
                    tail.drain(0..trim_count);
                }
            }
        });

        // Spawn task to await child process completion
        tokio::spawn(async move {
            let status_res = {
                let mut child_guard = child_arc.lock().await;
                if let Some(child) = child_guard.as_mut() {
                    child.wait().await
                } else {
                    return;
                }
            };

            // Process has finished, clear child handle
            {
                let mut child_guard = child_arc.lock().await;
                *child_guard = None;
            }

            let was_cancelling = cancelling_arc.load(Ordering::SeqCst);
            cancelling_arc.store(false, Ordering::SeqCst);

            if was_cancelling {
                // Remove partial output
                let mut out_guard = output_arc.lock().await;
                if let Some(path) = out_guard.take() {
                    if path.is_file() {
                        let _ = tokio::fs::remove_file(&path).await;
                    }
                }
                let _ = app.emit("ffmpeg-cancelled", ());
                return;
            }

            match status_res {
                Ok(status) if status.success() => {
                    let out_path = {
                        let out_guard = output_arc.lock().await;
                        out_guard.clone()
                    };
                    if let Some(path) = out_path {
                        if path.is_file() {
                            let _ = app.emit(
                                "ffmpeg-finished",
                                path.to_string_lossy().to_string(),
                            );
                            return;
                        }
                    }
                    let _ = app.emit(
                        "ffmpeg-failed",
                        "FFmpeg reported success but no output file was created.".to_string(),
                    );
                }
                Ok(_) => {
                    // Non-zero exit code
                    let mut out_guard = output_arc.lock().await;
                    if let Some(path) = out_guard.take() {
                        if path.is_file() {
                            let _ = tokio::fs::remove_file(&path).await;
                        }
                    }
                    let tail = stderr_arc.lock().await;
                    let last_lines = tail.iter().rev().take(25).cloned().collect::<Vec<_>>();
                    let details = last_lines.into_iter().rev().collect::<Vec<_>>().join("\n");
                    let mut msg = "Video processing failed.".to_string();
                    if details.contains("No such file") {
                        msg = "Video processing failed: input or output path is not accessible.".to_string();
                    } else if details.contains("Invalid argument") {
                        msg = "Video processing failed: invalid crop or encoder settings.".to_string();
                    }
                    if !details.is_empty() {
                        msg = format!("{}\n\nDetails:\n{}", msg, details);
                    }
                    let _ = app.emit("ffmpeg-failed", msg);
                }
                Err(e) => {
                    let _ = app.emit("ffmpeg-failed", format!("Error waiting for FFmpeg: {}", e));
                }
            }
        });

        Ok(())
    }
}
