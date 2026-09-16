"""Parse FFmpeg `-progress pipe:1` output (pure, tested, no Qt).

FFmpeg emits `key=value` lines; a `progress=continue|end` line terminates
each report block. We care about `out_time_ms`, `speed`, `frame`.
"""

from __future__ import annotations

from dataclasses import dataclass

from video_cropper.utils.time import compute_eta, parse_ffmpeg_speed


@dataclass
class ProgressUpdate:
    out_time_ms: int = 0
    duration_ms: int = 0
    percent: float = 0.0  # 0..100
    speed: float | None = None
    frame: int = 0
    eta_seconds: float | None = None
    elapsed_seconds: float = 0.0
    done: bool = False


class FfmpegProgressParser:
    def __init__(self, duration_seconds: float = 0.0) -> None:
        self.duration_ms = int(max(0.0, duration_seconds) * 1_000_000)
        self._block: dict[str, str] = {}
        self.last = ProgressUpdate(duration_ms=self.duration_ms)

    def reset(self, duration_seconds: float) -> None:
        self.duration_ms = int(max(0.0, duration_seconds) * 1_000_000)
        self._block.clear()
        self.last = ProgressUpdate(duration_ms=self.duration_ms)

    def feed_line(self, line: str, elapsed_seconds: float = 0.0) -> ProgressUpdate | None:
        """Feed one `key=value` line. Returns an update on block end, else None.

        Tolerates malformed lines (ignored) so a single garbage line can never
        break progress reporting.
        """
        text = (line or "").strip()
        if not text or "=" not in text:
            return None
        key, _, value = text.partition("=")
        key = key.strip()
        value = value.strip()
        self._block[key] = value
        if key != "progress":
            return None
        return self._emit(elapsed_seconds, done=(value == "end"))

    def _emit(self, elapsed: float, done: bool) -> ProgressUpdate:
        b = self._block
        try:
            out_ms = int(float(b.get("out_time_ms", "0") or 0))
        except ValueError:
            out_ms = 0
        try:
            frame = int(float(b.get("frame", "0") or 0))
        except ValueError:
            frame = 0
        speed = parse_ffmpeg_speed(b.get("speed"))
        percent = 0.0
        if self.duration_ms > 0 and out_ms > 0:
            percent = max(0.0, min(100.0, out_ms / self.duration_ms * 100.0))
        if done:
            percent = 100.0
        eta = None if done else compute_eta(elapsed, (percent / 100.0) if percent > 0 else None)
        upd = ProgressUpdate(
            out_time_ms=out_ms, duration_ms=self.duration_ms, percent=percent,
            speed=speed, frame=frame, eta_seconds=eta,
            elapsed_seconds=elapsed, done=done,
        )
        self.last = upd
        self._block.clear()
        return upd

    # Convenience for tests / fallback `-stats_period` stderr parsing --------
    def feed_time_string(self, time_str: str, elapsed_seconds: float = 0.0) -> ProgressUpdate:
        """Feed an `out_time=HH:MM:SS.micro` style value (stderr fallback)."""
        ms = _parse_time_to_ms(time_str)
        self._block["out_time_ms"] = str(ms * 1000)
        self._block["progress"] = "continue"
        return self._emit(elapsed_seconds, done=False)


def _parse_time_to_ms(text: str) -> int:
    """Parse 'HH:MM:SS.micro' (stderr fallback). Garbage → 0, never raises."""
    try:
        hms, _, frac = text.strip().partition(".")
        parts = hms.split(":")
        while len(parts) < 3:
            parts.insert(0, "0")
        h, m, s = (int(float(p)) for p in parts[-3:])
        ms = (h * 3600 + m * 60 + s) * 1000
        digits = "".join(ch for ch in frac.strip() if ch.isdigit())[:3].ljust(3, "0")
        return ms + int(digits)
    except Exception:
        return 0
