"""QGraphicsView subclass: crop interaction + zoom + pan.

- Left drag: create / move / resize crop (never conflicts with pan/zoom)
- Right drag: pan (clamped)
- Ctrl + wheel: cursor-centered zoom, fit-scale minimum, 800% maximum

Emits crop_preview_changed(QRectF) in *scene* (preview-pixel) coords and
zoom_changed(float) as absolute scale (1.0 == 100%).
"""

from __future__ import annotations

from PySide6.QtCore import QPointF, QRectF, Qt, Signal
from PySide6.QtGui import QCursor, QMouseEvent, QWheelEvent
from PySide6.QtWidgets import QGraphicsView

from video_cropper.graphics.crop_handles import CURSORS, HANDLE_NAMES, hit_handle, resize_with_handle
from video_cropper.graphics.crop_scene import CropScene

_MIN_CROP = 4.0


class CropView(QGraphicsView):
    crop_preview_changed = Signal(object)  # QRectF in scene coords
    zoom_changed = Signal(float)           # absolute scale

    def __init__(self, scene: CropScene, parent=None) -> None:
        super().__init__(scene, parent)
        self._scene = scene
        self.setMouseTracking(True)
        self.setRenderHints(self.renderHints())
        self.setDragMode(QGraphicsView.DragMode.NoDrag)
        self.setTransformationAnchor(QGraphicsView.ViewportAnchor.NoAnchor)
        self.setResizeAnchor(QGraphicsView.ViewportAnchor.NoAnchor)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self._mode: str = "idle"
        self._handle = -1
        self._press_scene = QPointF()
        self._start_rect = QRectF()
        self._panning = False
        self._pan_last = QPointF()
        self._zoom = 1.0
        self._fit_scale = 1.0
        self._ratio_lock: float | None = None
        self._min_scale = 0.05

    # -- ratio lock ----------------------------------------------------------
    def set_ratio_lock(self, value: float | None) -> None:
        self._ratio_lock = value

    # -- zoom -----------------------------------------------------------------
    def absolute_zoom(self) -> float:
        return self.transform().m11() if not self.transform().isIdentity() else self._zoom

    def fit_view(self) -> None:
        if not self._scene.has_image():
            return
        self.fitInView(self._scene.image_rect(), Qt.AspectRatioMode.KeepAspectRatio)
        z = self.transform().m11()
        self._zoom = z
        self._fit_scale = z
        self._min_scale = z  # never zoom out beyond fit
        self._clamp_view()
        self.zoom_changed.emit(z)

    def zoom_step(self, factor: float, anchor_view_pos=None) -> None:
        if not self._scene.has_image():
            return
        cur = self.transform().m11()
        new = max(self._min_scale, min(8.0, cur * factor))
        if abs(new - cur) < 1e-9:
            return
        if anchor_view_pos is None:
            anchor_view_pos = self.viewport().rect().center()
        anchor_scene = self.mapToScene(anchor_view_pos)
        self.setTransform(self.transform().scale(new / cur, new / cur))
        # Keep cursor anchored on the same scene point.
        new_view = self.mapFromScene(anchor_scene)
        dx = new_view.x() - anchor_view_pos.x()
        dy = new_view.y() - anchor_view_pos.y()
        self.horizontalScrollBar().setValue(self.horizontalScrollBar().value() + dx)
        self.verticalScrollBar().setValue(self.verticalScrollBar().value() + dy)
        self._zoom = new
        self._clamp_view()
        self.zoom_changed.emit(new)

    def zoom_in(self) -> None:
        self.zoom_step(1.25)

    def zoom_out(self) -> None:
        self.zoom_step(1 / 1.25)

    # -- mouse -----------------------------------------------------------------
    def wheelEvent(self, event: QWheelEvent) -> None:  # noqa: N802
        if event.modifiers() & Qt.KeyboardModifier.ControlModifier:
            factor = 1.15 if event.angleDelta().y() > 0 else 1 / 1.15
            self.zoom_step(factor, event.position().toPoint())
            event.accept()
        else:
            super().wheelEvent(event)

    def mousePressEvent(self, event: QMouseEvent) -> None:  # noqa: N802
        if event.button() == Qt.MouseButton.RightButton and self._scene.has_image():
            self._panning = True
            self._pan_last = event.position()
            self.setCursor(QCursor(Qt.CursorShape.ClosedHandCursor))
            event.accept()
            return
        if event.button() == Qt.MouseButton.LeftButton and self._scene.has_image():
            scene_pos = self.mapToScene(event.pos())
            crop = self._scene.crop_rect()
            scale = max(0.1, self.transform().m11())
            handle_size = 12.0 / scale
            idx = -1 if crop.isNull() else hit_handle(crop, scene_pos, handle_size)
            self._press_scene = scene_pos
            self._start_rect = QRectF(crop)
            if idx >= 0:
                self._mode = "resize"
                self._handle = idx
            elif not crop.isNull() and crop.contains(scene_pos):
                self._mode = "move"
            else:
                self._mode = "create"
                # anchor creation inside the image
                img = self._scene.image_rect()
                self._press_scene = QPointF(
                    max(img.left(), min(img.right(), scene_pos.x())),
                    max(img.top(), min(img.bottom(), scene_pos.y())),
                )
                self._scene.set_crop_rect(QRectF(self._press_scene, self._press_scene))
            event.accept()
            return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event: QMouseEvent) -> None:  # noqa: N802
        if self._panning:
            delta = event.position() - self._pan_last
            self._pan_last = event.position()
            self.horizontalScrollBar().setValue(self.horizontalScrollBar().value() - int(delta.x()))
            self.verticalScrollBar().setValue(self.verticalScrollBar().value() - int(delta.y()))
            self._clamp_view()
            event.accept()
            return
        if self._mode != "idle" and self._scene.has_image():
            scene_pos = self.mapToScene(event.pos())
            img = self._scene.image_rect()
            scene_pos.setX(max(img.left(), min(img.right(), scene_pos.x())))
            scene_pos.setY(max(img.top(), min(img.bottom(), scene_pos.y())))
            if self._mode == "create":
                rect = QRectF(self._press_scene, scene_pos).normalized()
                rect = self._apply_ratio_on_create(rect)
                self._set_crop_live(rect)
            elif self._mode == "move":
                delta = scene_pos - self._press_scene
                rect = self._start_rect.translated(delta)
                # clamp inside image
                rect.moveLeft(max(img.left(), min(rect.left(), img.right() - rect.width())))
                rect.moveTop(max(img.top(), min(rect.top(), img.bottom() - rect.height())))
                self._set_crop_live(rect)
            elif self._mode == "resize":
                rect = self._resize_live(scene_pos)
                self._set_crop_live(rect)
            event.accept()
            return
        # hover cursor feedback
        if self._scene.has_image():
            scene_pos = self.mapToScene(event.pos())
            crop = self._scene.crop_rect()
            scale = max(0.1, self.transform().m11())
            idx = -1 if crop.isNull() else hit_handle(crop, scene_pos, 12.0 / scale)
            if idx >= 0:
                self.setCursor(QCursor(CURSORS[HANDLE_NAMES[idx]]))
            elif not crop.isNull() and crop.contains(scene_pos):
                self.setCursor(QCursor(Qt.CursorShape.SizeAllCursor))
            else:
                self.setCursor(QCursor(Qt.CursorShape.CrossCursor))
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:  # noqa: N802
        if event.button() == Qt.MouseButton.RightButton and self._panning:
            self._panning = False
            self.unsetCursor()
            event.accept()
            return
        if event.button() == Qt.MouseButton.LeftButton and self._mode != "idle":
            # Drop degenerate rects (click without drag clears nothing; keep old).
            if self._mode == "create":
                r = self._scene.crop_rect()
                if r.width() < _MIN_CROP or r.height() < _MIN_CROP:
                    self._scene.set_crop_rect(self._start_rect)
                else:
                    self.crop_preview_changed.emit(QRectF(self._scene.crop_rect()))
            else:
                self.crop_preview_changed.emit(QRectF(self._scene.crop_rect()))
            self._mode = "idle"
            self._handle = -1
            event.accept()
            return
        super().mouseReleaseEvent(event)

    # -- internals ---------------------------------------------------------------
    def _set_crop_live(self, rect: QRectF) -> None:
        if rect.width() < _MIN_CROP:
            rect.setWidth(_MIN_CROP)
        if rect.height() < _MIN_CROP:
            rect.setHeight(_MIN_CROP)
        img = self._scene.image_rect()
        rect = rect.intersected(img)
        self._scene.set_crop_rect(rect)
        self.crop_preview_changed.emit(QRectF(rect))

    def _apply_ratio_on_create(self, rect: QRectF) -> QRectF:
        if not self._ratio_lock:
            return rect
        w, h = rect.width(), rect.height()
        if w < 1 or h < 1:
            return rect
        target = self._ratio_lock
        h_from_w = w / target
        if h_from_w <= h:
            # anchor top (drag direction aware would be nicer; keep simple)
            rect.setHeight(h_from_w)
        else:
            rect.setWidth(h * target)
        return rect.normalized()

    def _resize_live(self, scene_pos: QPointF) -> QRectF:
        start = self._start_rect
        dx = scene_pos.x() - self._press_scene.x()
        dy = scene_pos.y() - self._press_scene.y()
        # Map pixel delta through handle semantics: resize_with_handle expects
        # width/height deltas for the dragged edges.
        rect = resize_with_handle(start, self._handle, dx, dy, keep_ratio=None)
        if self._ratio_lock:
            # Re-constrain: keep the dragged corner, fit ratio inside image.
            rect = self._constrain_ratio(rect, self._handle, self._ratio_lock)
        # clamp inside image
        img = self._scene.image_rect()
        rect = rect.intersected(img)
        if rect.width() < _MIN_CROP or rect.height() < _MIN_CROP:
            return self._scene.crop_rect()
        return rect

    @staticmethod
    def _constrain_ratio(rect: QRectF, handle: int, ratio: float) -> QRectF:
        name = HANDLE_NAMES[handle]
        w, h = rect.width(), rect.height()
        # Drive off the dominant axis.
        if "e" in name or "w" in name:
            h = w / ratio
        else:
            w = h * ratio
        x, y = rect.x(), rect.y()
        # Re-anchor based on handle (keep opposite corner fixed).
        anchor = QRectF(rect)
        if "e" not in name:  # w side dragged → right edge fixed
            x = anchor.right() - w
        if "s" not in name and "n" in name:  # n dragged → bottom fixed
            y = anchor.bottom() - h
        return QRectF(x, y, max(_MIN_CROP, w), max(_MIN_CROP, h))

    def _clamp_view(self) -> None:
        """Keep the image from drifting into empty space."""
        if not self._scene.has_image():
            return
        img = self._scene.image_rect()
        view_rect = self.mapToScene(self.viewport().rect()).boundingRect()
        dx = dy = 0.0
        if view_rect.width() >= img.width():
            # center horizontally
            target_cx = img.center().x()
            dx = target_cx - view_rect.center().x()
        else:
            if view_rect.left() < img.left():
                dx = img.left() - view_rect.left()
            elif view_rect.right() > img.right():
                dx = img.right() - view_rect.right()
        if view_rect.height() >= img.height():
            target_cy = img.center().y()
            dy = target_cy - view_rect.center().y()
        else:
            if view_rect.top() < img.top():
                dy = img.top() - view_rect.top()
            elif view_rect.bottom() > img.bottom():
                dy = img.bottom() - view_rect.bottom()
        if dx or dy:
            self.translate(dx, dy)

    def resizeEvent(self, event) -> None:  # noqa: N802
        super().resizeEvent(event)
        # Keep content clamped on window resize; do not auto-refit (zoom is user's).
        self._clamp_view()
