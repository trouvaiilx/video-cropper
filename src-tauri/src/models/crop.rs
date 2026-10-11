use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AspectRatio {
    pub label: String,
    pub num: Option<f64>,
    pub den: Option<f64>,
}

impl AspectRatio {
    pub fn new(label: &str, num: Option<f64>, den: Option<f64>) -> Self {
        Self {
            label: label.to_string(),
            num,
            den,
        }
    }

    pub fn value(&self) -> Option<f64> {
        match (self.num, self.den) {
            (Some(n), Some(d)) if d > 0.0 => Some(n / d),
            _ => None,
        }
    }
}

pub fn preset_ratios() -> Vec<AspectRatio> {
    vec![
        AspectRatio::new("Free", None, None),
        AspectRatio::new("16:9", Some(16.0), Some(9.0)),
        AspectRatio::new("9:16", Some(9.0), Some(16.0)),
        AspectRatio::new("4:3", Some(4.0), Some(3.0)),
        AspectRatio::new("3:4", Some(3.0), Some(4.0)),
        AspectRatio::new("1:1", Some(1.0), Some(1.0)),
        AspectRatio::new("4:5", Some(4.0), Some(5.0)),
        AspectRatio::new("5:4", Some(5.0), Some(4.0)),
    ]
}

pub fn ratio_by_label(label: &str) -> AspectRatio {
    for r in preset_ratios() {
        if r.label.eq_ignore_ascii_case(label) {
            return r;
        }
    }
    if let Some(parsed) = parse_custom_ratio(label) {
        return parsed;
    }
    AspectRatio::new("Free", None, None)
}

pub fn parse_custom_ratio(text: &str) -> Option<AspectRatio> {
    let t = text.trim().to_lowercase().replace('/', ":");
    if !t.contains(':') {
        return None;
    }
    let mut parts = t.split(':');
    let left = parts.next()?.trim();
    let right = parts.next()?.trim();
    let num: f64 = left.parse().ok()?;
    let den: f64 = right.parse().ok()?;
    if num <= 0.0 || den <= 0.0 {
        return None;
    }
    Some(AspectRatio::new(&format!("{}:{}", num, den), Some(num), Some(den)))
}

fn clamp(val: i32, min_val: i32, max_val: i32) -> i32 {
    val.max(min_val).min(max_val)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct CropConfig {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub bound_w: i32,
    pub bound_h: i32,
}

impl CropConfig {
    pub fn is_valid(&self) -> bool {
        self.width >= 2 && self.height >= 2 && self.bound_w >= 2 && self.bound_h >= 2
    }

    pub fn area(&self) -> i32 {
        self.width.max(0) * self.height.max(0)
    }

    pub fn clamped(&self) -> Self {
        let w = if self.bound_w > 0 {
            clamp(self.width, 2, self.bound_w.max(2))
        } else {
            self.width.max(2)
        };
        let h = if self.bound_h > 0 {
            clamp(self.height, 2, self.bound_h.max(2))
        } else {
            self.height.max(2)
        };
        let x = if self.bound_w > 0 {
            clamp(self.x, 0, (self.bound_w - w).max(0))
        } else {
            self.x.max(0)
        };
        let y = if self.bound_h > 0 {
            clamp(self.y, 0, (self.bound_h - h).max(0))
        } else {
            self.y.max(0)
        };

        CropConfig {
            x,
            y,
            width: w,
            height: h,
            bound_w: self.bound_w,
            bound_h: self.bound_h,
        }
    }

    pub fn moved(&self, x: i32, y: i32) -> Self {
        CropConfig {
            x,
            y,
            width: self.width,
            height: self.height,
            bound_w: self.bound_w,
            bound_h: self.bound_h,
        }
        .clamped()
    }

    pub fn resized(&self, w: i32, h: i32, anchor_center: bool) -> Self {
        let (nx, ny) = if anchor_center && self.is_valid() {
            let cx = self.x as f64 + self.width as f64 / 2.0;
            let cy = self.y as f64 + self.height as f64 / 2.0;
            (
                (cx - w as f64 / 2.0).round() as i32,
                (cy - h as f64 / 2.0).round() as i32,
            )
        } else {
            (self.x, self.y)
        };

        CropConfig {
            x: nx,
            y: ny,
            width: w.max(2),
            height: h.max(2),
            bound_w: self.bound_w,
            bound_h: self.bound_h,
        }
        .clamped()
    }

    pub fn full_frame(&self) -> Self {
        CropConfig {
            x: 0,
            y: 0,
            width: self.bound_w,
            height: self.bound_h,
            bound_w: self.bound_w,
            bound_h: self.bound_h,
        }
        .clamped()
    }

    pub fn apply_ratio(&self, ratio: &AspectRatio) -> Self {
        let Some(value) = ratio.value() else {
            return self.clamped();
        };
        if !self.is_valid() {
            return self.clamped();
        }

        let w = self.width as f64;
        let h = self.height as f64;
        let h_from_w = w / value;

        let (nw, nh) = if h_from_w <= h {
            (w, h_from_w.round())
        } else {
            ((h * value).round(), h)
        };

        let nw = (nw as i32).max(2);
        let nh = (nh as i32).max(2);

        let cx = self.x as f64 + self.width as f64 / 2.0;
        let cy = self.y as f64 + self.height as f64 / 2.0;

        let out = CropConfig {
            x: (cx - nw as f64 / 2.0).round() as i32,
            y: (cy - nh as f64 / 2.0).round() as i32,
            width: nw,
            height: nh,
            bound_w: self.bound_w,
            bound_h: self.bound_h,
        }
        .clamped();

        out.refit_ratio(value)
    }

    fn refit_ratio(&self, value: f64) -> Self {
        let w = self.width as f64;
        let h = self.height as f64;
        let h_from_w = w / value;

        if (h_from_w - h).abs() <= 1.0 {
            let (nw, nh) = if h_from_w < h {
                (w as i32, (h_from_w.round() as i32).max(2))
            } else {
                (((h * value).round() as i32).max(2), h as i32)
            };
            let y = self.y.min((self.bound_h - nh).max(0));
            let x = self.x.min((self.bound_w - nw).max(0));

            CropConfig {
                x,
                y,
                width: nw,
                height: nh,
                bound_w: self.bound_w,
                bound_h: self.bound_h,
            }
            .clamped()
        } else {
            *self
        }
    }

    pub fn matches_ratio(&self, ratio: &AspectRatio, tol: f64) -> bool {
        let Some(value) = ratio.value() else {
            return true;
        };
        if self.height == 0 {
            return true;
        }
        ((self.width as f64 / self.height as f64) - value).abs() <= tol
    }

    pub fn to_filter(&self) -> String {
        let c = self.clamped();
        format!("crop={}:{}:{}:{}", c.width, c.height, c.x, c.y)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_crop_clamped_within_bounds() {
        let c = CropConfig {
            x: -10,
            y: -5,
            width: 2500,
            height: 1500,
            bound_w: 1920,
            bound_h: 1080,
        };
        let clamped = c.clamped();
        assert_eq!(clamped.x, 0);
        assert_eq!(clamped.y, 0);
        assert_eq!(clamped.width, 1920);
        assert_eq!(clamped.height, 1080);
    }

    #[test]
    fn test_crop_move_and_resize() {
        let c = CropConfig {
            x: 100,
            y: 100,
            width: 800,
            height: 600,
            bound_w: 1920,
            bound_h: 1080,
        };
        let moved = c.moved(1500, 800);
        assert_eq!(moved.x, 1920 - 800);
        assert_eq!(moved.y, 1080 - 600);

        let resized = c.resized(400, 300, true);
        assert_eq!(resized.width, 400);
        assert_eq!(resized.height, 300);
        assert_eq!(resized.x, 300);
        assert_eq!(resized.y, 250);
    }

    #[test]
    fn test_custom_ratio_parsing() {
        let r = parse_custom_ratio("16:9").unwrap();
        assert_eq!(r.num, Some(16.0));
        assert_eq!(r.den, Some(9.0));

        let r2 = parse_custom_ratio("2.35/1").unwrap();
        assert!((r2.value().unwrap() - 2.35).abs() < 1e-4);

        assert!(parse_custom_ratio("invalid").is_none());
        assert!(parse_custom_ratio("-1:2").is_none());
    }

    #[test]
    fn test_ratio_application() {
        let c = CropConfig {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            bound_w: 1920,
            bound_h: 1080,
        };
        let square = AspectRatio::new("1:1", Some(1.0), Some(1.0));
        let applied = c.apply_ratio(&square);
        assert_eq!(applied.width, 1080);
        assert_eq!(applied.height, 1080);
        assert_eq!(applied.x, (1920 - 1080) / 2);
        assert_eq!(applied.y, 0);
    }
}
