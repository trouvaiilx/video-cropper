"""Processing status: start/cancel, progress bar, time/speed/ETA, command line."""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QGroupBox, QHBoxLayout, QLabel, QProgressBar, QPushButton,
    QVBoxLayout, QWidget,
)

from video_cropper.ffmpeg.progress import ProgressUpdate
from video_cropper.utils.time import format_clock_pair, format_seconds


class ProgressPanel(QGroupBox):
    start_requested = Signal()
    cancel_requested = Signal()

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("Process", parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 12, 8, 8)
        layout.setSpacing(6)

        btn_row = QHBoxLayout()
        self.start_btn = QPushButton("Start")
        self.start_btn.setObjectName("Primary")
        self.start_btn.setToolTip("Crop and encode to the output file (Ctrl+R).")
        self.start_btn.clicked.connect(self.start_requested.emit)
        self.cancel_btn = QPushButton("Cancel")
        self.cancel_btn.setToolTip("Stop encoding and remove the partial output.")
        self.cancel_btn.clicked.connect(self.cancel_requested.emit)
        self.cancel_btn.setEnabled(False)
        btn_row.addWidget(self.start_btn)
        btn_row.addWidget(self.cancel_btn)
        layout.addLayout(btn_row)

        self.bar = QProgressBar()
        self.bar.setRange(0, 1000)
        self.bar.setValue(0)
        layout.addWidget(self.bar)

        self.status_label = QLabel("Idle.")
        self.status_label.setObjectName("Dim")
        self.status_label.setWordWrap(True)
        layout.addWidget(self.status_label)

        self.cmd_label = QLabel("")
        self.cmd_label.setObjectName("Dim")
        self.cmd_label.setWordWrap(True)
        self.cmd_label.setTextInteractionFlags(
            self.cmd_label.textInteractionFlags() | Qt.TextInteractionFlag.TextSelectableByMouse)  # selectable
        self.cmd_label.setVisible(False)
        layout.addWidget(self.cmd_label)

    # -- state -------------------------------------------------------------------
    def set_idle(self, msg: str = "Idle.") -> None:
        self.bar.setValue(0)
        self.status_label.setText(msg)
        self.start_btn.setEnabled(True)
        self.cancel_btn.setEnabled(False)

    def set_running(self) -> None:
        self.bar.setValue(0)
        self.status_label.setText("Starting FFmpeg…")
        self.start_btn.setEnabled(False)
        self.cancel_btn.setEnabled(True)

    def show_progress(self, upd: ProgressUpdate, total: float) -> None:
        self.bar.setValue(int(round(upd.percent * 10)))
        speed = f"{upd.speed:.1f}×" if upd.speed else "—"
        eta = format_seconds(upd.eta_seconds) if upd.eta_seconds else "—"
        pos = upd.out_time_ms / 1_000_000  # encoded media position
        self.status_label.setText(
            f"{upd.percent:.1f}% · {format_clock_pair(pos, total)} · "
            f"Speed {speed} · ETA {eta}"
        )

    def show_message(self, msg: str) -> None:
        self.status_label.setText(msg)

    def set_command(self, cmd: str) -> None:
        self.cmd_label.setText(cmd)
        self.cmd_label.setVisible(bool(cmd))
