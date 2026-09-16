"""Crop scene: preview pixmap + dim overlay + guides + crop rect.

Scene units are *preview pixels*; the pixmap sits at (0, 0). Crop geometry
is stored here in preview pixels; conversion to source pixels happens in
MainWindow via utils/coordinates (single implementation).
"""

from __future__ import annotations

from PySide6.QtCore import QRectF
from PySide6.QtGui import QColor, QPixmap
from PySide6.QtWidgets import QGraphicsPixmapItem, QGraphicsScene

from video_cropper.graphics.crop_item import CropRectItem
from video_cropper.graphics.overlay_item import DimOverlayItem, GuideOverlayItem


class CropScene(QGraphicsScene):
    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.setBackgroundBrush(QColor(24, 24, 24))
        self._pixmap_item = QGraphicsPixmapItem()
        self._pixmap_item.setZValue(0)
        self.addItem(self._pixmap_item)
        self._dim = DimOverlayItem()
        self.addItem(self._dim)
        self._guides = GuideOverlayItem()
        self.addItem(self._guides)
        self._crop = CropRectItem()
        self.addItem(self._crop)
        self._image_rect = QRectF()
        self._pad = 0.0  # scene-unit margin around the frame (overscroll room)

    # -- content -----------------------------------------------------------
    def set_preview(self, pixmap: QPixmap) -> None:
        self._pixmap_item.setPixmap(pixmap)
        w, h = pixmap.width(), pixmap.height()
        self._image_rect = QRectF(0, 0, max(0, w), max(0, h))
        self._update_scene_rect()
        self._dim.set_rects(self._image_rect, self._crop.rect())
        self.update()

    def set_padding(self, pad: float) -> None:
        """Scene-unit margin around the frame enabling bounded overscroll.

        Without a padded scene rect, Qt's scrollbar range pins the frame edge
        exactly to the viewport edge and no clamp math can ever show padding.
        """
        pad = max(0.0, float(pad))
        if abs(pad - self._pad) < 1e-9:
            return
        self._pad = pad
        self._update_scene_rect()

    def _update_scene_rect(self) -> None:
        if self._image_rect.isNull() or self._image_rect.width() <= 0:
            self.setSceneRect(QRectF())
        else:
            p = self._pad
            self.setSceneRect(self._image_rect.adjusted(-p, -p, p, p))

    def clear_preview(self) -> None:
        self._pixmap_item.setPixmap(QPixmap())
        self._image_rect = QRectF()
        self._update_scene_rect()
        self.set_crop_rect(QRectF())

    def has_image(self) -> bool:
        return not self._image_rect.isNull() and self._image_rect.width() > 0

    def image_rect(self) -> QRectF:
        return QRectF(self._image_rect)

    # -- crop geometry (preview pixels) ------------------------------------
    def set_crop_rect(self, rect: QRectF) -> None:
        clamped = QRectF(rect)
        if self.has_image():
            clamped = clamped.intersected(self._image_rect)
        self._crop.set_rect(clamped)
        self._dim.set_rects(self._image_rect, clamped)
        self._guides.set_crop(clamped)

    def crop_rect(self) -> QRectF:
        return self._crop.rect()

    def set_guides(self, center: bool, thirds: bool) -> None:
        self._guides.set_options(center, thirds)
