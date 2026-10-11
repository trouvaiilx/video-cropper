use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub last_dir: String,
    pub last_output_dir: String,
    pub encoder: String,
    pub ratio: String,
    pub resolution_preset: String,
    pub ffmpeg_path: String,
    pub ffprobe_path: String,
    pub show_thirds: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            last_dir: String::new(),
            last_output_dir: String::new(),
            encoder: "libx264".into(),
            ratio: "Free".into(),
            resolution_preset: "Original Crop".into(),
            ffmpeg_path: String::new(),
            ffprobe_path: String::new(),
            show_thirds: true,
        }
    }
}

pub fn get_settings_path() -> PathBuf {
    let mut base = if let Ok(app_data) = std::env::var("APPDATA") {
        PathBuf::from(app_data)
    } else {
        std::env::temp_dir()
    };
    base.push("VideoCropper");
    let _ = fs::create_dir_all(&base);
    base.join("settings.json")
}

pub fn load_settings() -> AppSettings {
    let path = get_settings_path();
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(settings) = serde_json::from_str::<AppSettings>(&content) {
            return settings;
        }
    }
    AppSettings::default()
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let path = get_settings_path();
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write settings: {}", e))?;
    Ok(())
}
