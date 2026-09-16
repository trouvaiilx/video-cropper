"""Small numeric validation helpers. Single place for clamping/snapping rules."""

from __future__ import annotations


def clamp(value: int, low: int, high: int) -> int:
    if low > high:
        low, high = high, low
    return max(low, min(high, value))


def clamp_f(value: float, low: float, high: float) -> float:
    if low > high:
        low, high = high, low
    return max(low, min(high, value))


def snap_down_even(value: int) -> int:
    """Round down to the nearest even integer (minimum 2 for dimensions)."""
    v = int(value) // 2 * 2
    return v


def ensure_even_dims(w: int, h: int) -> tuple[int, int]:
    w2 = max(2, snap_down_even(w))
    h2 = max(2, snap_down_even(h))
    return w2, h2


def ensure_even_origin(x: int, y: int) -> tuple[int, int]:
    return snap_down_even(x), snap_down_even(y)
