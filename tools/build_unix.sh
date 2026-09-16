#!/usr/bin/env bash
#
# Build a single-file, windowed (no console) Video Cropper executable.
#
#   ./tools/build_unix.sh
#
# Runs the test suite first (build aborts on failure), then bundles the app:
#   Linux: dist/VideoCropper        (ELF binary)
#   macOS: dist/VideoCropper.app    (application bundle)
#
# FFmpeg/ffprobe are intentionally NOT bundled: the binary resolves them via
# PATH, Tools -> Settings, or a bin/ folder placed next to the executable.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_PY="$ROOT/.venv/bin/python"

if [ ! -x "$VENV_PY" ]; then
  echo "error: no .venv found. Run ./tools/setup_unix.sh first." >&2
  exit 1
fi

cd "$ROOT"

APP_VERSION="$("$VENV_PY" -c 'import video_cropper; print(video_cropper.__version__)')"
echo "==> Building Video Cropper $APP_VERSION (single file, windowed)"

echo "==> Running test suite (gate)"
"$VENV_PY" -m pytest -q

if ! "$VENV_PY" -c 'import PyInstaller' 2>/dev/null; then
  echo "==> Installing build extra (PyInstaller)"
  "$VENV_PY" -m pip install -e "$ROOT[build]"
fi

if [ "$(uname)" = "Darwin" ] && [ -d "$ROOT/dist/VideoCropper.app" ]; then
  rm -rf "$ROOT/dist/VideoCropper.app"
elif [ -f "$ROOT/dist/VideoCropper" ]; then
  rm -f "$ROOT/dist/VideoCropper"
fi

echo "==> Running PyInstaller"
"$VENV_PY" -m PyInstaller \
  --noconfirm --clean \
  --name "VideoCropper" \
  --onefile --windowed \
  --paths "src" \
  --collect-submodules "video_cropper" \
  --exclude-module "tkinter" \
  "src/video_cropper/__main__.py"

echo ""
if [ "$(uname)" = "Darwin" ]; then
  echo "Built dist/VideoCropper.app"
  echo "macOS note: the app is ad-hoc signed - on first launch, right-click -> Open"
  echo "if Gatekeeper blocks it."
else
  BIN="$ROOT/dist/VideoCropper"
  SIZE="$(du -h "$BIN" | cut -f1)"
  echo "Built dist/VideoCropper ($SIZE)"
fi
echo "FFmpeg is external: keep ffmpeg + ffprobe on PATH,"
echo "configure them in Tools -> Settings, or ship a bin/ folder next to the binary."
