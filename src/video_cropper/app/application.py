"""QApplication factory."""

from __future__ import annotations

import sys

from PySide6.QtCore import Qt
from PySide6.QtGui import QIcon
from PySide6.QtWidgets import QApplication

import video_cropper
from video_cropper.ui.theme import apply_theme
from video_cropper.utils.resources import find_logo


def create_application(argv: list[str]) -> QApplication:
    QApplication.setOrganizationName(video_cropper.__org_name__)
    QApplication.setApplicationName(video_cropper.__app_name__)
    QApplication.setApplicationVersion(video_cropper.__version__)
    try:
        QApplication.setHighDpiScaleFactorRoundingPolicy(
            Qt.HighDpiScaleFactorRoundingPolicy.PassThrough)
    except Exception:
        pass
    app = QApplication(argv if argv else sys.argv)
    apply_theme(app)
    logo = find_logo()  # optional artwork: app runs fine without it
    if logo is not None:
        app.setWindowIcon(QIcon(str(logo)))
    return app
