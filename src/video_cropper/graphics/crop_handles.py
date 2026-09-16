"""Handle geometry + cursors for the crop rectangle (pure helpers, tested via GUI)."""

from __future__ import annotations

from PySide6.QtCore import QRectF, QSizeF
from PySide6.QtGui import Qt

# Handle order: TL, T, TR, R, BR, B, BL, L
HANDLE_NAMES = ("nw", "n", "ne", "e", "se", "s", "sw", "w")

CURSORS = {
    "nw": Qt.CursorShape.SizeFDiagCursor,
    "se": Qt.CursorShape.SizeFDiagCursor,
    "ne": Qt.CursorShape.SizeBDiagCursor,
    "sw": Qt.CursorShape.SizeBDiagCursor,
    "n": Qt.CursorShape.SizeVerCursor,
    "s": Qt.CursorShape.SizeVerCursor,
    "e": Qt.CursorShape.SizeHorCursor,
    "w": Qt.CursorShape.SizeHorCursor,
}


def handle_positions(rect: QRectF) -> list[tuple[float, float]]:
    x, y, w, h = rect.x(), rect.y(), rect.width(), rect.height()
    return [
        (x, y), (x + w / 2, y), (x + w, y), (x + w, y + h / 2),
        (x + w, y + h), (x + w / 2, y + h), (x, y + h), (x, y + h / 2),
    ]


def handle_rects(rect: QRectF, size: float) -> list[QRectF]:
    half = size / 2.0
    return [QRectF(px - half, py - half, size, size) for px, py in handle_positions(rect)]


def hit_handle(rect: QRectF, pos, size: float) -> int:
    """Return handle index 0..7 or -1. `pos` is in the same coords as rect."""
    for i, hr in enumerate(handle_rects(rect, size)):
        if hr.contains(pos):
            return i
    return -1


def resize_with_handle(rect: QRectF, index: int, delta_w: float, delta_h: float,
                       keep_ratio: float | None = None) -> QRectF:
    """Apply a size delta anchored appropriately for the dragged handle."""
    x, y, w, h = rect.x(), rect.y(), rect.width(), rect.height()
    name = HANDLE_NAMES[index]
    # Horizontal
    if "e" in name:
        w += delta_w
    if "w" in name:
        x += delta_w
        w -= delta_w
    if "n" in name:
        y += delta_h
        h -= delta_h
    if "s" in name:
        h += delta_h
    if keep_ratio:
        # Adjust the free axis to match the dragged axis.
        if "e" in name or "w" in name:
            h = w / keep_ratio
            if "n" in name:
                y = rect.bottom() - h
            # else top stays (s handle or pure horizontal)
        else:
            w = h * keep_ratio
            if "w" in name:
                x = rect.right() - w
    w = max(2.0, w)
    h = max(2.0, h)
    # Fix origin when growing past the anchor on w/n handles
    if "w" in name and keep_ratio is None:
        x = min(x, rect.right() - 2.0)
    if "n" in name and keep_ratio is None:
        y = min(y, rect.bottom() - 2.0)
    return QRectF(x, y, w, h)
