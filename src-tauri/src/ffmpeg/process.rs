use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{watch, Mutex};

use crate::ffmpeg::progress::FfmpegProgressParser;

pub async fn remove_file_with_retry(path: &Path) {
    if !path.exists() {
        return;
    }

    let max_attempts = 30; // 30 * 100ms = 3.0s max
    for _ in 0..max_attempts {
        match tokio::fs::remove_file(path).await {
            Ok(()) => return,
            Err(_) => {
                if !path.exists() {
                    return;
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        }
    }
}

enum ProcessState {
    Idle,
    Running {
        cancel_tx: tokio::sync::oneshot::Sender<()>,
        done_rx: watch::Receiver<bool>,
    },
    Cancelling {
        done_rx: watch::Receiver<bool>,
    },
}

pub struct ProcessManager {
    state: Arc<Mutex<ProcessState>>,
    current_pid: Arc<AtomicU32>,
    cancelling: Arc<AtomicBool>,
    stderr_tail: Arc<Mutex<Vec<String>>>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(ProcessState::Idle)),
            current_pid: Arc::new(AtomicU32::new(0)),
            cancelling: Arc::new(AtomicBool::new(false)),
            stderr_tail: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub async fn is_running(&self) -> bool {
        let state = self.state.lock().await;
        matches!(*state, ProcessState::Running { .. } | ProcessState::Cancelling { .. })
    }

    pub async fn is_cancelling(&self) -> bool {
        let state = self.state.lock().await;
        matches!(*state, ProcessState::Cancelling { .. })
    }

    pub async fn cancel(&self) -> Result<(), String> {
        let mut done_rx = {
            let mut state = self.state.lock().await;
            match &mut *state {
                ProcessState::Idle => {
                    return Ok(());
                }
                ProcessState::Cancelling { done_rx } => {
                    // Already cancelling, share the completion receiver
                    done_rx.clone()
                }
                ProcessState::Running { .. } => {
                    let old_state = std::mem::replace(&mut *state, ProcessState::Idle);
                    if let ProcessState::Running { cancel_tx, done_rx, .. } = old_state {
                        self.cancelling.store(true, Ordering::SeqCst);
                        let _ = cancel_tx.send(());
                        *state = ProcessState::Cancelling { done_rx: done_rx.clone() };
                        done_rx
                    } else {
                        return Ok(());
                    }
                }
            }
        };

        // Await process termination and file cleanup outside of mutex lock
        let _ = done_rx.wait_for(|&done| done).await;
        Ok(())
    }

    /// Abort synchronously (e.g. when app is exiting to avoid leaving orphaned background FFmpeg processes)
    pub fn abort(&self) {
        self.cancelling.store(true, Ordering::SeqCst);
        let pid = self.current_pid.load(Ordering::SeqCst);
        if pid != 0 {
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                let _ = std::process::Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .creation_flags(CREATE_NO_WINDOW)
                    .spawn();
            }
            #[cfg(not(windows))]
            {
                let _ = std::process::Command::new("kill")
                    .args(["-9", &pid.to_string()])
                    .spawn();
            }
        }
    }

    pub async fn start(
        &self,
        app: AppHandle,
        argv: Vec<String>,
        output_path: PathBuf,
        duration: f64,
    ) -> Result<(), String> {
        {
            let state = self.state.lock().await;
            match &*state {
                ProcessState::Running { .. } => {
                    return Err("An encoding process is already running.".to_string());
                }
                ProcessState::Cancelling { .. } => {
                    return Err("Previous process is still cancelling. Please wait.".to_string());
                }
                ProcessState::Idle => {}
            }
        }

        self.cancelling.store(false, Ordering::SeqCst);
        {
            let mut err_guard = self.stderr_tail.lock().await;
            err_guard.clear();
        }

        let mut cmd = tokio::process::Command::new(&argv[0]);
        cmd.args(&argv[1..])
            .stdin(Stdio::piped())
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

        let pid = child.id().unwrap_or(0);
        self.current_pid.store(pid, Ordering::SeqCst);

        let stdin = child.stdin.take();
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to capture FFmpeg stdout".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Failed to capture FFmpeg stderr".to_string())?;

        let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();
        let (done_tx, done_rx) = watch::channel(false);

        {
            let mut state = self.state.lock().await;
            *state = ProcessState::Running {
                cancel_tx,
                done_rx,
            };
        }

        let state_arc = self.state.clone();
        let current_pid = self.current_pid.clone();
        let cancelling_arc = self.cancelling.clone();
        let stderr_arc = self.stderr_tail.clone();

        // Spawn background task to monitor stdout (progress)
        let app_clone = app.clone();
        let cancelling_progress = self.cancelling.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            let mut parser = FfmpegProgressParser::new(duration);
            let start_t = Instant::now();

            while let Ok(Some(line)) = reader.next_line().await {
                if cancelling_progress.load(Ordering::SeqCst) {
                    break;
                }
                let elapsed = start_t.elapsed().as_secs_f64();
                if let Some(upd) = parser.feed_line(&line, elapsed) {
                    if !cancelling_progress.load(Ordering::SeqCst) {
                        let _ = app_clone.emit("ffmpeg-progress", &upd);
                    }
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

        // Spawn background supervisor to await completion or cancellation
        let out_path = output_path.clone();
        tokio::spawn(async move {
            let mut stdin = stdin;
            let mut was_cancelled = false;

            tokio::select! {
                biased;
                _ = &mut cancel_rx => {
                    was_cancelled = true;
                    cancelling_arc.store(true, Ordering::SeqCst);

                    // 1. Graceful exit: send 'q' to FFmpeg's stdin
                    if let Some(mut sin) = stdin.take() {
                        let _ = sin.write_all(b"q\n").await;
                        let _ = sin.flush().await;
                        drop(sin);
                    }

                    // 2. Allow up to 2 seconds for clean shutdown
                    let graceful_exit = tokio::time::timeout(
                        Duration::from_millis(2000),
                        child.wait()
                    ).await;

                    match graceful_exit {
                        Ok(Ok(_)) => {
                            // Exited gracefully
                        }
                        _ => {
                            // Force kill if graceful exit timed out or errored
                            let _ = child.kill().await;
                            let _ = child.wait().await;
                        }
                    }
                }
                status_res = child.wait() => {
                    current_pid.store(0, Ordering::SeqCst);
                    match status_res {
                        Ok(status) if status.success() => {
                            {
                                let mut state = state_arc.lock().await;
                                *state = ProcessState::Idle;
                            }
                            let _ = done_tx.send(true);

                            if out_path.is_file() {
                                let _ = app.emit(
                                    "ffmpeg-finished",
                                    out_path.to_string_lossy().to_string(),
                                );
                            } else {
                                let _ = app.emit(
                                    "ffmpeg-failed",
                                    "FFmpeg reported success but no output file was created.".to_string(),
                                );
                            }
                            return;
                        }
                        Ok(_) => {
                            // Non-zero exit code
                        }
                        Err(_) => {
                            // Wait error
                        }
                    }
                }
            }

            current_pid.store(0, Ordering::SeqCst);

            if was_cancelled {
                // Ensure partial output file is deleted (retrying if temporarily locked by OS/antivirus)
                remove_file_with_retry(&out_path).await;
                cancelling_arc.store(false, Ordering::SeqCst);

                {
                    let mut state = state_arc.lock().await;
                    *state = ProcessState::Idle;
                }
                let _ = done_tx.send(true);
                let _ = app.emit("ffmpeg-cancelled", ());
                return;
            }

            // Normal failure cleanup
            remove_file_with_retry(&out_path).await;

            {
                let mut state = state_arc.lock().await;
                *state = ProcessState::Idle;
            }
            let _ = done_tx.send(true);

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
        });

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_process_manager_idle() {
        let mgr = ProcessManager::new();
        assert!(!mgr.is_running().await);
        assert!(!mgr.is_cancelling().await);
        // Cancelling while idle should succeed immediately
        assert!(mgr.cancel().await.is_ok());
    }

    #[tokio::test]
    async fn test_remove_file_with_retry() {
        let temp_dir = tempfile::tempdir().unwrap();
        let test_file = temp_dir.path().join("test_partial.mp4");
        tokio::fs::write(&test_file, b"test video data").await.unwrap();
        assert!(test_file.exists());

        remove_file_with_retry(&test_file).await;
        assert!(!test_file.exists());

        // Calling on non-existent file is safe
        remove_file_with_retry(&test_file).await;
    }
}
