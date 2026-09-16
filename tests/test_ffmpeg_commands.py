"""FFmpeg command generation: crop, scale, encoders, audio, rotation."""

from video_cropper.ffmpeg.command_builder import (
    args_to_display, build_ffmpeg_args, build_video_filter,
)
from video_cropper.models.crop_config import CropConfig
from video_cropper.models.processing_job import ProcessingJob


def _job(**kw):
    base = dict(
        input_path="in.mp4", output_path="out.mp4",
        crop=CropConfig(x=420, y=0, width=1080, height=1920,
                        bound_w=1920, bound_h=1920),
        output_width=1080, output_height=1920,
        encoder="libx264", has_audio=True, duration=60.0, rotation=0,
    )
    base.update(kw)
    return ProcessingJob(**base)


def test_crop_only_no_scale():
    j = _job()
    assert build_video_filter(j) == "crop=1080:1920:420:0"
    argv = build_ffmpeg_args(j)
    assert "-vf" in argv and "crop=1080:1920:420:0" in argv
    assert "scale=" not in " ".join(argv)
    assert argv[-1] == "out.mp4"


def test_crop_plus_scale():
    j = _job(output_width=540, output_height=960)
    vf = build_video_filter(j)
    assert vf == "crop=1080:1920:420:0,scale=540:960:flags=lanczos"


def test_odd_dims_snapped_even():
    j = _job(crop=CropConfig(x=421, y=1, width=1081, height=1919,
                             bound_w=1920, bound_h=1920),
             output_width=541, output_height=961)
    vf = build_video_filter(j)
    # origin + dims all even for yuv420 safety
    assert vf == "crop=1080:1918:420:0,scale=540:960:flags=lanczos"


def test_encoder_variants():
    cpu = build_ffmpeg_args(_job(encoder="libx264"))
    assert "-crf" in cpu and "libx264" in cpu
    nv264 = build_ffmpeg_args(_job(encoder="h264_nvenc"))
    assert "h264_nvenc" in nv264 and "-cq" in nv264
    nv265 = build_ffmpeg_args(_job(encoder="hevc_nvenc"))
    assert "hevc_nvenc" in nv265


def test_no_audio_maps_optional():
    argv = build_ffmpeg_args(_job(has_audio=False))
    assert "0:a?" in argv
    assert "-c:a" not in argv


def test_audio_copied():
    argv = build_ffmpeg_args(_job(has_audio=True))
    i = argv.index("-c:a")
    assert argv[i + 1] == "copy"


def test_rotation_cleared():
    argv = build_ffmpeg_args(_job(rotation=90))
    assert "rotate=0" in argv
    argv2 = build_ffmpeg_args(_job(rotation=0))
    assert "rotate=0" not in argv2


def test_output_is_last_and_input_present():
    argv = build_ffmpeg_args(_job())
    assert argv[1:3] == ["-hide_banner", "-n"]
    assert "-i" in argv and "in.mp4" in argv
    assert argv[-1] == "out.mp4"


def test_display_quoting():
    s = args_to_display(["ffmpeg", "-i", "my video.mp4", "out.mp4"])
    assert '"my video.mp4"' in s
