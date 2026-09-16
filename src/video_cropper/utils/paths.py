"""Filesystem path helpers."""

from __future__ import annotations

import os
from pathlib import Path

VIDEO_EXTENSIONS = {
    ".mp4", ".mkv", ".mov", ".avi", ".webm", ".m4v",
    ".mpg", ".mpeg", ".ts", ".m2ts", ".wmv", ".flv", ".ogv",
}


def is_video_file(path: str | os.PathLike) -> bool:
    return Path(str(path)).suffix.lower() in VIDEO_EXTENSIONS


def suggest_output_path(input_path: str | os.PathLike, suffix: str = "_cropped") -> Path:
    """ foo/bar.mp4 -> foo/bar_cropped.mp4 (never overwrites input)."""
    p = Path(str(input_path))
    candidate = p.with_name(f"{p.stem}{suffix}{p.suffix}")
    if candidate.resolve() == p.resolve():
        candidate = p.with_name(f"{p.stem}{suffix}_out{p.suffix}")
    # Avoid clobbering: append counter if exists
    if candidate.exists():
        i = 2
        while True:
            alt = p.with_name(f"{p.stem}{suffix}_{i}{p.suffix}")
            if not alt.exists():
                return alt
            i += 1
    return candidate


def same_file(a: str | os.PathLike, b: str | os.PathLike) -> bool:
    try:
        return os.path.abspath(os.fspath(a)) == os.path.abspath(os.fspath(b))
    except OSError:
        return False


def ensure_parent_dir(path: str | os.PathLike) -> None:
    parent = Path(str(path)).expanduser().parent
    parent.mkdir(parents=True, exist_ok=True)
