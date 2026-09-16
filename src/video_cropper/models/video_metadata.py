"""Video metadata model (pure dataclass, no Qt)."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class VideoMetadata:
    path: str
    display_width: int
    display_height: int
    stored_width: int = 0
    stored_height: int = 0
    rotation: int = 0  # normalized to 0/90/180/270
    duration: float = 0.0
    fps: float = 0.0
    video_codec: str = ""
    pixel_format: str = ""
    bit_depth: int = 8
    has_audio: bool = False
    audio_codec: str = ""
    file_size: int = 0
    container: str = ""

    @property
    def filename(self) -> str:
        return Path(self.path).name

    @property
    def dimensions_label(self) -> str:
        extra = f" (rotated {self.rotation}°)" if self.rotation else ""
        return f"{self.display_width} × {self.display_height}{extra}"

    @property
    def is_portrait(self) -> bool:
        return self.display_height > self.display_width

    @property
    def needs_even_dims(self) -> bool:
        # yuv420-family subsampled formats require even crop/scale dims.
        pf = (self.pixel_format or "").lower()
        if "420" in pf or pf in ("yuv420p", "yuv420p10le", "yuv420p12le", "nv12", "p010le"):
            return True
        return True  # conservative default for H.264/H.265 outputs


@dataclass(frozen=True)
class PreviewInfo:
    path: str
    width: int
    height: int
    seek_time: float = 0.0
