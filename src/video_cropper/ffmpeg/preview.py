"""Single-frame preview extraction (sync; run in worker thread).

Never decodes the whole file: seeks first, decodes one frame, scales down to
a bounded width. Output is a JPEG in the OS temp dir.
"""

from __future__ import annotations

import subprocess
import tempfile
import time
from pathlib import Path


class PreviewError(RuntimeError):
    pass


def preview_seek_time(duration: float) -> float:
    if duration <= 0:
        return 1.0
    # 10% in, clamped to [0.5, 10]s — fast and usually representative.
    return max(0.5, min(10.0, duration * 0.1))


def extract_preview(input_path: str, ffmpeg_exe: str = "ffmpeg",
                    seek_time: float | None = None,
                    max_width: int = 1920, timeout: int = 60) -> str:
    p = Path(input_path)
    if not p.is_file():
        raise PreviewError(f"File not found: {input_path}")
    if seek_time is None:
        seek_time = 1.0
    out = Path(tempfile.gettempdir()) / f"video_cropper_preview_{int(time.time()*1000)}.jpg"
    # Fast seek (before -i) + one frame. Autorotate stays ON so the preview
    # matches what the crop filter will see.
    scale = f"scale=w='min(iw,{max_width})':h=-2"
    cmd = [
        ffmpeg_exe, "-hide_banner", "-v", "error",
        "-ss", f"{max(0.0, seek_time):.3f}",
        "-i", str(p),
        "-frames:v", "1",
        "-vf", scale,
        "-q:v", "3",
        "-y", str(out),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError as exc:
        raise PreviewError(f"ffmpeg not found ({ffmpeg_exe}). Install FFmpeg.") from exc
    except subprocess.TimeoutExpired as exc:
        raise PreviewError("Preview extraction timed out.") from exc
    if proc.returncode != 0 or not out.is_file():
        detail = (proc.stderr or "").strip()[:600]
        raise PreviewError(f"Could not extract a preview frame.\n{detail}")
    return str(out)
