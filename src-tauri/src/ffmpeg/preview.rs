use base64::Engine;
use std::fs;
use std::path::Path;
use std::process::Command;

pub fn preview_seek_time(duration: f64) -> f64 {
    if duration <= 0.0 {
        1.0
    } else {
        (duration * 0.1).clamp(0.5, 10.0)
    }
}

pub fn extract_preview(
    input_path: &str,
    ffmpeg_exe: &str,
    seek_time: Option<f64>,
    max_width: Option<i32>,
) -> Result<String, String> {
    let p = Path::new(input_path);
    if !p.is_file() {
        return Err(format!("File not found: {}", input_path));
    }

    let seek = seek_time.unwrap_or(1.0).max(0.0);
    let mw = max_width.unwrap_or(1920);

    let temp_file = tempfile::Builder::new()
        .suffix(".jpg")
        .tempfile()
        .map_err(|e| format!("Failed to create temp file: {}", e))?;
    let temp_path = temp_file.path().to_path_buf();

    let scale_arg = format!("scale=w='min(iw,{})':h=-2", mw);

    let mut cmd = Command::new(ffmpeg_exe);
    cmd.args([
        "-hide_banner",
        "-v",
        "error",
        "-ss",
        &format!("{:.3}", seek),
        "-i",
        input_path,
        "-frames:v",
        "1",
        "-vf",
        &scale_arg,
        "-q:v",
        "3",
        "-y",
    ]);
    cmd.arg(&temp_path);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("ffmpeg could not be started: {}", e))?;

    if !output.status.success() || !temp_path.is_file() {
        let err_text = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Could not extract preview frame:\n{}",
            err_text.trim()
        ));
    }

    let bytes = fs::read(&temp_path)
        .map_err(|e| format!("Failed to read preview frame: {}", e))?;

    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:image/jpeg;base64,{}", b64))
}
