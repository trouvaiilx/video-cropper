"""Canvas padding is real: at high zoom the view can overscroll past the frame
by the edge margin (bounded), so edge handles stay grabbable."""

from PySide6.QtCore import Qt
from PySide6.QtGui import QPixmap

from video_cropper.graphics.crop_scene import CropScene
from video_cropper.graphics.crop_view import _EDGE_MARGIN_PX, CropView


def test_overscroll_margin_visible_at_high_zoom(qapp):
    scene = CropScene()
    pix = QPixmap(400, 300)
    pix.fill(Qt.GlobalColor.black)
    scene.set_preview(pix)
    view = CropView(scene)
    try:
        view.resize(200, 150)
        view.show()
        qapp.processEvents()
        view.fit_view()
        view.zoom_step(4.0)
        qapp.processEvents()
        view.horizontalScrollBar().setValue(view.horizontalScrollBar().maximum())
        view.verticalScrollBar().setValue(view.verticalScrollBar().maximum())
        qapp.processEvents()
        vis = view.mapToScene(view.viewport().rect()).boundingRect()
        scale = view.transform().m11()
        pad = _EDGE_MARGIN_PX / scale
        # Past the 400x300 frame, but bounded by the margin (not arbitrary).
        assert 400.0 < vis.right() <= 400.0 + pad + 3.0
        assert 300.0 < vis.bottom() <= 300.0 + pad + 3.0
    finally:
        view.close()
