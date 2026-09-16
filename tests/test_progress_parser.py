"""Progress parser: percentages, speed, ETA, completion, garbage tolerance."""

from video_cropper.ffmpeg.progress import FfmpegProgressParser


def _feed(parser, block: dict[str, str], elapsed=10.0):
    upd = None
    for k, v in block.items():
        upd = parser.feed_line(f"{k}={v}", elapsed)
    return upd


def test_halfway_progress():
    p = FfmpegProgressParser(60.0)
    upd = _feed(p, {"frame": "100", "out_time_ms": "30000000",
                    "speed": "2.0x", "progress": "continue"}, elapsed=15.0)
    assert upd is not None
    assert abs(upd.percent - 50.0) < 0.01
    assert upd.speed == 2.0
    assert upd.eta_seconds is not None and abs(upd.eta_seconds - 15.0) < 1.0
    assert not upd.done


def test_end_forces_100():
    p = FfmpegProgressParser(60.0)
    upd = _feed(p, {"out_time_ms": "1000", "progress": "end"})
    assert upd.done and upd.percent == 100.0 and upd.eta_seconds is None


def test_malformed_lines_ignored():
    p = FfmpegProgressParser(60.0)
    assert p.feed_line("garbage without equals") is None
    assert p.feed_line("") is None
    assert p.feed_line("out_time_ms=not_a_number") is None  # stored, no emit
    upd = p.feed_line("progress=continue", 5.0)
    assert upd is not None and upd.percent == 0.0  # bad number → 0, but alive


def test_unknown_duration_no_crash():
    p = FfmpegProgressParser(0.0)
    upd = _feed(p, {"out_time_ms": "5000000", "progress": "continue"})
    assert upd.percent == 0.0 and upd.eta_seconds is None


def test_speed_na():
    p = FfmpegProgressParser(60.0)
    upd = _feed(p, {"out_time_ms": "30000000", "speed": "N/A", "progress": "continue"})
    assert upd.speed is None
