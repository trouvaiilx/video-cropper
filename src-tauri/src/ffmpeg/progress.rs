use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct ProgressUpdate {
    pub out_time_ms: i64,
    pub duration_ms: i64,
    pub percent: f64,
    pub speed: Option<f64>,
    pub frame: i64,
    pub eta_seconds: Option<f64>,
    pub elapsed_seconds: f64,
    pub done: bool,
}

pub fn parse_ffmpeg_speed(text: Option<&str>) -> Option<f64> {
    let s = text?.trim().to_lowercase();
    let s = s.trim_end_matches('x').trim();
    if s.is_empty() || s == "n/a" {
        return None;
    }
    s.parse::<f64>().ok()
}

pub fn compute_eta(elapsed: f64, frac: Option<f64>) -> Option<f64> {
    let f = frac?;
    if f <= 0.0001 || f >= 1.0 {
        return None;
    }
    Some(elapsed * (1.0 - f) / f)
}

#[derive(Debug)]
pub struct FfmpegProgressParser {
    pub duration_ms: i64,
    pub block: HashMap<String, String>,
    pub last: ProgressUpdate,
}

impl FfmpegProgressParser {
    pub fn new(duration_seconds: f64) -> Self {
        let dur_ms = (duration_seconds.max(0.0) * 1_000_000.0).round() as i64;
        Self {
            duration_ms: dur_ms,
            block: HashMap::new(),
            last: ProgressUpdate {
                duration_ms: dur_ms,
                ..Default::default()
            },
        }
    }

    pub fn reset(&mut self, duration_seconds: f64) {
        let dur_ms = (duration_seconds.max(0.0) * 1_000_000.0).round() as i64;
        self.duration_ms = dur_ms;
        self.block.clear();
        self.last = ProgressUpdate {
            duration_ms: dur_ms,
            ..Default::default()
        };
    }

    pub fn feed_line(&mut self, line: &str, elapsed_seconds: f64) -> Option<ProgressUpdate> {
        let text = line.trim();
        if text.is_empty() || !text.contains('=') {
            return None;
        }

        let mut parts = text.splitn(2, '=');
        let key = parts.next()?.trim().to_string();
        let value = parts.next()?.trim().to_string();

        self.block.insert(key.clone(), value.clone());

        if key == "progress" {
            let done = value == "end";
            Some(self.emit(elapsed_seconds, done))
        } else {
            None
        }
    }

    fn emit(&mut self, elapsed: f64, done: bool) -> ProgressUpdate {
        let out_ms = self
            .block
            .get("out_time_ms")
            .and_then(|s| s.parse::<f64>().ok())
            .map(|f| f.round() as i64)
            .unwrap_or(0);

        let frame = self
            .block
            .get("frame")
            .and_then(|s| s.parse::<f64>().ok())
            .map(|f| f.round() as i64)
            .unwrap_or(0);

        let speed = parse_ffmpeg_speed(self.block.get("speed").map(|s| s.as_str()));

        let mut percent = 0.0;
        if self.duration_ms > 0 && out_ms > 0 {
            percent = (out_ms as f64 / self.duration_ms as f64 * 100.0).clamp(0.0, 100.0);
        }
        if done {
            percent = 100.0;
        }

        let eta = if done {
            None
        } else {
            let frac = if percent > 0.0 {
                Some(percent / 100.0)
            } else {
                None
            };
            compute_eta(elapsed, frac)
        };

        let upd = ProgressUpdate {
            out_time_ms: out_ms,
            duration_ms: self.duration_ms,
            percent,
            speed,
            frame,
            eta_seconds: eta,
            elapsed_seconds: elapsed,
            done,
        };

        self.last = upd.clone();
        self.block.clear();
        upd
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_feed_block_and_emit() {
        let mut parser = FfmpegProgressParser::new(10.0); // 10s = 10_000_000 us
        assert!(parser.feed_line("frame=150", 1.0).is_none());
        assert!(parser.feed_line("out_time_ms=5000000", 1.0).is_none());
        assert!(parser.feed_line("speed=2.5x", 1.0).is_none());
        let upd = parser.feed_line("progress=continue", 2.0).unwrap();

        assert_eq!(upd.frame, 150);
        assert_eq!(upd.out_time_ms, 5_000_000);
        assert_eq!(upd.percent, 50.0);
        assert_eq!(upd.speed, Some(2.5));
        assert_eq!(upd.done, false);
        assert!((upd.eta_seconds.unwrap() - 2.0).abs() < 1e-4);
    }

    #[test]
    fn test_progress_end() {
        let mut parser = FfmpegProgressParser::new(10.0);
        let upd = parser.feed_line("progress=end", 5.0).unwrap();
        assert_eq!(upd.percent, 100.0);
        assert_eq!(upd.done, true);
        assert!(upd.eta_seconds.is_none());
    }
}
