#!/usr/bin/env bash
#
# One-time developer setup for Video Cropper on Linux / macOS.
#
#   ./tools/setup_unix.sh
#
# Creates the project-local virtual environment (.venv), installs the project
# with dev + build extras, and checks that FFmpeg/ffprobe are available.
# Never touches the system Python environment.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${PYTHON:-python3}"
VENV_PY="$ROOT/.venv/bin/python"

step() { echo "==> $*"; }

# 1. Python >= 3.10 available?
if ! command -v "$PYTHON" >/dev/null 2>&1; then
  echo "error: '$PYTHON' not found. Install Python 3.10+ first." >&2
  echo "  Debian/Ubuntu: sudo apt install python3 python3-venv python3-pip ffmpeg" >&2
  echo "  macOS:         brew install python ffmpeg" >&2
  exit 1
fi
PY_VER="$("$PYTHON" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
PY_MINOR="${PY_VER#3.}"
if [ "${PY_VER%%.*}" -ne 3 ] || [ "$PY_MINOR" -lt 10 ]; then
  echo "error: Python 3.10+ is required (found $PY_VER)." >&2
  exit 1
fi
echo "Found Python $PY_VER"

# 2. Virtual environment (project-local, git-ignored).
if [ ! -x "$VENV_PY" ]; then
  step "Creating .venv"
  "$PYTHON" -m venv "$ROOT/.venv"
else
  step ".venv already exists, reusing it"
fi

# 3. Dependencies, inside .venv only.
step "Upgrading pip"
"$VENV_PY" -m pip install --upgrade pip
step "Installing project (dev,build extras)"
"$VENV_PY" -m pip install -e "$ROOT[dev,build]"

# 4. FFmpeg / ffprobe are external binaries (never pip packages).
MISSING=()
for tool in ffmpeg ffprobe; do
  command -v "$tool" >/dev/null 2>&1 || MISSING+=("$tool")
done
if [ "${#MISSING[@]}" -gt 0 ]; then
  echo "warning: missing from PATH: ${MISSING[*]}." >&2
  echo "  Debian/Ubuntu: sudo apt install ffmpeg" >&2
  echo "  macOS:         brew install ffmpeg" >&2
  echo "  ...or set custom paths in the app under Tools -> Settings." >&2
else
  echo "Found ffmpeg + ffprobe on PATH"
fi

echo ""
echo "Done. Next steps:"
echo "  source .venv/bin/activate"
echo "  python -m pytest -q"
echo "  python -m video_cropper"
echo ""
echo "Linux note: PySide6 needs X11/Wayland client libs (e.g. libEGL, libxkbcommon)."
echo "  Debian/Ubuntu: sudo apt install libegl1 libxkbcommon0 libdbus-1-3"
