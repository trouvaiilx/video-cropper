"""Crop model — the single source of truth for the region to KEEP.

All coordinates are integers in *source display pixels* (i.e. after
autorotation, matching what the FFmpeg crop filter sees).
"""

from __future__ import annotations

from dataclasses import dataclass

from video_cropper.utils.validation import clamp


@dataclass(frozen=True)
class AspectRatio:
    label: str
    num: int | None  # None == Free
    den: int | None

    @property
    def value(self) -> float | None:
        if not self.num or not self.den:
            return None
        return self.num / self.den

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self.label


FREE = AspectRatio("Free", None, None)

PRESET_RATIOS: tuple[AspectRatio, ...] = (
    FREE,
    AspectRatio("16:9", 16, 9),
    AspectRatio("9:16", 9, 16),
    AspectRatio("4:3", 4, 3),
    AspectRatio("3:4", 3, 4),
    AspectRatio("1:1", 1, 1),
    AspectRatio("4:5", 4, 5),
    AspectRatio("5:4", 5, 4),
)

_RATIO_BY_LABEL = {r.label: r for r in PRESET_RATIOS}


def ratio_by_label(label: str) -> AspectRatio:
    return _RATIO_BY_LABEL.get(label, FREE)


def parse_custom_ratio(text: str) -> AspectRatio | None:
    """Parse 'W:H' (e.g. '2.35:1', '16/9'). Returns None when invalid."""
    t = (text or "").strip().lower().replace("/", ":")
    if ":" not in t:
        return None
    left, _, right = t.partition(":")
    try:
        num = float(left.strip())
        den = float(right.strip())
    except ValueError:
        return None
    if num <= 0 or den <= 0:
        return None
    # Keep label normalized
    return AspectRatio(f"{num:g}:{den:g}", num, den)  # type: ignore[arg-type]


@dataclass
class CropConfig:
    x: int = 0
    y: int = 0
    width: int = 0
    height: int = 0
    bound_w: int = 0  # source display width
    bound_h: int = 0  # source display height

    # -- basic state -----------------------------------------------------
    @property
    def is_valid(self) -> bool:
        return (
            self.width >= 2
            and self.height >= 2
            and self.bound_w >= 2
            and self.bound_h >= 2
        )

    @property
    def area(self) -> int:
        return max(0, self.width) * max(0, self.height)

    def as_tuple(self) -> tuple[int, int, int, int]:
        return (self.x, self.y, self.width, self.height)

    # -- mutation (return new clamped copies; GUI replaces model) --------
    def clamped(self) -> "CropConfig":
        w = clamp(self.width, 2, max(2, self.bound_w)) if self.bound_w else max(2, self.width)
        h = clamp(self.height, 2, max(2, self.bound_h)) if self.bound_h else max(2, self.height)
        x = clamp(self.x, 0, max(0, self.bound_w - w)) if self.bound_w else max(0, self.x)
        y = clamp(self.y, 0, max(0, self.bound_h - h)) if self.bound_h else max(0, self.y)
        return CropConfig(x=x, y=y, width=w, height=h, bound_w=self.bound_w, bound_h=self.bound_h)

    def moved(self, x: int, y: int) -> "CropConfig":
        return CropConfig(
            x=x, y=y, width=self.width, height=self.height,
            bound_w=self.bound_w, bound_h=self.bound_h,
        ).clamped()

    def resized(self, w: int, h: int, anchor_center: bool = False) -> "CropConfig":
        if anchor_center and self.is_valid:
            cx = self.x + self.width / 2.0
            cy = self.y + self.height / 2.0
            nx = int(round(cx - w / 2.0))
            ny = int(round(cy - h / 2.0))
        else:
            nx, ny = self.x, self.y
        return CropConfig(
            x=nx, y=ny, width=max(2, w), height=max(2, h),
            bound_w=self.bound_w, bound_h=self.bound_h,
        ).clamped()

    def full_frame(self) -> "CropConfig":
        return CropConfig(
            x=0, y=0, width=self.bound_w, height=self.bound_h,
            bound_w=self.bound_w, bound_h=self.bound_h,
        ).clamped()

    # -- aspect handling --------------------------------------------------
    def apply_ratio(self, ratio: AspectRatio) -> "CropConfig":
        """Constrain current rect to ratio, keeping center, fitting in bounds."""
        value = ratio.value
        if value is None or not self.is_valid:
            return self.clamped()
        # Fit the largest ratio-matching rect inside current rect, centered.
        w, h = self.width, self.height
        # Try keeping width, adjusting height
        h_from_w = w / value
        if h_from_w <= h:
            nw, nh = w, int(round(h_from_w))
        else:
            nw = int(round(h * value))
            nh = h
        nw = max(2, nw)
        nh = max(2, nh)
        cx = self.x + self.width / 2.0
        cy = self.y + self.height / 2.0
        out = CropConfig(
            x=int(round(cx - nw / 2.0)), y=int(round(cy - nh / 2.0)),
            width=nw, height=nh, bound_w=self.bound_w, bound_h=self.bound_h,
        ).clamped()
        # clamping may break the ratio by 1px when hitting edges; re-fit once
        return out._refit_ratio(value)

    def _refit_ratio(self, value: float) -> "CropConfig":
        # Shrink to fit ratio exactly within current (already clamped) rect.
        w, h = self.width, self.height
        h_from_w = w / value
        if abs(h_from_w - h) <= 1.0:
            # snap the smaller side
            if h_from_w < h:
                h = max(2, int(round(h_from_w)))
            else:
                w = max(2, int(round(h * value)))
            y = min(self.y, max(0, self.bound_h - h))
            x = min(self.x, max(0, self.bound_w - w))
            return CropConfig(x=x, y=y, width=w, height=h,
                              bound_w=self.bound_w, bound_h=self.bound_h).clamped()
        return self

    def matches_ratio(self, ratio: AspectRatio, tol: float = 0.005) -> bool:
        value = ratio.value
        if value is None or self.height == 0:
            return True
        return abs((self.width / self.height) - value) <= tol

    def to_filter(self) -> str:
        c = self.clamped()
        return f"crop={c.width}:{c.height}:{c.x}:{c.y}"
