"""Entry point: `python -m video_cropper`."""

from __future__ import annotations

import sys


def main(argv: list[str] | None = None) -> int:
    from video_cropper.app.application import create_application
    from video_cropper.app.main_window import MainWindow

    app = create_application(argv if argv is not None else sys.argv)
    window = MainWindow()
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
