"""Left... right-panel crop controls: ratio + numeric X/Y/W/H + readout.

Owns no model: emits signals, MainWindow owns the CropConfig.
"""

from __future__ import annotations

from PySide6.QtCore import Signal
from PySide6.QtWidgets import (
    QComboBox, QFormLayout, QGroupBox, QHBoxLayout, QLabel,
    QLineEdit, QSpinBox, QVBoxLayout, QWidget,
)

from video_cropper.models.crop_config import (
    PRESET_RATIOS, AspectRatio, parse_custom_ratio, ratio_by_label,
)

_MAX_DIM = 16384


class CropControls(QGroupBox):
    ratio_changed = Signal(object)            # AspectRatio
    values_changed = Signal(int, int, int, int)  # x, y, w, h

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("Crop", parent)
        self._updating = False
        self._ratio = ratio_by_label("Free")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 12, 8, 8)
        layout.setSpacing(6)

        # Ratio row
        ratio_row = QHBoxLayout()
        ratio_row.addWidget(QLabel("Ratio:"))
        self.ratio_combo = QComboBox()
        for r in PRESET_RATIOS:
            self.ratio_combo.addItem(r.label)
        self.ratio_combo.addItem("Custom…")
        self.ratio_combo.setToolTip("Constrain the crop to an aspect ratio (no distortion).")
        self.ratio_combo.currentTextChanged.connect(self._on_ratio_combo)
        ratio_row.addWidget(self.ratio_combo, 1)
        layout.addLayout(ratio_row)

        self.custom_edit = QLineEdit()
        self.custom_edit.setPlaceholderText("Custom W:H, e.g. 2.35:1")
        self.custom_edit.setVisible(False)
        self.custom_edit.editingFinished.connect(self._on_custom_finished)
        layout.addWidget(self.custom_edit)

        # Numeric grid
        form = QFormLayout()
        form.setSpacing(4)
        self.x_spin = self._make_spin("X position in source pixels.")
        self.y_spin = self._make_spin("Y position in source pixels.")
        self.w_spin = self._make_spin("Crop width in source pixels.")
        self.h_spin = self._make_spin("Crop height in source pixels.")
        for spin in (self.x_spin, self.y_spin, self.w_spin, self.h_spin):
            spin.valueChanged.connect(self._on_spin)
        form.addRow("X:", self.x_spin)
        form.addRow("Y:", self.y_spin)
        form.addRow("Width:", self.w_spin)
        form.addRow("Height:", self.h_spin)
        layout.addLayout(form)

        self.info_label = QLabel("No video loaded.")
        self.info_label.setObjectName("Dim")
        self.info_label.setWordWrap(True)
        layout.addWidget(self.info_label)

    # -- widgets -------------------------------------------------------------
    @staticmethod
    def _make_spin(tip: str) -> QSpinBox:
        s = QSpinBox()
        s.setRange(0, _MAX_DIM)
        s.setToolTip(tip)
        s.setMinimumWidth(110)
        return s

    # -- model → UI ------------------------------------------------------------
    def set_bounds(self, w: int, h: int) -> None:
        self._updating = True
        try:
            self.x_spin.setMaximum(max(0, w - 2))
            self.y_spin.setMaximum(max(0, h - 2))
            self.w_spin.setMaximum(max(2, w))
            self.h_spin.setMaximum(max(2, h))
        finally:
            self._updating = False

    def set_crop(self, x: int, y: int, w: int, h: int) -> None:
        self._updating = True
        try:
            self.x_spin.setValue(x)
            self.y_spin.setValue(y)
            self.w_spin.setValue(w)
            self.h_spin.setValue(h)
            self.info_label.setText(f"Crop: {w} × {h}\nPosition: X {x}, Y {y}")
        finally:
            self._updating = False

    def set_ratio(self, label: str) -> None:
        idx = self.ratio_combo.findText(label)
        self._updating = True
        try:
            if idx >= 0:
                self.ratio_combo.setCurrentIndex(idx)
                self.custom_edit.setVisible(label == "Custom…")
            else:
                self.ratio_combo.setCurrentText("Custom…")
                self.custom_edit.setVisible(True)
                self.custom_edit.setText(label)
        finally:
            self._updating = False

    def current_ratio(self) -> AspectRatio:
        return self._ratio

    def set_enabled_all(self, on: bool) -> None:
        for w in (self.ratio_combo, self.custom_edit, self.x_spin,
                  self.y_spin, self.w_spin, self.h_spin):
            w.setEnabled(on)

    # -- UI → model --------------------------------------------------------------
    def _on_ratio_combo(self, text: str) -> None:
        if self._updating:
            return
        if text == "Custom…":
            self.custom_edit.setVisible(True)
            self.custom_edit.setFocus()
            return
        self.custom_edit.setVisible(False)
        self._ratio = ratio_by_label(text)
        self.ratio_changed.emit(self._ratio)

    def _on_custom_finished(self) -> None:
        parsed = parse_custom_ratio(self.custom_edit.text())
        if parsed is None:
            self.custom_edit.setText("")
            return
        self._ratio = parsed
        self.ratio_changed.emit(self._ratio)

    def _on_spin(self) -> None:
        if self._updating:
            return
        self.values_changed.emit(
            self.x_spin.value(), self.y_spin.value(),
            max(2, self.w_spin.value()), max(2, self.h_spin.value()),
        )
