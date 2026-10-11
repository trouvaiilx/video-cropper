#!/usr/bin/env bash
#
# One-time developer setup for Video Cropper (Rust + Tauri v2) on Linux / macOS.
#
#   ./tools/setup_unix.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Checking prerequisites"

if ! command -v rustc >/dev/null 2>&1 || ! command -v cargo >/dev/null 2>&1; then
  echo "error: Rust is required. Install from https://rustup.rs/ and retry." >&2
  exit 1
fi
echo "Found $(rustc --version) and $(cargo --version)"

if ! command -v node >/dev/null 2>&1; then
  echo "error: Node.js is required. Install from https://nodejs.org/ and retry." >&2
  exit 1
fi
echo "Found Node.js $(node --version)"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "==> Installing pnpm"
  npm install -g pnpm
fi
echo "Found pnpm $(pnpm --version)"

echo "==> Installing frontend dependencies"
pnpm install
pnpm approve-builds --all

MISSING=()
for tool in ffmpeg ffprobe; do
  command -v "$tool" >/dev/null 2>&1 || MISSING+=("$tool")
done
if [ "${#MISSING[@]}" -gt 0 ]; then
  echo "warning: missing from PATH: ${MISSING[*]}." >&2
  echo "  Install ffmpeg and ffprobe, or set custom paths in Tools -> Settings." >&2
else
  echo "Found ffmpeg + ffprobe on PATH"
fi

echo ""
echo "Done! Next steps:"
echo "  pnpm tauri dev            # Launch app in development mode"
echo "  cargo test --manifest-path src-tauri/Cargo.toml  # Run backend unit tests"
echo "  ./tools/build_unix.sh     # Build standalone portable VideoCropper"
