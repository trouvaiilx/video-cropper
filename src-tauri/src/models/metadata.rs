use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct VideoMetadata {
    pub path: String,
    pub display_width: i32,
    pub display_height: i32,
    pub stored_width: i32,
    pub stored_height: i32,
    pub rotation: i32, // 0, 90, 180, 270
    pub duration: f64,
    pub fps: f64,
    pub video_codec: String,
    pub pixel_format: String,
    pub bit_depth: i32,
    pub has_audio: bool,
    pub audio_codec: String,
    pub file_size: u64,
    pub container: String,
}

impl VideoMetadata {
    pub fn filename(&self) -> String {
        Path::new(&self.path)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string()
    }

    pub fn dimensions_label(&self) -> String {
        if self.rotation != 0 {
            format!("{} × {} (rotated {}°)", self.display_width, self.display_height, self.rotation)
        } else {
            format!("{} × {}", self.display_width, self.display_height)
        }
    }

    pub fn is_portrait(&self) -> bool {
        self.display_height > self.display_width
    }
}
