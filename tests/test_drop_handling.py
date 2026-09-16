"""Drag & drop: shared video rule, canvas handlers, hover hint overlay."""

from PySide6.QtCore import QMimeData, QPoint, Qt, QUrl
from PySide6.QtGui import QDragEnterEvent, QDragLeaveEvent, QDropEvent

from video_cropper.graphics.crop_scene import CropScene
from video_cropper.graphics.crop_view import CropView
from video_cropper.ui.drop_overlay import DropOverlay
from video_cropper.utils.paths import first_droppable_path


def _mime(*names: str) -> QMimeData:
    mime = QMimeData()
    mime.setUrls([QUrl.fromLocalFile(f"C:/videos/{n}") for n in names])
    return mime


def _enter(mime: QMimeData) -> QDragEnterEvent:
    return QDragEnterEvent(QPoint(10, 10), Qt.DropAction.CopyAction,
                           mime, Qt.MouseButton.NoButton,
                           Qt.KeyboardModifier.NoModifier)


def _drop(mime: QMimeData) -> QDropEvent:
    return QDropEvent(QPoint(10, 10), Qt.DropAction.CopyAction,
                      mime, Qt.MouseButton.NoButton,
                      Qt.KeyboardModifier.NoModifier)


# -- shared rule ---------------------------------------------------------------
def test_single_video_is_droppable():
    assert first_droppable_path(_mime("clip.mp4").urls()) == "C:/videos/clip.mp4"


def test_non_video_rejected():
    assert first_droppable_path(_mime("notes.txt").urls()) is None


def test_multi_file_rejected():
    assert first_droppable_path(_mime("a.mp4", "b.mp4").urls()) is None


def test_empty_rejected():
    assert first_droppable_path([]) is None


# -- canvas handlers --------------------------------------------------------------
# NOTE: the QMimeData must outlive its event (Qt takes no ownership), so every
# test below binds `mime` to a local first. Inlining _mime(...) into the event
# call is a use-after-free.
def _view(qapp) -> CropView:
    return CropView(CropScene())


def test_canvas_accepts_video_enter(qapp):
    view = _view(qapp)
    seen: list = []
    view.video_drag_entered.connect(lambda: seen.append(True))
    mime = _mime("clip.mp4")
    ev = _enter(mime)
    view.dragEnterEvent(ev)
    assert ev.isAccepted() and seen == [True]


def test_canvas_ignores_non_video(qapp):
    view = _view(qapp)
    seen: list = []
    view.video_drag_entered.connect(lambda: seen.append(True))
    mime = _mime("notes.txt")
    ev = _enter(mime)
    view.dragEnterEvent(ev)
    assert not ev.isAccepted() and seen == []


def test_canvas_drop_emits_path(qapp):
    view = _view(qapp)
    got: list = []
    view.video_file_dropped.connect(got.append)
    mime = _mime("clip.mp4")
    ev = _drop(mime)
    view.dropEvent(ev)
    assert ev.isAccepted() and got == ["C:/videos/clip.mp4"]


def test_canvas_drop_ignores_non_video(qapp):
    view = _view(qapp)
    got: list = []
    view.video_file_dropped.connect(got.append)
    mime = _mime("notes.txt")
    ev = _drop(mime)
    view.dropEvent(ev)
    assert not ev.isAccepted() and got == []


def test_canvas_leave_emits(qapp):
    view = _view(qapp)
    got: list = []
    view.video_drag_left.connect(lambda: got.append(True))
    view.dragLeaveEvent(QDragLeaveEvent())
    assert got == [True]


# -- overlay ----------------------------------------------------------------------
def test_overlay_hidden_with_hint_text(qapp):
    overlay = DropOverlay()
    assert overlay.isHidden()
    assert overlay.text() == "Drop video file here"


def test_window_wiring_shows_hint_on_canvas_hover(qapp):
    from video_cropper.app.main_window import MainWindow
    window = MainWindow()
    try:
        assert window.drop_overlay.isHidden()
        mime = _mime("clip.mp4")
        window.view.dragEnterEvent(_enter(mime))
        assert not window.drop_overlay.isHidden()
        assert window.drop_overlay.text() == "Drop video file here"
        window.view.dragLeaveEvent(QDragLeaveEvent())
        assert window.drop_overlay.isHidden()
    finally:
        window.close()
