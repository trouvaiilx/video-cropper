"""Time formatting / parsing helpers (pure, tested)."""

from __future__ import annotations


def format_seconds(seconds: float | None) -> str:
    if seconds is None or seconds != seconds:  # NaN guard
        return "--:--:--"
    if seconds < 0:
        seconds = 0
    total = int(seconds)
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def format_clock_pair(elapsed: float | None, total: float | None) -> str:
    return f"{format_seconds(elapsed or 0)} / {format_seconds(total)}"


def parse_ffmpeg_speed(text: str | None) -> float | None:
    """Parse FFmpeg speed field like '2.4x' -> 2.4. Returns None when N/A."""
    if not text:
        return None
    t = text.strip().lower().rstrip("x").strip()
    if t in ("", "n/a"):
        return None
    try:
        return float(t)
    except ValueError:
        return None


def compute_eta(elapsed: float, frac: float | None) -> float | None:
    """ETA in seconds given elapsed time and 0..1 progress fraction."""
    if frac is None or frac <= 0.0001 or frac >= 1.0:
        return None
    return elapsed * (1.0 - frac) / frac
