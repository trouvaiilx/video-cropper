"""Tool resolution: overrides, bundled dirs, frozen exe-adjacent bin, PATH."""

import sys
from pathlib import Path

import pytest

from video_cropper.ffmpeg import resolver
from video_cropper.ffmpeg.resolver import bundled_dir, find_tool, resolve_tools


def _exe_name(stem: str) -> str:
    return stem + (".exe" if sys.platform == "win32" else "")


def test_unknown_tool_returns_none():
    assert find_tool("definitely_not_a_real_tool_xyz") is None


def test_explicit_file_override_wins(tmp_path: Path):
    fake = tmp_path / _exe_name("ffmpeg")
    fake.write_bytes(b"fake")
    assert find_tool("ffmpeg", override=str(fake)) == str(fake)


def test_explicit_dir_override_wins(tmp_path: Path):
    d = tmp_path / "mytools"
    d.mkdir()
    (d / _exe_name("ffmpeg")).write_bytes(b"fake")
    assert find_tool("ffmpeg", override=str(d)) == str(d / _exe_name("ffmpeg"))


def test_bundled_dir_returns_path():
    assert isinstance(bundled_dir(), Path)


def test_frozen_exe_adjacent_bin(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Portable dist: <exe-dir>/bin/ffmpeg beats PATH when frozen."""
    bindir = tmp_path / "bin"
    bindir.mkdir()
    wanted = bindir / _exe_name("ffmpeg")
    wanted.write_bytes(b"fake")
    fake_exe = tmp_path / _exe_name("VideoCropper")
    fake_exe.write_bytes(b"fake")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", str(fake_exe), raising=False)
    assert find_tool("ffmpeg") == str(wanted)


def test_resolve_tools_none_when_missing(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(resolver.shutil, "which", lambda *_a, **_k: None)
    monkeypatch.setattr(resolver, "bundled_dir", lambda: Path("/nonexistent-vc-dir"))
    monkeypatch.delenv("FFMPEG_HOME", raising=False)
    monkeypatch.delenv("FFPROBE_HOME", raising=False)
    assert resolve_tools() is None
