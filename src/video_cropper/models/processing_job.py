"""Processing job model + output-size computation (pure, tested)."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from video_cropper.models.crop_config import CropConfig


class JobState(str, Enum):
    IDLE = "idle"
    VALIDATING = "validating"
    RUNNING = "running"
    CANCELLING = "cancelling"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass(frozen=True)
class EncoderId:
    LIBX264 = "libx264"
    H264_NVENC = "h264_nvenc"
    HEVC_NVENC = "hevc_nvenc"


@dataclass
class ProcessingJob:
    input_path: str
    output_path: str
    crop: CropConfig
    output_width: int
    output_height: int
    encoder: str = EncoderId.LIBX264
    has_audio: bool = True
    duration: float = 0.0
    rotation: int = 0
    state: JobState = JobState.IDLE

    @property
    def needs_scale(self) -> bool:
        return (self.output_width, self.output_height) != (self.crop.width, self.crop.height)

    @property
    def scale_factor(self) -> float:
        if self.crop.width <= 0:
            return 1.0
        return self.output_width / self.crop.width


OUTPUT_PRESETS: tuple[str, ...] = ("Original Crop", "720p", "1080p", "1440p", "4K", "Custom")


def preset_long_side(preset: str) -> int | None:
    """Long-side pixels for a preset, or None for Original/Custom."""
    return {"720p": 1280, "1080p": 1920, "1440p": 2560, "4K": 3840}.get(preset)


def compute_output_size(crop_w: int, crop_h: int, preset: str,
                        custom_w: int = 0, custom_h: int = 0) -> tuple[int, int]:
    """Output (w, h) preserving crop aspect, snapped to even.

    Never upscales except when the caller explicitly picks a larger preset or
    custom size — the caller decides; this function just computes faithfully.
    """
    if crop_w < 2 or crop_h < 2:
        return (0, 0)
    if preset == "Custom" and custom_w >= 2 and custom_h >= 2:
        w, h = custom_w, custom_h
    else:
        target = preset_long_side(preset)
        if target is None:  # Original Crop
            w, h = crop_w, crop_h
        else:
            long_side = max(crop_w, crop_h)
            if long_side <= 0:
                return (crop_w, crop_h)
            factor = target / long_side
            w = max(2, int(round(crop_w * factor)))
            h = max(2, int(round(crop_h * factor)))
    # snap even (required for yuv420 H.264/H.265)
    w -= w % 2
    h -= h % 2
    return max(2, w), max(2, h)


def is_upscale(crop_w: int, crop_h: int, out_w: int, out_h: int) -> bool:
    return out_w > crop_w or out_h > crop_h
