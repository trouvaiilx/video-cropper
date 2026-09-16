"""Source <-> preview coordinate conversions.

Scene units are preview pixels. Source units are display (autorotated)
source pixels. Conversion is a single uniform scale plus rounding.

All math lives here so graphics code and tests share one implementation.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PreviewMapping:
    """Maps between source display pixels and preview pixels."""

    source_w: int
    source_h: int
    preview_w: int
    preview_h: int

    @property
    def scale(self) -> float:
        """Preview pixels per source pixel (uniform)."""
        if self.source_w <= 0 or self.preview_w <= 0:
            return 1.0
        return self.preview_w / self.source_w

    @property
    def inv_scale(self) -> float:
        s = self.scale
        return 1.0 / s if s else 1.0

    def source_to_preview(self, x: float, y: float, w: float, h: float) -> tuple[float, float, float, float]:
        s = self.scale
        return x * s, y * s, w * s, h * s

    def preview_to_source(self, x: float, y: float, w: float, h: float) -> tuple[int, int, int, int]:
        inv = self.inv_scale
        return (
            int(round(x * inv)),
            int(round(y * inv)),
            int(round(w * inv)),
            int(round(h * inv)),
        )


def compute_preview_size(source_w: int, source_h: int, max_width: int = 1920) -> tuple[int, int]:
    """Downscale preserving aspect so the longest... actually cap width.

    Keeps aspect ratio; never upscales. Always returns even dimensions so the
    preview stays representative of encoder-compatible sizes.
    """
    if source_w <= 0 or source_h <= 0:
        return (640, 360)
    if source_w <= max_width:
        w, h = source_w, source_h
    else:
        factor = max_width / source_w
        w = max_width
        h = max(2, int(round(source_h * factor)))
    # snap to even
    w -= w % 2
    h -= h % 2
    return max(2, w), max(2, h)
