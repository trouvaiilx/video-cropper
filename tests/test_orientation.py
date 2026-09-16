"""Orientation parsing: rotation tags / displaymatrix swap display dims."""

import pytest

from video_cropper.ffmpeg.probe import ProbeError, metadata_from_probe


def _stream(**kw):
    base = dict(width=1920, height=1080, codec_name="h264",
                avg_frame_rate="30/1", pix_fmt="yuv420p")
    base.update(kw)
    return base


def test_no_rotation_keeps_stored_dims():
    m = metadata_from_probe(_stream(), {}, "a.mp4")
    assert (m.display_width, m.display_height) == (1920, 1080)
    assert m.rotation == 0


def test_rotate_tag_90_swaps_dims():
    m = metadata_from_probe(_stream(tags={"rotate": "90"}), {}, "a.mp4")
    assert (m.display_width, m.display_height) == (1080, 1920)
    assert m.rotation == 90


def test_rotation_tag_270_swaps_dims():
    m = metadata_from_probe(_stream(tags={"rotation": "270"}), {}, "a.mp4")
    assert (m.display_width, m.display_height) == (1080, 1920)
    assert m.rotation == 270


def test_rotate_180_keeps_dims():
    m = metadata_from_probe(_stream(tags={"rotate": "180"}), {}, "a.mp4")
    assert (m.display_width, m.display_height) == (1920, 1080)
    assert m.rotation == 180


def test_displaymatrix_side_data():
    vs = _stream(side_data_list=[{"rotation": -90}])
    m = metadata_from_probe(vs, {}, "a.mp4")
    assert m.rotation == 270
    assert (m.display_width, m.display_height) == (1080, 1920)


def test_missing_dims_raises():
    with pytest.raises(ProbeError):
        metadata_from_probe(_stream(width=0, height=0), {}, "a.mp4")


def test_fps_fraction_and_duration_fallback():
    m = metadata_from_probe(_stream(avg_frame_rate="30000/1001"),
                            {"duration": "63.5"}, "a.mp4")
    assert abs(m.fps - 29.97) < 0.01
    assert abs(m.duration - 63.5) < 0.001


def test_10bit_depth_detected():
    m = metadata_from_probe(_stream(pix_fmt="yuv420p10le"), {}, "a.mp4")
    assert m.bit_depth == 10
