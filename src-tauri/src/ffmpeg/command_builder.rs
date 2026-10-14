use crate::models::{EncoderId, ProcessingJob};

fn even(v: i32) -> i32 {
    v - (v % 2)
}

pub fn build_video_filter(job: &ProcessingJob) -> String {
    let mut parts = Vec::new();

    let rot = ((job.user_rotation % 360) + 360) % 360;
    match rot {
        90 => parts.push("transpose=1".to_string()),
        180 => parts.push("hflip,vflip".to_string()),
        270 => parts.push("transpose=2".to_string()),
        _ => {}
    }

    let c = &job.crop;
    let x = even(c.x.max(0));
    let y = even(c.y.max(0));
    let w = even(c.width.max(2));
    let h = even(c.height.max(2));

    parts.push(format!("crop={}:{}:{}:{}", w, h, x, y));
    if job.needs_scale() {
        let ow = even(job.output_width.max(2));
        let oh = even(job.output_height.max(2));
        parts.push(format!("scale={}:{}:flags=lanczos", ow, oh));
    }
    parts.join(",")
}

pub fn encoder_args(encoder: &str) -> Vec<String> {
    match encoder {
        EncoderId::H264_NVENC => vec![
            "-c:v".into(),
            "h264_nvenc".into(),
            "-preset".into(),
            "p4".into(),
            "-cq".into(),
            "21".into(),
            "-pix_fmt".into(),
            "yuv420p".into(),
        ],
        EncoderId::HEVC_NVENC => vec![
            "-c:v".into(),
            "hevc_nvenc".into(),
            "-preset".into(),
            "p4".into(),
            "-cq".into(),
            "23".into(),
            "-pix_fmt".into(),
            "yuv420p".into(),
        ],
        _ => vec![
            "-c:v".into(),
            "libx264".into(),
            "-preset".into(),
            "medium".into(),
            "-crf".into(),
            "18".into(),
            "-pix_fmt".into(),
            "yuv420p".into(),
        ],
    }
}

pub fn build_ffmpeg_args(
    job: &ProcessingJob,
    ffmpeg_exe: &str,
    overwrite: bool,
) -> Vec<String> {
    let vf = build_video_filter(job);
    let mut args: Vec<String> = vec![
        ffmpeg_exe.to_string(),
        "-hide_banner".into(),
        if overwrite { "-y".into() } else { "-n".into() },
        "-i".into(),
        job.input_path.clone(),
        "-vf".into(),
        vf,
        "-map".into(),
        "0:v:0".into(),
        "-map".into(),
        "0:a?".into(),
    ];

    args.extend(encoder_args(&job.encoder));

    if job.has_audio {
        args.extend(vec!["-c:a".into(), "copy".into()]);
    }

    args.extend(vec!["-map_metadata".into(), "0".into()]);

    if job.rotation != 0 || job.user_rotation != 0 {
        args.extend(vec!["-metadata:s:v:0".into(), "rotate=0".into()]);
    }

    args.extend(vec![
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        "-stats_period".into(),
        "0.5".into(),
        job.output_path.clone(),
    ]);

    args
}

pub fn args_to_display(argv: &[String]) -> String {
    let mut out: Vec<String> = Vec::new();
    for a in argv {
        if a.is_empty() || a.contains(' ') || a.contains('"') || a.contains('\'') {
            out.push(format!("\"{}\"", a.replace('"', "\\\"")));
        } else {
            out.push(a.clone());
        }
    }
    out.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::CropConfig;

    fn make_test_job(output_width: i32, output_height: i32) -> ProcessingJob {
        ProcessingJob {
            input_path: "in.mp4".into(),
            output_path: "out.mp4".into(),
            crop: CropConfig {
                x: 420,
                y: 0,
                width: 1080,
                height: 1920,
                bound_w: 1920,
                bound_h: 1920,
            },
            output_width,
            output_height,
            encoder: "libx264".into(),
            has_audio: true,
            duration: 60.0,
            rotation: 0,
            user_rotation: 0,
            state: Default::default(),
        }
    }

    #[test]
    fn test_crop_only_no_scale() {
        let j = make_test_job(1080, 1920);
        assert_eq!(build_video_filter(&j), "crop=1080:1920:420:0");
        let args = build_ffmpeg_args(&j, "ffmpeg", false);
        assert!(args.contains(&"-vf".to_string()));
        assert!(args.contains(&"crop=1080:1920:420:0".to_string()));
        assert!(!args.join(" ").contains("scale="));
        assert_eq!(args.last().unwrap(), "out.mp4");
    }

    #[test]
    fn test_crop_plus_scale() {
        let j = make_test_job(540, 960);
        let vf = build_video_filter(&j);
        assert_eq!(vf, "crop=1080:1920:420:0,scale=540:960:flags=lanczos");
    }

    #[test]
    fn test_user_rotation_filters() {
        let mut j = make_test_job(1080, 1920);
        j.user_rotation = 90;
        assert_eq!(build_video_filter(&j), "transpose=1,crop=1080:1920:420:0");
        let args90 = build_ffmpeg_args(&j, "ffmpeg", false);
        assert!(args90.contains(&"rotate=0".to_string()));

        j.user_rotation = 180;
        assert_eq!(build_video_filter(&j), "hflip,vflip,crop=1080:1920:420:0");

        j.user_rotation = 270;
        assert_eq!(build_video_filter(&j), "transpose=2,crop=1080:1920:420:0");

        // With scale
        j.output_width = 540;
        j.output_height = 960;
        assert_eq!(
            build_video_filter(&j),
            "transpose=2,crop=1080:1920:420:0,scale=540:960:flags=lanczos"
        );
    }

    #[test]
    fn test_odd_dims_snapped_even() {
        let mut j = make_test_job(541, 961);
        j.crop = CropConfig {
            x: 421,
            y: 1,
            width: 1081,
            height: 1919,
            bound_w: 1920,
            bound_h: 1920,
        };
        let vf = build_video_filter(&j);
        assert_eq!(vf, "crop=1080:1918:420:0,scale=540:960:flags=lanczos");
    }

    #[test]
    fn test_encoder_variants() {
        let mut j = make_test_job(1080, 1920);
        let cpu = build_ffmpeg_args(&j, "ffmpeg", false);
        assert!(cpu.contains(&"libx264".to_string()) && cpu.contains(&"-crf".to_string()));

        j.encoder = EncoderId::H264_NVENC.to_string();
        let nv = build_ffmpeg_args(&j, "ffmpeg", false);
        assert!(nv.contains(&"h264_nvenc".to_string()) && nv.contains(&"-cq".to_string()));
    }

    #[test]
    fn test_audio_and_rotation_handling() {
        let mut j = make_test_job(1080, 1920);
        j.has_audio = false;
        let no_audio = build_ffmpeg_args(&j, "ffmpeg", false);
        assert!(no_audio.contains(&"0:a?".to_string()));
        assert!(!no_audio.contains(&"-c:a".to_string()));

        j.rotation = 90;
        let rot = build_ffmpeg_args(&j, "ffmpeg", false);
        assert!(rot.contains(&"rotate=0".to_string()));
    }
}
