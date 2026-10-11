use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EncoderInfo {
    pub id: String,
    pub label: String,
    pub available: bool,
}

pub const WANTED_ENCODERS: [(&str, &str); 3] = [
    ("libx264", "CPU · H.264 (libx264)"),
    ("h264_nvenc", "NVIDIA NVENC · H.264"),
    ("hevc_nvenc", "NVIDIA NVENC · H.265"),
];

pub fn detect_encoders(ffmpeg_exe: &str) -> Vec<EncoderInfo> {
    let mut cmd = Command::new(ffmpeg_exe);
    cmd.args(["-hide_banner", "-encoders"]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output_text = match cmd.output() {
        Ok(out) => format!(
            "{}\n{}",
            String::from_utf8_lossy(&out.stdout),
            String::from_utf8_lossy(&out.stderr)
        ),
        Err(_) => String::new(),
    };

    WANTED_ENCODERS
        .iter()
        .map(|(id, label)| EncoderInfo {
            id: id.to_string(),
            label: label.to_string(),
            available: if output_text.is_empty() {
                *id == "libx264"
            } else {
                output_text.contains(id)
            },
        })
        .collect()
}

pub fn default_encoder(available: &[EncoderInfo]) -> String {
    for enc in available {
        if enc.id == "libx264" && enc.available {
            return "libx264".to_string();
        }
    }
    for enc in available {
        if enc.available {
            return enc.id.clone();
        }
    }
    "libx264".to_string()
}
