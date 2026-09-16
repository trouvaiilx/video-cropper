"""Encoder availability detection (short subprocess, called from worker thread)."""

from __future__ import annotations

import subprocess
from dataclasses import dataclass


@dataclass(frozen=True)
class EncoderInfo:
    id: str
    label: str
    available: bool


WANTED = (
    ("libx264", "CPU · H.264 (libx264)"),
    ("h264_nvenc", "NVIDIA NVENC · H.264"),
    ("hevc_nvenc", "NVIDIA NVENC · H.265"),
)


def detect_encoders(ffmpeg_exe: str, timeout: int = 15) -> list[EncoderInfo]:
    try:
        proc = subprocess.run(
            [ffmpeg_exe, "-hide_banner", "-encoders"],
            capture_output=True, text=True, timeout=timeout,
        )
        text = (proc.stdout or "") + "\n" + (proc.stderr or "")
    except Exception:
        return [EncoderInfo(eid, label, eid == "libx264") for eid, label in WANTED]
    return [EncoderInfo(eid, label, eid in text) for eid, label in WANTED]


def default_encoder(available: list[EncoderInfo]) -> str:
    by_id = {e.id: e.available for e in available}
    if by_id.get("libx264"):
        return "libx264"
    for e in available:
        if e.available:
            return e.id
    return "libx264"
