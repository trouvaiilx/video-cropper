"""Build the FFmpeg argument list for a crop (+ optional scale) job.

Single place where FFmpeg syntax is constructed. Pure function — fully tested.

Pipeline: input (autorotated) → crop → optional scale → encode.
Audio is stream-copied when present. Rotation metadata is cleared because the
pixels are already rotated.
"""

from __future__ import annotations

from video_cropper.models.processing_job import EncoderId, ProcessingJob
from video_cropper.utils.validation import ensure_even_dims


def _even(v: int) -> int:
    v = int(v)
    return v - (v % 2)


def build_video_filter(job: ProcessingJob) -> str:
    c = job.crop
    # Snap crop origin+dims to even for yuv420 safety.
    x = _even(max(0, c.x))
    y = _even(max(0, c.y))
    w, h = ensure_even_dims(max(2, c.width), max(2, c.height))
    parts = [f"crop={w}:{h}:{x}:{y}"]
    if job.needs_scale:
        ow, oh = ensure_even_dims(max(2, job.output_width), max(2, job.output_height))
        parts.append(f"scale={ow}:{oh}:flags=lanczos")
    return ",".join(parts)


def encoder_args(encoder: str) -> list[str]:
    if encoder == EncoderId.H264_NVENC:
        return ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "21",
                "-pix_fmt", "yuv420p"]
    if encoder == EncoderId.HEVC_NVENC:
        return ["-c:v", "hevc_nvenc", "-preset", "p4", "-cq", "23",
                "-pix_fmt", "yuv420p"]
    # CPU H.264 default: best compatibility, sensible quality.
    return ["-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-pix_fmt", "yuv420p"]


def build_ffmpeg_args(job: ProcessingJob, ffmpeg_exe: str = "ffmpeg",
                      overwrite: bool = False) -> list[str]:
    """Full argv including the executable as element 0."""
    vf = build_video_filter(job)
    args: list[str] = [ffmpeg_exe, "-hide_banner", "-y" if overwrite else "-n"]
    args += ["-i", job.input_path]
    args += ["-vf", vf]
    # Map first video + all audio (optional) — avoids subtitle/data map failures.
    args += ["-map", "0:v:0", "-map", "0:a?"]
    args += encoder_args(job.encoder)
    if job.has_audio:
        args += ["-c:a", "copy"]
    # Preserve global metadata but drop stale rotation (pixels pre-rotated).
    args += ["-map_metadata", "0"]
    if job.rotation:
        args += ["-metadata:s:v:0", "rotate=0"]
    # Machine-readable progress on stdout; keep human stats off it.
    args += ["-progress", "pipe:1", "-nostats", "-stats_period", "0.5"]
    args += [job.output_path]
    return args


def args_to_display(argv: list[str]) -> str:
    """Quote argv for diagnostics display (Windows-friendly)."""
    out: list[str] = []
    for a in argv:
        if not a or any(ch in a for ch in (' ', '"', "'")):
            out.append('"' + a.replace('"', '\\"') + '"')
        else:
            out.append(a)
    return " ".join(out)
