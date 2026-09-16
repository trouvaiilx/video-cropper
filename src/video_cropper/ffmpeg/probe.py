"""ffprobe inspection → VideoMetadata (sync; run in worker thread)."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from video_cropper.models.video_metadata import VideoMetadata


class ProbeError(RuntimeError):
    pass


def _parse_fps(value: object) -> float:
    try:
        if isinstance(value, (int, float)):
            return float(value)
        s = str(value or "0").strip()
        if "/" in s:
            n, _, d = s.partition("/")
            d = float(d or 0)
            return float(n) / d if d else 0.0
        return float(s)
    except (ValueError, ZeroDivisionError):
        return 0.0


def _rotation_of(stream: dict, tags: dict) -> int:
    for key in ("rotate", "rotation"):
        if key in tags:
            try:
                return int(float(str(tags[key]))) % 360
            except ValueError:
                pass
    # displaymatrix side_data_list
    for sd in stream.get("side_data_list", []) or []:
        rot = sd.get("rotation")
        if rot is not None:
            try:
                return int(round(float(rot))) % 360
            except (ValueError, TypeError):
                pass
    return 0


def _pix_fmt_depth(pix_fmt: str) -> int:
    pf = (pix_fmt or "").lower()
    if any(t in pf for t in ("12le", "12be", "p012", "yuv444p12", "yuv420p12")):
        return 12
    if any(t in pf for t in ("10le", "10be", "p010", "yuv444p10", "yuv420p10")):
        return 10
    return 8


def probe_video(path: str, ffprobe_exe: str = "ffprobe", timeout: int = 30) -> VideoMetadata:
    p = Path(path)
    if not p.is_file():
        raise ProbeError(f"File not found: {path}")
    cmd = [
        ffprobe_exe, "-v", "error",
        "-select_streams", "v:0",
        "-show_entries",
        "stream=width,height,codec_name,avg_frame_rate,r_frame_rate,pix_fmt,"
        "duration,display_aspect_ratio,codec_type:stream_tags=rotate,rotation:"
        "format=duration,size,format_name",
        "-of", "json", str(p),
    ]
    # We need audio presence too — second cheap call avoids tangled parsing.
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError as exc:
        raise ProbeError(f"ffprobe not found ({ffprobe_exe}). Install FFmpeg.") from exc
    except subprocess.TimeoutExpired as exc:
        raise ProbeError("ffprobe timed out while reading the file.") from exc
    if proc.returncode != 0:
        raise ProbeError(f"ffprobe could not read this file.\n{(proc.stderr or '').strip()[:800]}")
    try:
        data = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise ProbeError("ffprobe returned unreadable output.") from exc

    streams = data.get("streams", []) or []
    if not streams:
        raise ProbeError("No video stream found in this file.")
    vs = streams[0]
    fmt = data.get("format", {}) or {}
    try:
        size = int(fmt.get("size", 0) or p.stat().st_size)
    except (ValueError, OSError):
        size = 0

    meta = metadata_from_probe(vs, fmt, str(p), file_size=size)
    # Audio presence needs a dedicated stream query (cheap).
    object.__setattr__(meta, "has_audio", _has_audio(str(p), ffprobe_exe))
    return meta


def metadata_from_probe(vs: dict, fmt: dict, path: str, file_size: int = 0) -> VideoMetadata:
    """Pure constructor from one ffprobe video-stream dict + format dict.

    Separated for testability (rotation fixtures). `rotation` is normalized
    to 0/90/180/270; display dims swap for 90/270.
    """
    tags = vs.get("tags", {}) or {}
    try:
        stored_w = int(vs.get("width", 0) or 0)
        stored_h = int(vs.get("height", 0) or 0)
    except (ValueError, TypeError):
        stored_w, stored_h = 0, 0
    rotation = _rotation_of(vs, tags) // 90 * 90 % 360
    if rotation in (90, 270):
        disp_w, disp_h = stored_h, stored_w
    else:
        disp_w, disp_h = stored_w, stored_h
    if disp_w < 2 or disp_h < 2:
        raise ProbeError("Video dimensions could not be determined.")

    duration = 0.0
    for raw in (vs.get("duration"), fmt.get("duration")):
        try:
            duration = float(raw)
            if duration > 0:
                break
        except (TypeError, ValueError):
            continue
    fps = _parse_fps(vs.get("avg_frame_rate") or vs.get("r_frame_rate"))
    pix_fmt = str(vs.get("pix_fmt", "") or "")

    return VideoMetadata(
        path=path,
        display_width=disp_w, display_height=disp_h,
        stored_width=stored_w, stored_height=stored_h,
        rotation=rotation,
        duration=duration,
        fps=fps,
        video_codec=str(vs.get("codec_name", "") or ""),
        pixel_format=pix_fmt,
        bit_depth=_pix_fmt_depth(pix_fmt),
        has_audio=False,
        audio_codec="",
        file_size=file_size,
        container=str(fmt.get("format_name", "") or "").split(",")[0],
    )


def _has_audio(path: str, ffprobe_exe: str) -> bool:
    try:
        proc = subprocess.run(
            [ffprobe_exe, "-v", "error", "-select_streams", "a",
             "-show_entries", "stream=index", "-of", "csv=p=0", str(path)],
            capture_output=True, text=True, timeout=15,
        )
        return bool((proc.stdout or "").strip())
    except Exception:
        return False
