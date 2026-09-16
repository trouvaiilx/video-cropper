"""Locate ffmpeg / ffprobe binaries.

Order: explicit override (Settings) → frozen-exe-adjacent bin/ →
PyInstaller bundle bin/ → repo ./bin → system PATH → *_HOME env.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ToolPaths:
    ffmpeg: str
    ffprobe: str


def _candidate(dirpath: Path, name: str) -> Path | None:
    exe = dirpath / (name + (".exe" if sys.platform == "win32" else ""))
    return exe if exe.is_file() else None


def bundled_dir() -> Path:
    # Frozen one-file exe: <exe-dir>/bin lets users ship ffmpeg next to the
    # executable (portable distribution without touching PATH).
    # <repo>/bin and <repo>/src/video_cropper/bin cover dev checkouts,
    # frozen sys._MEIPASS covers files baked in via --add-data.
    roots = []
    if getattr(sys, "frozen", False):
        try:
            roots.append(Path(sys.executable).resolve().parent / "bin")
        except Exception:
            pass
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        roots.append(Path(meipass) / "bin")
    here = Path(__file__).resolve()
    roots.append(here.parents[3] / "bin")          # repo root / bin
    roots.append(here.parent / "bin")              # package / bin
    for r in roots:
        if r.is_dir():
            return r
    return roots[0]


def find_tool(name: str, override: str | None = None) -> str | None:
    if override:
        p = Path(override)
        if p.is_file():
            return str(p)
        # override may point at a directory containing the exe
        if p.is_dir():
            c = _candidate(p, name)
            if c:
                return str(c)
    bdir = bundled_dir()
    if bdir.is_dir():
        c = _candidate(bdir, name)
        if c:
            return str(c)
    found = shutil.which(name)
    if found:
        return found
    # last resort: FFMPEG_HOME / FFPROBE_HOME env
    env = os.environ.get(f"{name.upper()}_HOME") or os.environ.get("FFMPEG_HOME")
    if env:
        c = _candidate(Path(env), name) or _candidate(Path(env) / "bin", name)
        if c:
            return str(c)
    return None


def resolve_tools(ffmpeg_override: str | None = None,
                  ffprobe_override: str | None = None) -> ToolPaths | None:
    ff = find_tool("ffmpeg", ffmpeg_override)
    fp = find_tool("ffprobe", ffprobe_override)
    if ff and fp:
        return ToolPaths(ffmpeg=ff, ffprobe=fp)
    return None


def tool_version(exe: str) -> str:
    try:
        out = subprocess.run([exe, "-version"], capture_output=True, text=True, timeout=10)
        first = (out.stdout or out.stderr or "").splitlines()
        return first[0].strip() if first else "unknown"
    except Exception:
        return "unknown"
