use crate::models::VideoMetadata;
use serde_json::Value;
use std::fs;
use std::path::Path;
use std::process::Command;

pub fn parse_fps(val: &Value) -> f64 {
    if let Some(n) = val.as_f64() {
        return n;
    }
    if let Some(s) = val.as_str() {
        let s = s.trim();
        if s.contains('/') {
            let mut parts = s.split('/');
            let n: f64 = parts.next().unwrap_or("0").parse().unwrap_or(0.0);
            let d: f64 = parts.next().unwrap_or("1").parse().unwrap_or(1.0);
            if d > 0.0 {
                return n / d;
            }
        } else if let Ok(n) = s.parse::<f64>() {
            return n;
        }
    }
    0.0
}

pub fn rotation_of(stream: &Value, tags: &Value) -> i32 {
    for key in ["rotate", "rotation"] {
        if let Some(v) = tags.get(key) {
            let s = v.as_str().map(|s| s.to_string()).or_else(|| v.as_f64().map(|n| n.to_string()));
            if let Some(st) = s {
                if let Ok(num) = st.parse::<f64>() {
                    let r = num.round() as i32;
                    return ((r % 360) + 360) % 360;
                }
            }
        }
    }

    if let Some(side_data) = stream.get("side_data_list").and_then(|v| v.as_array()) {
        for sd in side_data {
            if let Some(r_val) = sd.get("rotation") {
                let rot = r_val.as_f64().unwrap_or(0.0);
                let r = rot.round() as i32;
                return ((r % 360) + 360) % 360;
            }
        }
    }

    0
}

pub fn pix_fmt_depth(pix_fmt: &str) -> i32 {
    let pf = pix_fmt.to_lowercase();
    for t in ["12le", "12be", "p012", "yuv444p12", "yuv420p12"] {
        if pf.contains(t) {
            return 12;
        }
    }
    for t in ["10le", "10be", "p010", "yuv444p10", "yuv420p10"] {
        if pf.contains(t) {
            return 10;
        }
    }
    8
}

pub fn metadata_from_probe(
    vs: &Value,
    fmt: &Value,
    path: &str,
    file_size: u64,
) -> Result<VideoMetadata, String> {
    let tags = vs.get("tags").cloned().unwrap_or(Value::Null);

    let stored_w = vs
        .get("width")
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;
    let stored_h = vs
        .get("height")
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;

    let rot = rotation_of(vs, &tags);
    let rotation = (rot / 90 * 90) % 360;

    let (disp_w, disp_h) = if rotation == 90 || rotation == 270 {
        (stored_h, stored_w)
    } else {
        (stored_w, stored_h)
    };

    if disp_w < 2 || disp_h < 2 {
        return Err("Video dimensions could not be determined.".to_string());
    }

    let mut duration = 0.0;
    for raw in [vs.get("duration"), fmt.get("duration")] {
        if let Some(v) = raw {
            if let Some(d) = v.as_f64() {
                if d > 0.0 {
                    duration = d;
                    break;
                }
            } else if let Some(s) = v.as_str() {
                if let Ok(d) = s.parse::<f64>() {
                    if d > 0.0 {
                        duration = d;
                        break;
                    }
                }
            }
        }
    }

    let fps = parse_fps(
        vs.get("avg_frame_rate")
            .unwrap_or(&vs.get("r_frame_rate").cloned().unwrap_or(Value::Null)),
    );

    let pix_fmt = vs
        .get("pix_fmt")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let bit_depth = pix_fmt_depth(&pix_fmt);

    let container = fmt
        .get("format_name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .split(',')
        .next()
        .unwrap_or("")
        .to_string();

    Ok(VideoMetadata {
        path: path.to_string(),
        display_width: disp_w,
        display_height: disp_h,
        stored_width: stored_w,
        stored_height: stored_h,
        rotation,
        duration,
        fps,
        video_codec: vs
            .get("codec_name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        pixel_format: pix_fmt,
        bit_depth,
        has_audio: false, // set separately by probe_video
        audio_codec: String::new(),
        file_size,
        container,
    })
}

pub fn has_audio(path: &str, ffprobe_exe: &str) -> bool {
    let mut cmd = Command::new(ffprobe_exe);
    cmd.args([
        "-v",
        "error",
        "-select_streams",
        "a",
        "-show_entries",
        "stream=codec_name",
        "-of",
        "csv=p=0",
        path,
    ]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    match cmd.output() {
        Ok(out) => {
            let s = String::from_utf8_lossy(&out.stdout);
            !s.trim().is_empty()
        }
        Err(_) => false,
    }
}

pub fn probe_video(path: &str, ffprobe_exe: &str) -> Result<VideoMetadata, String> {
    let p = Path::new(path);
    if !p.is_file() {
        return Err(format!("File not found: {}", path));
    }

    let mut cmd = Command::new(ffprobe_exe);
    cmd.args([
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,codec_name,avg_frame_rate,r_frame_rate,pix_fmt,duration,display_aspect_ratio,codec_type:stream_tags=rotate,rotation:format=duration,size,format_name",
        "-of",
        "json",
        path,
    ]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("ffprobe could not be started: {}", e))?;

    if !output.status.success() {
        let err_text = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe failed:\n{}", err_text.trim()));
    }

    let json_text = String::from_utf8_lossy(&output.stdout);
    let data: Value = serde_json::from_str(&json_text)
        .map_err(|e| format!("ffprobe returned invalid json: {}", e))?;

    let streams = data
        .get("streams")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "No video stream found in this file.".to_string())?;

    if streams.is_empty() {
        return Err("No video stream found in this file.".to_string());
    }

    let vs = &streams[0];
    let fmt = data.get("format").cloned().unwrap_or(Value::Null);

    let file_size = fmt
        .get("size")
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<u64>().ok())
        .or_else(|| fs::metadata(p).map(|m| m.len()).ok())
        .unwrap_or(0);

    let mut meta = metadata_from_probe(vs, &fmt, path, file_size)?;
    meta.has_audio = has_audio(path, ffprobe_exe);
    Ok(meta)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_no_rotation_keeps_dims() {
        let vs = json!({
            "width": 1920,
            "height": 1080,
            "codec_name": "h264",
            "avg_frame_rate": "30/1",
            "pix_fmt": "yuv420p"
        });
        let fmt = json!({});
        let meta = metadata_from_probe(&vs, &fmt, "a.mp4", 1000).unwrap();
        assert_eq!((meta.display_width, meta.display_height), (1920, 1080));
        assert_eq!(meta.rotation, 0);
    }

    #[test]
    fn test_rotate_90_swaps_dims() {
        let vs = json!({
            "width": 1920,
            "height": 1080,
            "codec_name": "h264",
            "tags": { "rotate": "90" }
        });
        let fmt = json!({});
        let meta = metadata_from_probe(&vs, &fmt, "a.mp4", 1000).unwrap();
        assert_eq!((meta.display_width, meta.display_height), (1080, 1920));
        assert_eq!(meta.rotation, 90);
    }

    #[test]
    fn test_rotate_270_swaps_dims() {
        let vs = json!({
            "width": 1920,
            "height": 1080,
            "codec_name": "h264",
            "tags": { "rotation": "270" }
        });
        let fmt = json!({});
        let meta = metadata_from_probe(&vs, &fmt, "a.mp4", 1000).unwrap();
        assert_eq!((meta.display_width, meta.display_height), (1080, 1920));
        assert_eq!(meta.rotation, 270);
    }

    #[test]
    fn test_side_data_matrix_rotation() {
        let vs = json!({
            "width": 1920,
            "height": 1080,
            "codec_name": "h264",
            "side_data_list": [{ "rotation": -90 }]
        });
        let fmt = json!({});
        let meta = metadata_from_probe(&vs, &fmt, "a.mp4", 1000).unwrap();
        assert_eq!(meta.rotation, 270);
        assert_eq!((meta.display_width, meta.display_height), (1080, 1920));
    }

    #[test]
    fn test_fps_and_duration() {
        let vs = json!({
            "width": 1920,
            "height": 1080,
            "avg_frame_rate": "30000/1001",
            "pix_fmt": "yuv420p10le"
        });
        let fmt = json!({ "duration": "63.5" });
        let meta = metadata_from_probe(&vs, &fmt, "a.mp4", 1000).unwrap();
        assert!((meta.fps - 29.97).abs() < 0.01);
        assert!((meta.duration - 63.5).abs() < 0.001);
        assert_eq!(meta.bit_depth, 10);
    }
}
