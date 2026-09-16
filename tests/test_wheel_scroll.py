"""Wheel-scroll accumulation: notches, direction, fractional remainders."""

from video_cropper.graphics.crop_view import accumulate_wheel


def test_full_notch_down():
    step, rem = accumulate_wheel(120.0, 48.0, 0.0)
    assert (step, rem) == (48, 0.0)


def test_full_notch_up_is_negative():
    step, rem = accumulate_wheel(-120.0, 48.0, 0.0)
    assert (step, rem) == (-48, 0.0)


def test_fractional_remainder_accumulates():
    # Trackpad-size deltas must not be rounded away.
    step, rem = accumulate_wheel(5.0, 12.0, 0.0)   # 0.5 px
    assert step == 0 and abs(rem - 0.5) < 1e-9
    step, rem = accumulate_wheel(5.0, 12.0, rem)   # 1.0 px total
    assert step == 1 and abs(rem) < 1e-9


def test_negative_remainder_accumulates():
    step, rem = accumulate_wheel(-5.0, 12.0, 0.0)
    assert step == 0 and abs(rem + 0.5) < 1e-9
    step, rem = accumulate_wheel(-5.0, 12.0, rem)
    assert step == -1 and abs(rem) < 1e-9


def test_smooth_notch_is_quarter_of_full():
    full, _ = accumulate_wheel(120.0, 48.0, 0.0)
    smooth, _ = accumulate_wheel(120.0, 12.0, 0.0)
    assert (full, smooth) == (48, 12)


def test_zero_delta_keeps_remainder():
    step, rem = accumulate_wheel(0.0, 48.0, 0.25)
    assert (step, rem) == (0, 0.25)
