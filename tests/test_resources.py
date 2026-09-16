"""Asset lookup: search order, first-hit-wins, graceful miss."""

from pathlib import Path

from video_cropper.utils.resources import find_asset, find_logo


def test_first_root_wins(tmp_path: Path):
    first = tmp_path / "a"
    second = tmp_path / "b"
    first.mkdir()
    second.mkdir()
    (first / "logo.png").write_bytes(b"1")
    (second / "logo.png").write_bytes(b"2")
    assert find_asset("logo.png", [first, second]) == first / "logo.png"


def test_falls_through_to_later_root(tmp_path: Path):
    empty = tmp_path / "empty"
    full = tmp_path / "full"
    empty.mkdir()
    full.mkdir()
    (full / "logo.png").write_bytes(b"x")
    assert find_asset("logo.png", [empty, full]) == full / "logo.png"


def test_missing_everywhere_returns_none(tmp_path: Path):
    assert find_asset("logo.png", [tmp_path]) is None
    assert find_asset("logo.png", []) is None


def test_find_logo_uses_logo_name(tmp_path: Path, monkeypatch):
    import video_cropper.utils.resources as res
    monkeypatch.setattr(res, "default_asset_roots", lambda: [tmp_path])
    assert find_logo() is None
    (tmp_path / "logo.png").write_bytes(b"png")
    assert find_logo() == tmp_path / "logo.png"
