"""View clamping: centering, edge padding, bounded overscroll.

Pure QRectF math (no QApplication needed): the view supplies its visible
scene rect and the image rect, plus a margin in scene units.
"""

from PySide6.QtCore import QRectF

from video_cropper.graphics.crop_view import clamp_translation


def test_smaller_image_centers():
    img = QRectF(100, 100, 200, 150)   # center (200, 175)
    view = QRectF(0, 0, 800, 600)      # center (400, 300)
    assert clamp_translation(view, img, 10.0) == (-200.0, -125.0)


def test_inside_margin_is_noop():
    img = QRectF(0, 0, 1000, 1000)
    assert clamp_translation(QRectF(-5, -5, 400, 400), img, 10.0) == (0.0, 0.0)


def test_past_left_margin_pushes_back():
    img = QRectF(0, 0, 1000, 1000)
    dx, dy = clamp_translation(QRectF(-50, 0, 400, 400), img, 10.0)
    assert (dx, dy) == (40.0, 0.0)  # bounds.left (-10) - view.left (-50)


def test_past_right_margin_pushes_back():
    img = QRectF(0, 0, 1000, 1000)
    dx, dy = clamp_translation(QRectF(700, 0, 400, 400), img, 10.0)
    assert (dx, dy) == (-90.0, 0.0)  # bounds.right (1010) - view.right (1100)


def test_exactly_at_margin_is_noop():
    img = QRectF(0, 0, 1000, 1000)
    assert clamp_translation(QRectF(-10, 0, 400, 400), img, 10.0) == (0.0, 0.0)


def test_vertical_clamp():
    img = QRectF(0, 0, 1000, 1000)
    dx, dy = clamp_translation(QRectF(0, 950, 400, 400), img, 10.0)
    assert (dx, dy) == (0.0, -340.0)  # 1010 - 1350


def test_mixed_axes_center_x_clamp_y():
    img = QRectF(0, 0, 200, 1000)      # narrower than view, taller
    view = QRectF(0, 950, 400, 400)
    dx, dy = clamp_translation(view, img, 10.0)
    assert dx == 100.0 - 200.0         # centered horizontally
    assert dy == -340.0                # clamped vertically


def test_zero_margin_is_exact_edge_pin():
    img = QRectF(0, 0, 1000, 1000)
    dx, _ = clamp_translation(QRectF(-50, 0, 400, 400), img, 0.0)
    assert dx == 50.0
