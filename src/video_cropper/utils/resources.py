"""Locate bundled asset files (logo, …) in dev checkouts and frozen builds.

Search order: PyInstaller bundle assets → portable assets/ next to the frozen
executable → repo assets/ (dev checkout) → package assets/. Missing assets
return None so the app always starts, with or without artwork installed.
"""

from __future__ import annotations

import sys
from pathlib import Path

LOGO_NAME = "logo.png"


def default_asset_roots() -> list[Path]:
    roots: list[Path] = []
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        roots.append(Path(meipass) / "assets")
    if getattr(sys, "frozen", False):
        try:
            roots.append(Path(sys.executable).resolve().parent / "assets")
        except Exception:
            pass
    here = Path(__file__).resolve()
    roots.append(here.parents[3] / "assets")  # repo root / assets (dev checkout)
    roots.append(here.parent / "assets")      # package / assets (future use)
    return roots


def find_asset(name: str, roots: list[Path] | None = None) -> Path | None:
    for root in roots if roots is not None else default_asset_roots():
        try:
            candidate = root / name
        except Exception:
            continue
        try:
            if candidate.is_file():
                return candidate
        except OSError:
            continue
    return None


def find_logo() -> Path | None:
    return find_asset(LOGO_NAME)
