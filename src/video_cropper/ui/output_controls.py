"""Output controls: resolution preset, custom size, encoder, output path."""

from __future__ import annotations

from PySide6.QtCore import Signal
from PySide6.QtWidgets import (
    QComboBox, QFormLayout, QGroupBox, QHBoxLayout,
    QLabel, QLineEdit, QPushButton, QSpinBox, QVBoxLayout, QWidget,
)

from video_cropper.models.processing_job import OUTPUT_PRESETS, is_upscale


class OutputControls(QGroupBox):
    changed = Signal()
    browse_requested = Signal()

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("Output", parent)
        self._updating = False
        self._crop_w = 0
        self._crop_h = 0

        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 12, 8, 8)
        layout.setSpacing(6)

        form = QFormLayout()
        form.setSpacing(4)

        self.preset_combo = QComboBox()
        self.preset_combo.addItems(list(OUTPUT_PRESETS))
        self.preset_combo.setToolTip(
            "Output size. Presets scale the long side (720p→1280, 1080p→1920, "
            "1440p→2560, 4K→3840) preserving the crop aspect. Original Crop keeps crop pixels.")
        self.preset_combo.currentTextChanged.connect(self._emit)
        form.addRow("Size:", self.preset_combo)

        size_row = QHBoxLayout()
        self.out_w = QSpinBox()
        self.out_w.setRange(2, 16384)
        self.out_h = QSpinBox()
        self.out_h.setRange(2, 16384)
        for s in (self.out_w, self.out_h):
            s.valueChanged.connect(self._emit)
        size_row.addWidget(self.out_w)
        size_row.addWidget(QLabel("×"))
        size_row.addWidget(self.out_h)
        size_row.addStretch(1)
        form.addRow("Pixels:", size_row)

        self.encoder_combo = QComboBox()
        self.encoder_combo.setToolTip("Encoder. NVENC entries appear only when your FFmpeg build supports them.")
        self.encoder_combo.currentIndexChanged.connect(self._emit)
        form.addRow("Encoder:", self.encoder_combo)
        layout.addLayout(form)

        path_row = QHBoxLayout()
        self.path_edit = QLineEdit()
        self.path_edit.setPlaceholderText("Output file…")
        self.path_edit.textChanged.connect(self._emit)
        self.browse_btn = QPushButton("Browse…")
        self.browse_btn.clicked.connect(self.browse_requested.emit)
        path_row.addWidget(self.path_edit, 1)
        path_row.addWidget(self.browse_btn)
        layout.addLayout(path_row)

        self.note_label = QLabel("")
        self.note_label.setWordWrap(True)
        self.note_label.setObjectName("Dim")
        layout.addWidget(self.note_label)

    # -- data ------------------------------------------------------------------
    def set_encoders(self, items: list[tuple[str, str, bool]], current: str) -> None:
        self._updating = True
        try:
            self.encoder_combo.clear()
            for eid, label, available in items:
                self.encoder_combo.addItem(label if available else f"{label} (unavailable)", eid)
            # Grey out unavailable encoders via the model (Qt has no per-item
            # setEnabled on QComboBox itself).
            try:
                model = self.encoder_combo.model()
                for row, (_, _, available) in enumerate(items):
                    item = model.item(row)
                    if item is not None:
                        item.setEnabled(bool(available))
            except Exception:
                pass
            idx = self.encoder_combo.findData(current)
            if idx >= 0:
                self.encoder_combo.setCurrentIndex(idx)
        finally:
            self._updating = False

    def set_output_size(self, w: int, h: int) -> None:
        self._updating = True
        try:
            self.out_w.setValue(max(2, w))
            self.out_h.setValue(max(2, h))
        finally:
            self._updating = False

    def set_crop_context(self, crop_w: int, crop_h: int) -> None:
        self._crop_w, self._crop_h = crop_w, crop_h
        self._refresh_note()

    def set_path(self, p: str) -> None:
        if self.path_edit.text() != p:
            self._updating = True
            try:
                self.path_edit.setText(p)
            finally:
                self._updating = False

    def values(self) -> tuple[str, int, int, str, str]:
        return (self.preset_combo.currentText(), self.out_w.value(), self.out_h.value(),
                str(self.encoder_combo.currentData() or "libx264"), self.path_edit.text().strip())

    def set_enabled_all(self, on: bool) -> None:
        for w in (self.preset_combo, self.out_w, self.out_h,
                  self.encoder_combo, self.path_edit, self.browse_btn):
            w.setEnabled(on)

    # -- internals ---------------------------------------------------------------
    def _emit(self, *args) -> None:
        if self._updating:
            # still refresh note (programmatic size changes affect upscale warning)
            self._refresh_note()
            return
        # Custom preset implied when user edits pixels directly.
        if self.sender() in (self.out_w, self.out_h):
            if self.preset_combo.currentText() != "Custom":
                self._updating = True
                try:
                    self.preset_combo.setCurrentText("Custom")
                finally:
                    self._updating = False
        self._refresh_note()
        self.changed.emit()

    def _refresh_note(self) -> None:
        if self._crop_w >= 2 and is_upscale(self._crop_w, self._crop_h,
                                            self.out_w.value(), self.out_h.value()):
            self.note_label.setObjectName("Warn")
            self.note_label.setText(
                f"Upscaling {self._crop_w}×{self._crop_h} → "
                f"{self.out_w.value()}×{self.out_h.value()}. Quality will not improve.")
        else:
            self.note_label.setObjectName("Dim")
            self.note_label.setText("Audio is copied without re-encoding when present.")
        self.note_label.style().unpolish(self.note_label)
        self.note_label.style().polish(self.note_label)
