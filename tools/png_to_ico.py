"""Build-time helper: wrap a PNG as a single-image Windows .ico (stdlib only).

Windows Vista and later accept PNG-compressed icon entries, so no re-encoding
is needed - the PNG bytes are embedded verbatim. ICO entries cap at 256x256;
larger sources are refused (shrink assets/logo.png instead of shipping a
bloated icon).

Usage:
    python tools/png_to_ico.py assets/logo.png out.ico
"""

from __future__ import annotations

import struct
import sys
from pathlib import Path

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
MAX_ICON_DIM = 256


class IcoError(RuntimeError):
    pass


def read_png_size(data: bytes) -> tuple[int, int]:
    if data[:8] != PNG_SIGNATURE or len(data) < 24:
        raise IcoError("not a PNG file")
    if data[12:16] != b"IHDR":
        raise IcoError("PNG is missing its IHDR chunk")
    width, height = struct.unpack(">II", data[16:24])
    if width < 1 or height < 1:
        raise IcoError(f"invalid PNG dimensions {width}x{height}")
    return width, height


def png_to_ico(png: bytes) -> bytes:
    width, height = read_png_size(png)
    if width > MAX_ICON_DIM or height > MAX_ICON_DIM:
        raise IcoError(
            f"{width}x{height} exceeds the 256x256 ICO entry limit; "
            "shrink the source PNG instead"
        )

    def dim(value: int) -> int:
        return 0 if value == MAX_ICON_DIM else value  # 0 encodes 256

    header = struct.pack("<HHH", 0, 1, 1)  # reserved, type=icon, 1 image
    entry = struct.pack(
        "<BBBBHHII",
        dim(width), dim(height), 0, 0,  # w, h, palette, reserved
        1, 32,                          # planes, bits per pixel
        len(png), 6 + 16,               # payload size, payload offset
    )
    return header + entry + png


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: png_to_ico.py <input.png> <output.ico>", file=sys.stderr)
        return 2
    try:
        ico = png_to_ico(Path(argv[1]).read_bytes())
    except (OSError, IcoError) as exc:
        print(f"png_to_ico: {exc}", file=sys.stderr)
        return 1
    Path(argv[2]).write_bytes(ico)
    print(f"wrote {argv[2]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
