"""Output-size presets preserve aspect and snap even."""

from video_cropper.models.processing_job import compute_output_size, is_upscale


def test_original_keeps_crop():
    assert compute_output_size(1080, 1920, "Original Crop") == (1080, 1920)


def test_720p_long_side():
    w, h = compute_output_size(1920, 1080, "720p")
    assert max(w, h) == 1280
    assert w % 2 == 0 and h % 2 == 0


def test_portrait_1080p():
    w, h = compute_output_size(1080, 1920, "1080p")
    assert (w, h) == (1080, 1920)  # long side already 1920


def test_upscale_detected():
    assert is_upscale(640, 480, 1280, 960)
    assert not is_upscale(1920, 1080, 1280, 720)


def test_custom_even_snapped():
    assert compute_output_size(800, 600, "Custom", 641, 481) == (640, 480)
