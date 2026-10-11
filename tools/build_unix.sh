#!/usr/bin/env bash
#
# Build a single-file, windowed Video Cropper executable with Rust + Tauri.
#
#   ./tools/build_unix.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Building Video Cropper (Rust + Tauri v2, Portable)"

echo "==> Running Rust test suite (gate)"
cargo test --manifest-path src-tauri/Cargo.toml

echo "==> Building frontend assets (gate)"
pnpm build

echo "==> Compiling optimized release binary"
cargo build --release --manifest-path src-tauri/Cargo.toml

mkdir -p "$ROOT/dist"
cp "$ROOT/src-tauri/target/release/video-cropper" "$ROOT/dist/VideoCropper"

SIZE="$(du -h "$ROOT/dist/VideoCropper" | cut -f1)"
echo ""
echo "Successfully built dist/VideoCropper ($SIZE)"
echo "FFmpeg is external: keep ffmpeg + ffprobe on PATH,"
echo "configure them in Tools -> Settings, or ship a bin/ folder next to the binary."
