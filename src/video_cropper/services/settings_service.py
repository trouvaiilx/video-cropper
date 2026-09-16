"""Typed QSettings wrapper. Only plain values; never crop rects per-video."""

from __future__ import annotations

from PySide6.QtCore import QSettings

ORG = "VideoCropper"
APP = "VideoCropper"


class SettingsService:
    def __init__(self) -> None:
        self._s = QSettings(ORG, APP)

    # -- window ------------------------------------------------------------
    def geometry(self) -> bytes | None:
        v = self._s.value("window/geometry")
        return bytes(v) if v is not None else None

    def set_geometry(self, data: bytes) -> None:
        self._s.setValue("window/geometry", data)

    def window_state(self) -> bytes | None:
        v = self._s.value("window/state")
        return bytes(v) if v is not None else None

    def set_window_state(self, data: bytes) -> None:
        self._s.setValue("window/state", data)

    # -- preferences --------------------------------------------------------
    def last_dir(self) -> str:
        return str(self._s.value("io/last_dir", "") or "")

    def set_last_dir(self, d: str) -> None:
        self._s.setValue("io/last_dir", d)

    def last_output_dir(self) -> str:
        return str(self._s.value("io/last_output_dir", "") or "")

    def set_last_output_dir(self, d: str) -> None:
        self._s.setValue("io/last_output_dir", d)

    def encoder(self) -> str:
        return str(self._s.value("output/encoder", "libx264") or "libx264")

    def set_encoder(self, e: str) -> None:
        self._s.setValue("output/encoder", e)

    def ratio(self) -> str:
        return str(self._s.value("crop/ratio", "Free") or "Free")

    def set_ratio(self, r: str) -> None:
        self._s.setValue("crop/ratio", r)

    def resolution_preset(self) -> str:
        return str(self._s.value("output/preset", "Original Crop") or "Original Crop")

    def set_resolution_preset(self, p: str) -> None:
        self._s.setValue("output/preset", p)

    def ffmpeg_path(self) -> str:
        return str(self._s.value("tools/ffmpeg", "") or "")

    def set_ffmpeg_path(self, p: str) -> None:
        self._s.setValue("tools/ffmpeg", p)

    def ffprobe_path(self) -> str:
        return str(self._s.value("tools/ffprobe", "") or "")

    def set_ffprobe_path(self, p: str) -> None:
        self._s.setValue("tools/ffprobe", p)

    def show_thirds(self) -> bool:
        v = self._s.value("view/thirds", True)
        return str(v).lower() not in ("0", "false", "no") if not isinstance(v, bool) else v

    def set_show_thirds(self, on: bool) -> None:
        self._s.setValue("view/thirds", bool(on))

    def sync(self) -> None:
        self._s.sync()
