"""Restrained professional theme: dark, flat, no gradients or glow."""

from __future__ import annotations

from PySide6.QtGui import QColor, QPalette
from PySide6.QtWidgets import QApplication


def apply_theme(app: QApplication) -> None:
    app.setStyle("Fusion")
    pal = QPalette()
    pal.setColor(QPalette.ColorRole.Window, QColor(43, 43, 43))
    pal.setColor(QPalette.ColorRole.WindowText, QColor(225, 225, 225))
    pal.setColor(QPalette.ColorRole.Base, QColor(32, 32, 32))
    pal.setColor(QPalette.ColorRole.AlternateBase, QColor(48, 48, 48))
    pal.setColor(QPalette.ColorRole.Text, QColor(225, 225, 225))
    pal.setColor(QPalette.ColorRole.Button, QColor(58, 58, 58))
    pal.setColor(QPalette.ColorRole.ButtonText, QColor(225, 225, 225))
    pal.setColor(QPalette.ColorRole.Highlight, QColor(74, 144, 217))
    pal.setColor(QPalette.ColorRole.HighlightedText, QColor(255, 255, 255))
    pal.setColor(QPalette.ColorRole.ToolTipBase, QColor(32, 32, 32))
    pal.setColor(QPalette.ColorRole.ToolTipText, QColor(225, 225, 225))
    pal.setColor(QPalette.ColorRole.PlaceholderText, QColor(140, 140, 140))
    pal.setColor(QPalette.ColorRole.Link, QColor(110, 170, 230))
    app.setPalette(pal)
    # Minimal flat stylesheet: 3px radius max, 1px borders, no shadows.
    app.setStyleSheet(
        """
        QMainWindow, QWidget { font-size: 9pt; }
        QGroupBox { border: 1px solid #555; border-radius: 3px; margin-top: 14px;
                    font-weight: 600; color: #ddd; }
        QGroupBox::title { subcontrol-origin: margin; left: 6px; padding: 0 3px; }
        QPushButton { padding: 4px 12px; border: 1px solid #666; border-radius: 3px;
                      background: #484848; }
        QPushButton:hover { background: #525252; border-color: #777; }
        QPushButton:pressed { background: #3f3f3f; }
        QPushButton:disabled { color: #999; background: #3a3a3a; border-color: #555; }
        QPushButton#Primary { background: #2f6db3; border-color: #2f6db3; color: white; }
        QPushButton#Primary:hover { background: #3579c6; }
        QPushButton#Primary:disabled { background: #3a3a3a; border-color: #555; color: #999; }
        QLineEdit, QSpinBox, QComboBox { padding: 3px 6px; border: 1px solid #5a5a5a;
                      border-radius: 3px; background: #2e2e2e; selection-background-color: #4a90d9; }
        QLineEdit:focus, QSpinBox:focus, QComboBox:focus { border-color: #4a90d9; }
        QProgressBar { border: 1px solid #5a5a5a; border-radius: 3px; background: #2e2e2e;
                       text-align: center; height: 14px; }
        QProgressBar::chunk { background: #4a90d9; }
        QToolBar { spacing: 4px; padding: 2px; border: none; }
        QStatusBar { font-size: 8.5pt; color: #bbb; }
        QSplitter::handle { background: #4a4a4a; }
        QLabel#Dim { color: #999; }
        QLabel#Warn { color: #e0a63c; }
        QLabel#Error { color: #e06c6c; }
        """
    )
