"""Crop model: bounds, clamping, validity."""

from video_cropper.models.crop_config import AspectRatio, CropConfig


def _bound() -> CropConfig:
    return CropConfig(x=0, y=0, width=1920, height=1080, bound_w=1920, bound_h=1080)


def test_full_frame_valid():
    c = _bound()
    assert c.is_valid
    assert c.as_tuple() == (0, 0, 1920, 1080)


def test_move_clamps_to_bounds():
    c = CropConfig(x=1800, y=900, width=400, height=300, bound_w=1920, bound_h=1080).clamped()
    assert c.x + c.width <= 1920
    assert c.y + c.height <= 1080
    assert (c.x, c.y) == (1520, 780)


def test_resize_clamps_to_bounds():
    c = _bound().resized(5000, 5000)
    assert (c.width, c.height) == (1920, 1080)


def test_minimum_size():
    c = CropConfig(x=0, y=0, width=0, height=-5, bound_w=1920, bound_h=1080).clamped()
    assert c.width >= 2 and c.height >= 2


def test_negative_origin_clamped():
    c = CropConfig(x=-50, y=-20, width=400, height=300, bound_w=1920, bound_h=1080).clamped()
    assert (c.x, c.y) == (0, 0)


def test_filter_string():
    c = CropConfig(x=10, y=20, width=640, height=480, bound_w=1920, bound_h=1080)
    assert c.to_filter() == "crop=640:480:10:20"


def test_matches_ratio():
    c = CropConfig(x=0, y=0, width=1920, height=1080, bound_w=1920, bound_h=1080)
    assert c.matches_ratio(AspectRatio("16:9", 16, 9))
    assert not c.matches_ratio(AspectRatio("1:1", 1, 1))
