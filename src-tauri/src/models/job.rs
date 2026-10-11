use serde::{Deserialize, Serialize};
use super::crop::CropConfig;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JobState {
    Idle,
    Validating,
    Running,
    Cancelling,
    Succeeded,
    Failed,
    Cancelled,
}

impl Default for JobState {
    fn default() -> Self {
        JobState::Idle
    }
}

pub struct EncoderId;
impl EncoderId {
    pub const LIBX264: &'static str = "libx264";
    pub const H264_NVENC: &'static str = "h264_nvenc";
    pub const HEVC_NVENC: &'static str = "hevc_nvenc";
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProcessingJob {
    pub input_path: String,
    pub output_path: String,
    pub crop: CropConfig,
    pub output_width: i32,
    pub output_height: i32,
    pub encoder: String,
    pub has_audio: bool,
    pub duration: f64,
    pub rotation: i32,
    #[serde(default)]
    pub state: JobState,
}

impl ProcessingJob {
    pub fn needs_scale(&self) -> bool {
        (self.output_width, self.output_height) != (self.crop.width, self.crop.height)
    }

    pub fn scale_factor(&self) -> f64 {
        if self.crop.width <= 0 {
            1.0
        } else {
            self.output_width as f64 / self.crop.width as f64
        }
    }
}

pub const OUTPUT_PRESETS: [&str; 6] = ["Original Crop", "720p", "1080p", "1440p", "4K", "Custom"];

pub fn preset_long_side(preset: &str) -> Option<i32> {
    match preset {
        "720p" => Some(1280),
        "1080p" => Some(1920),
        "1440p" => Some(2560),
        "4K" => Some(3840),
        _ => None,
    }
}

pub fn compute_output_size(
    crop_w: i32,
    crop_h: i32,
    preset: &str,
    custom_w: i32,
    custom_h: i32,
) -> (i32, i32) {
    if crop_w < 2 || crop_h < 2 {
        return (0, 0);
    }

    let (mut w, mut h) = if preset == "Custom" && custom_w >= 2 && custom_h >= 2 {
        (custom_w, custom_h)
    } else {
        match preset_long_side(preset) {
            None => (crop_w, crop_h), // Original Crop
            Some(target) => {
                let long_side = crop_w.max(crop_h);
                if long_side <= 0 {
                    (crop_w, crop_h)
                } else {
                    let factor = target as f64 / long_side as f64;
                    let nw = (crop_w as f64 * factor).round() as i32;
                    let nh = (crop_h as f64 * factor).round() as i32;
                    (nw.max(2), nh.max(2))
                }
            }
        }
    };

    // snap even (required for yuv420 H.264/H.265)
    w -= w % 2;
    h -= h % 2;
    (w.max(2), h.max(2))
}

pub fn is_upscale(crop_w: i32, crop_h: i32, out_w: i32, out_h: i32) -> bool {
    out_w > crop_w || out_h > crop_h
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_original_crop_size() {
        assert_eq!(compute_output_size(500, 300, "Original Crop", 0, 0), (500, 300));
        assert_eq!(compute_output_size(501, 301, "Original Crop", 0, 0), (500, 300));
    }

    #[test]
    fn test_preset_scaling() {
        // Landscape 16:9 1080p -> long side 1920
        let (w, h) = compute_output_size(800, 450, "1080p", 0, 0);
        assert_eq!(w, 1920);
        assert_eq!(h, 1080);

        // Portrait 9:16 1080p -> long side (height) 1920
        let (pw, ph) = compute_output_size(450, 800, "1080p", 0, 0);
        assert_eq!(pw, 1080);
        assert_eq!(ph, 1920);
    }

    #[test]
    fn test_upscale_check() {
        assert!(!is_upscale(1920, 1080, 1280, 720));
        assert!(is_upscale(1280, 720, 1920, 1080));
    }
}
