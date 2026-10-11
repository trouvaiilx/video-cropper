# Architecture notes — Video Cropper (Rust + Tauri v2)

## Principles

Minimalist UI → precise interaction → robust processing → modular architecture.

- Models are the source of truth (`CropConfig`, `VideoMetadata`, `ProcessingJob`).
- Frontend consumes models; it never duplicates coordinate math or FFmpeg syntax.
- All FFmpeg command construction lives in `src-tauri/src/ffmpeg/command_builder.rs`.
- All progress parsing lives in `src-tauri/src/ffmpeg/progress.rs` (pure, fully tested).
- Long operations never block the UI thread:
  - `ffprobe` / preview extraction run asynchronously via Tokio tasks.
  - Encoding runs in `tokio::process::Command` (`src-tauri/src/ffmpeg/process.rs`) with async stdout line parsing streaming `ffmpeg-progress` events over Tauri IPC.
- Scene coordinates == preview pixels. Source coordinates == display (autorotated) source pixels. Conversion is a single scale factor owned by `src/utils/coordinates.ts` & Rust models.

## Data flow

```
file → Tauri invoke (probe_video) → ffprobe → VideoMetadata
     → Tauri invoke (extract_preview) → ffmpeg preview → Base64 JPEG data URL
     → CropCanvas (scene units = preview px)
     → CropConfig (source px, via coordinates.ts)
     → ProcessingJob (+ output/encoder choices)
     → command_builder → ProcessManager (tokio::process::Command)
     → progress parser → Tauri Event (ffmpeg-progress) → ProgressPanel
```

## Orientation

- `ffprobe` reports stored W/H + `rotate` tag / `displaymatrix` side data.
- Display W/H swaps when rotation is 90° or 270°.
- Preview extraction uses FFmpeg's default autorotate, so the preview the user sees matches what the crop filter will see.
- On encode we apply `crop` in display space and clear `rotate` metadata (`rotate=0`) so the output needs no double rotation.

## Failure points (deliberately handled)

- **FFmpeg/ffprobe missing**: resolver + blocking banner with Settings shortcut.
- **No audio**: `-map 0:a?` without `-c:a copy` failure; UI shows "None" or "No audio".
- **Odd dimensions with yuv420**: builder snaps crop/scale to even, UI warns.
- **input == output**: refused with explicit message.
- **Cancel / close during encode**: child process termination (`kill()`), wait, partial file removed.
- **VFR / 10-bit / 4K / multi-hour**: never load full video; preview is one frame; progress uses `out_time_ms / duration`.
