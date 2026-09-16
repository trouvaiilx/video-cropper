"""Crop rectangle item: border + resize handles (visual only).

Interaction lives in CropView; this item only renders and exposes geometry.
"""

from __future__ import annotations

from PySide6.QtCore import QRectF
from PySide6.QtGui import QColor, QPainter, QPen, QBrush
from PySide6.QtWidgets import QGraphicsItem

from video_cropper.graphics.crop_handles import handle_rects


class CropRectItem(QGraphicsItem):
    def __init__(self, parent: QGraphicsItem | None = None) -> None:
        super().__init__(parent)
        self._rect = QRectF()
        self.setZValue(12)

    def rect(self) -> QRectF:
        return QRectF(self._rect)

    def set_rect(self, rect: QRectF) -> None:
        self.prepareGeometryChange()
        self._rect = QRectF(rect)
        self.update()

    def boundingRect(self) -> QRectF:  # noqa: N802
        pad = 12.0
        return self._rect.adjusted(-pad, -pad, pad, pad)

    def paint(self, painter: QPainter, _option, widget=None) -> None:  # noqa: N802
        if self._rect.isNull():
            return
        painter.save()
        # Border: white outer + dark inner for visibility on any footage.
        outer = QPen(QColor(255, 255, 255, 230))
        outer.setWidthF(1.5)
        outer.setCosmetic(True)
        painter.setPen(outer)
        painter.setBrush(QBrush(QColor(0, 0, 0, 0)))
        painter.drawRect(self._rect)
        inner = QPen(QColor(20, 20, 20, 200))
        inner.setWidthF(1.0)
        inner.setCosmetic(True)
        painter.setPen(inner)
        painter.drawRect(self._rect.adjusted(1.5, 1.5, -1.5, -1.5))
        # Handles: 8 white squares with dark outline, constant screen size.
        try:
            scale = abs(widget.transform().m11()) if widget is not None and hasattr(widget, "transform") else 1.0
        except Exception:
            scale = 1.0
        size = 9.0 / max(0.1, scale)
        fill = QBrush(QColor(245, 245, 245, 255))
        outline = QPen(QColor(30, 30, 30, 255))
        outline.setWidthF(1.0)
        outline.setCosmetic(True)
        painter.setBrush(fill)
        painter.setPen(outline)
        for hr in handle_rects(self._rect, size):
            painter.drawRect(hr)
        painter.restore()
