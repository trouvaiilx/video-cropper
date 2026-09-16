"""Small dialogs: errors, settings, diagnostics, about."""

from __future__ import annotations

import platform

from PySide6.QtWidgets import (
    QApplication, QDialog, QDialogButtonBox, QFileDialog, QFormLayout,
    QHBoxLayout, QLabel, QLineEdit, QMessageBox, QPlainTextEdit,
    QPushButton, QVBoxLayout, QWidget,
)

import video_cropper
from video_cropper.ffmpeg import resolver


def show_error(parent: QWidget | None, title: str, message: str) -> None:
    box = QMessageBox(parent)
    box.setIcon(QMessageBox.Icon.Warning)
    box.setWindowTitle(title)
    # First line = concise explanation; rest = expandable details.
    lines = message.splitlines()
    box.setText(lines[0] if lines else title)
    if len(lines) > 1:
        box.setDetailedText(message)
    box.exec()


def ask_overwrite(parent: QWidget | None, path: str) -> bool:
    ret = QMessageBox.question(
        parent, "Output exists",
        f"“{path}” already exists.\n\nOverwrite it?",
        QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
        QMessageBox.StandardButton.No,
    )
    return ret == QMessageBox.StandardButton.Yes


class SettingsDialog(QDialog):
    def __init__(self, ffmpeg: str, ffprobe: str, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("Settings")
        self.setMinimumWidth(460)
        layout = QVBoxLayout(self)
        form = QFormLayout()

        self.ffmpeg_edit = QLineEdit(ffmpeg)
        self.ffprobe_edit = QLineEdit(ffprobe)
        ff_row = QHBoxLayout()
        ff_row.addWidget(self.ffmpeg_edit, 1)
        ff_btn = QPushButton("Browse…")
        ff_btn.clicked.connect(lambda: self._browse(self.ffmpeg_edit))
        ff_row.addWidget(ff_btn)
        fp_row = QHBoxLayout()
        fp_row.addWidget(self.ffprobe_edit, 1)
        fp_btn = QPushButton("Browse…")
        fp_btn.clicked.connect(lambda: self._browse(self.ffprobe_edit))
        fp_row.addWidget(fp_btn)

        hint = QLabel("Leave empty to use system PATH. Custom paths override PATH.")
        hint.setObjectName("Dim")
        hint.setWordWrap(True)

        form.addRow("ffmpeg:", ff_row)
        form.addRow("ffprobe:", fp_row)
        layout.addLayout(form)
        layout.addWidget(hint)

        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok |
                                   QDialogButtonBox.StandardButton.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    def _browse(self, target: QLineEdit) -> None:
        path, _ = QFileDialog.getOpenFileName(self, "Locate executable", "",
                                              "Executables (*.exe);;All files (*)")
        if path:
            target.setText(path)

    def values(self) -> tuple[str, str]:
        return self.ffmpeg_edit.text().strip(), self.ffprobe_edit.text().strip()


class DiagnosticsDialog(QDialog):
    def __init__(self, body: str, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("Diagnostics")
        self.resize(560, 420)
        layout = QVBoxLayout(self)
        self.text = QPlainTextEdit(body)
        self.text.setReadOnly(True)
        layout.addWidget(self.text, 1)
        row = QHBoxLayout()
        copy_btn = QPushButton("Copy to clipboard")
        copy_btn.clicked.connect(lambda: QApplication.clipboard().setText(self.text.toPlainText()))
        row.addStretch(1)
        row.addWidget(copy_btn)
        close_btn = QPushButton("Close")
        close_btn.clicked.connect(self.accept)
        row.addWidget(close_btn)
        layout.addLayout(row)


def build_diagnostics(app_version: str, ffmpeg_exe: str, ffprobe_exe: str,
                      extra: dict[str, str] | None = None) -> str:
    try:
        import PySide6
        pyside = PySide6.__version__
    except Exception:
        pyside = "unknown"
    lines = [
        f"Video Cropper {app_version}",
        f"Python {platform.python_version()} ({platform.architecture()[0]})",
        f"OS: {platform.system()} {platform.release()}",
        f"PySide6: {pyside}",
        f"ffmpeg: {ffmpeg_exe or 'not found'}",
        f"  {resolver.tool_version(ffmpeg_exe) if ffmpeg_exe else ''}".rstrip(),
        f"ffprobe: {ffprobe_exe or 'not found'}",
        f"  {resolver.tool_version(ffprobe_exe) if ffprobe_exe else ''}".rstrip(),
    ]
    if extra:
        lines.append("")
        lines += [f"{k}: {v}" for k, v in extra.items()]
    return "\n".join(lines)
