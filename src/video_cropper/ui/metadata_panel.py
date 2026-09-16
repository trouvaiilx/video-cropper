"""Source metadata readout (read-only)."""

from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QFormLayout, QGroupBox, QLabel, QWidget

from video_cropper.models.video_metadata import VideoMetadata
from video_cropper.utils.time import format_seconds


class MetadataPanel(QGroupBox):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("Source", parent)
        form = QFormLayout(self)
        form.setContentsMargins(8, 12, 8, 8)
        form.setSpacing(2)
        self._labels: dict[str, QLabel] = {}
        for key, title in (("file", "File"), ("dims", "Frame"), ("dur", "Duration"),
                           ("video", "Video"), ("audio", "Audio"), ("size", "Size")):
            lab = QLabel("—")
            lab.setWordWrap(True)
            lab.setTextInteractionFlags(lab.textInteractionFlags() | Qt.TextInteractionFlag.TextSelectableByMouse)  # text selectable
            form.addRow(title + ":", lab)
            self._labels[key] = lab

    def set_metadata(self, meta: VideoMetadata) -> None:
        self._labels["file"].setText(meta.filename)
        self._labels["file"].setToolTip(meta.path)
        rot = f", {meta.rotation}°" if meta.rotation else ""
        self._labels["dims"].setText(f"{meta.display_width} × {meta.display_height}{rot}")
        fps = f"{meta.fps:.2f} fps" if meta.fps else "unknown fps"
        dur = format_seconds(meta.duration) if meta.duration else "unknown"
        self._labels["dur"].setText(f"{dur} · {fps}")
        depth = f", {meta.bit_depth}-bit" if meta.bit_depth != 8 else ""
        self._labels["video"].setText(f"{meta.video_codec or 'unknown'}{depth}")
        self._labels["audio"].setText(meta.audio_codec or ("present" if meta.has_audio else "none"))
        if meta.file_size > 0:
            mb = meta.file_size / (1024 * 1024)
            size = f"{mb:,.1f} MB" if mb >= 1 else f"{meta.file_size:,} bytes"
        else:
            size = "—"
        self._labels["size"].setText(size)

    def clear(self) -> None:
        for lab in self._labels.values():
            lab.setText("—")
        self._labels["file"].setToolTip("")
