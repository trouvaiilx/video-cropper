"""Translucent 'drop here' hint shown while a video file is dragged overhead.

Flat, single-purpose, theme-consistent: dimmed backdrop + dashed outline +
plain centered text. Mouse-transparent so drag events keep reaching the
canvas beneath it.
"""

from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QLabel, QWidget


class DropOverlay(QLabel):
    TEXT = "Drop video file here"

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(self.TEXT, parent)
        self.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        self.setStyleSheet(
            "background: rgba(12, 12, 12, 150);"
            "color: #e8e8e8;"
            "font-size: 13pt; font-weight: 600;"
            "border: 2px dashed #8a8a8a; border-radius: 3px;"
        )
        self.hide()
