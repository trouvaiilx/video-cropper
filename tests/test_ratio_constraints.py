"""Ratio constraints on landscape + portrait bounds."""

from video_cropper.models.crop_config import AspectRatio, CropConfig, ratio_by_label


def _crop(w, h, bw, bh):
    return CropConfig(x=0, y=0, width=w, height=h, bound_w=bw, bound_h=bh)


def test_16x9_on_1080p():
    c = _crop(1920, 1080, 1920, 1080).apply_ratio(ratio_by_label("16:9"))
    assert c.matches_ratio(ratio_by_label("16:9"))
    assert (c.width, c.height) == (1920, 1080)


def test_1x1_centers_and_fits():
    c = CropConfig(x=0, y=0, width=1920, height=1080, bound_w=1920, bound_h=1080)
    out = c.apply_ratio(ratio_by_label("1:1"))
    assert (out.width, out.height) == (1080, 1080)
    assert out.x == 420 and out.y == 0


def test_9x16_portrait_from_landscape():
    c = CropConfig(x=0, y=0, width=1920, height=1080, bound_w=1920, bound_h=1080)
    out = c.apply_ratio(ratio_by_label("9:16"))
    assert out.matches_ratio(ratio_by_label("9:16"))
    assert out.width * 16 == out.height * 9 or abs(out.width / out.height - 9 / 16) < 0.01
    assert out.x + out.width <= 1920 and out.y + out.height <= 1080


def test_ratio_on_portrait_source():
    c = CropConfig(x=0, y=0, width=1080, height=1920, bound_w=1080, bound_h=1920)
    out = c.apply_ratio(ratio_by_label("16:9"))
    assert out.matches_ratio(ratio_by_label("16:9"))
    assert out.x + out.width <= 1080


def test_free_ratio_is_noop():
    c = _crop(800, 600, 1920, 1080)
    assert c.apply_ratio(ratio_by_label("Free")).as_tuple() == (0, 0, 800, 600)


def test_edge_clamp_keeps_inside():
    c = CropConfig(x=1800, y=1000, width=500, height=500, bound_w=1920, bound_h=1080)
    out = c.apply_ratio(AspectRatio("1:1", 1, 1))
    assert out.x + out.width <= 1920 and out.y + out.height <= 1080
