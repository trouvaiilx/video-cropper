"""Coordinate conversions: source <-> preview round-trips."""

from video_cropper.utils.coordinates import PreviewMapping, compute_preview_size


def test_round_trip_full_hd_preview_full_res():
    m = PreviewMapping(1920, 1080, 1920, 1080)
    x, y, w, h = m.source_to_preview(100, 50, 640, 480)
    assert (x, y, w, h) == (100, 50, 640, 480)
    assert m.preview_to_source(x, y, w, h) == (100, 50, 640, 480)


def test_round_trip_downscaled_preview():
    m = PreviewMapping(3840, 2160, 1920, 1080)
    x, y, w, h = m.source_to_preview(100, 50, 641, 481)
    sx, sy, sw, sh = m.preview_to_source(x, y, w, h)
    # rounding may shift by 1px on odd sizes — acceptable, must stay within 2px
    assert abs(sx - 100) <= 2 and abs(sy - 50) <= 2
    assert abs(sw - 641) <= 2 and abs(sh - 481) <= 2


def test_portrait_mapping():
    m = PreviewMapping(1080, 1920, 540, 960)
    x, y, w, h = m.source_to_preview(0, 0, 1080, 1920)
    assert (x, y, w, h) == (0, 0, 540, 960)
    assert m.preview_to_source(x, y, w, h) == (0, 0, 1080, 1920)


def test_compute_preview_size_caps_and_keeps_aspect():
    w, h = compute_preview_size(3840, 2160)
    assert w == 1920 and h == 1080
    w2, h2 = compute_preview_size(1080, 1920)
    assert (w2, h2) == (1080, 1920)  # no upscale
    assert w2 % 2 == 0 and h2 % 2 == 0
