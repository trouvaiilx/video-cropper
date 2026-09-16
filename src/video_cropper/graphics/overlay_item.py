"""Dim-everything-outside-the-crop overlay + guide lines.

Two lightweight QGraphicsItems owned by CropScene. They read rects from the
scene (no model access) so there is exactly one writer of crop geometry.
"""

from __future__ import annotations

from PySide6.QtCore import QRectF
from PySide6.QtGui import QColor, QPainter, QPen
from PySide6.QtWidgets import QGraphicsItem


class DimOverlayItem(QGraphicsItem):
    def __init__(self, parent: QGraphicsItem | None = None) -> None:
        super().__init__(parent)
        self._image = QRectF()
        self._crop = QRectF()
        self.setZValue(10)

    def set_rects(self, image: QRectF, crop: QRectF) -> None:
        self.prepareGeometryChange()
        self._image = QRectF(image)
        self._crop = QRectF(crop)

    def boundingRect(self) -> QRectF:  # noqa: N802
        return self._image

    def paint(self, painter: QPainter, _option, _widget=None) -> None:  # noqa: N802
        if self._image.isNull():
            return
        painter.save()
        painter.setPen(QPen(QColor(0, 0, 0, 0)))
        painter.setBrush(QColor(0, 0, 0, 140))
        img = self._image
        c = self._crop.intersected(img) if not self._crop.isNull() else QRectF()
        if c.isNull():
            painter.drawRect(img)
        else:
            # top / bottom / left / right bands around the crop
            painter.drawRect(QRectF(img.left(), img.top(), img.width(), c.top() - img.top()))
            painter.drawRect(QRectF(img.left(), c.bottom(), img.width(), img.bottom() - c.bottom()))
            painter.drawRect(QRectF(img.left(), c.top(), c.left() - img.left(), c.height()))
            painter.drawRect(QRectF(c.right(), c.top(), img.right() - c.right(), c.height()))
        painter.restore()


class GuideOverlayItem(QGraphicsItem):
    def __init__(self, parent: QGraphicsItem | None = None) -> None:
        super().__init__(parent)
        self._crop = QRectF()
        self._show_center = True
        self._show_thirds = True
        self.setZValue(11)

    def set_crop(self, crop: QRectF) -> None:
        self.prepareGeometryChange()
        self._crop = QRectF(crop)

    def set_options(self, center: bool, thirds: bool) -> None:
        self._show_center = center
        self._show_thirds = thirds
        self.update()

    def boundingRect(self) -> QRectF:  # noqa: N802
        return self._crop

    def paint(self, painter: QPainter, _option, widget=None) -> None:  # noqa: N802
        if self._crop.isNull():
            return
        painter.save()
        # Keep 1px lines regardless of zoom.
        width = 1.0
        try:
            if widget is not None:
                scale = widget.transform().m11() if hasattr(widget, "transform") else 1.0
                width = 1.0 / max(0.05, abs(scale))
        except Exception:
            pass
        pen = QPen(QColor(255, 255, 255, 150))
        pen.setWidthF(width)
        pen.setCosmetic(True)
        painter.setPen(pen)
        c = self._crop
        cx = c.x() + c.width() / 2.0
        cy = c.y() + c.height() / 2.0
        if self._show_center:
            painter.drawLine(int(cx) + 0.5, int(c.top()), int(cx) + 0.5, int(c.bottom()))
            painter.drawLine(int(c.left()), int(cy) + 0.5, int(c.right()), int(cy) + 0.5)
        if self._show_thirds and c.width() > 4 and c.height() > 4:
            for f in (1 / 3, 2 / 3):
                x = c.x() + c.width() * f
                y = c.y() + c.height() * f
                painter.drawLine(int(x) + 0.5, int(c.top()), int(x) + 0.5, int(c.bottom()))
                painter.drawLine(int(c.left()), int(y) + 0.5, int(c.right()), int(y) + 0.5)
        painter.restore()
