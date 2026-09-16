"""PNG -> ICO wrapping: structure, limits, CLI behavior."""

import struct
import sys
import zlib
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parents[1] / "tools"
sys.path.insert(0, str(TOOLS))

from png_to_ico import IcoError, main, png_to_ico, read_png_size


def make_png(width: int = 4, height: int = 4,
             color: tuple[int, int, int] = (1, 2, 3)) -> bytes:
    def chunk(tag: bytes, payload: bytes) -> bytes:
        return (struct.pack(">I", len(payload)) + tag + payload
                + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF))
    raw = b"".join(b"\x00" + bytes(color) * width for _ in range(height))
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw))
            + chunk(b"IEND", b""))


def test_read_png_size():
    assert read_png_size(make_png(64, 32)) == (64, 32)


def test_garbage_rejected():
    with pytest.raises(IcoError):
        read_png_size(b"definitely not a png")
    with pytest.raises(IcoError):
        read_png_size(b"\x89PNG\r\n\x1a\nshort")


def test_ico_structure_round_trips_png():
    png = make_png(64, 32)
    ico = png_to_ico(png)
    reserved, kind, count = struct.unpack("<HHH", ico[:6])
    assert (reserved, kind, count) == (0, 1, 1)
    w, h, pal, _res, planes, bpp, size, offset = struct.unpack("<BBBBHHII", ico[6:22])
    assert (w, h, pal, planes, bpp) == (64, 32, 0, 1, 32)
    assert size == len(png) and offset == 22
    assert ico[offset:offset + size] == png  # payload embedded verbatim


def test_256_encodes_as_zero():
    ico = png_to_ico(make_png(256, 256))
    w, h = struct.unpack("<BB", ico[6:8])
    assert (w, h) == (0, 0)


def test_oversize_refused():
    with pytest.raises(IcoError):
        png_to_ico(make_png(512, 512))


def test_cli_writes_file(tmp_path: Path, capsys):
    src = tmp_path / "logo.png"
    dst = tmp_path / "logo.ico"
    src.write_bytes(make_png(16, 16))
    assert main(["png_to_ico.py", str(src), str(dst)]) == 0
    assert dst.read_bytes()[:4] == b"\x00\x00\x01\x00"
    capsys.readouterr()


def test_cli_bad_args_and_missing_file(tmp_path: Path):
    assert main(["png_to_ico.py"]) == 2
    assert main(["png_to_ico.py", str(tmp_path / "nope.png"),
                 str(tmp_path / "o.ico")]) == 1
