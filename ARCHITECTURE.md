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

## Data Flow

```
file (drop / dialog)
  → File validation & drop overlay
  → Tauri invoke (probe_video) → ffprobe → VideoMetadata
  → Tauri invoke (extract_preview) → ffmpeg preview → Base64 JPEG data URL
  → CropCanvas (scene units = preview px)
  → CropConfig (source px, via coordinates.ts continuous bounds)
  → ProcessingJob (+ output/encoder choices)
  → command_builder → ProcessManager (tokio::process::Command)
  → progress parser → Tauri Event (ffmpeg-progress) → ProgressPanel
  → completion/failure → Tauri Event (ffmpeg-finished / ffmpeg-failed)
  → Persistent NotificationToast with quick actions (Open Video / Open Explorer / View Log)
```

## IPC Commands

| Command | Direction | Purpose |
|---|---|---|
| `get_tools` | Frontend → Rust | Resolves system or configured FFmpeg/ffprobe paths |
| `get_encoders` | Frontend → Rust | Queries available video encoders (CPU & NVENC) |
| `probe_video` | Frontend → Rust | Extracts resolution, duration, rotation, streams |
| `extract_preview` | Frontend → Rust | Generates a single high-quality frame preview JPEG |
| `allow_playback` | Frontend → Rust | Scopes single-file playback access to the asset protocol |
| `build_playback_proxy` | Frontend → Rust | Builds an ephemeral video proxy for unsupported formats |
| `cancel_playback_proxy`| Frontend → Rust | Cancels background proxy transcoding |
| `start_encode` | Frontend → Rust | Validates crop and launches background FFmpeg encoding job |
| `cancel_encode` | Frontend → Rust | Immediately terminates FFmpeg and deletes partial output |
| `open_video` | Frontend → Rust | Launches video in default media player via `rundll32` / OS shell |
| `show_in_folder` | Frontend → Rust | Reveals and highlights exported video in Windows Explorer |
| `get_settings` / `set_settings` | Frontend → Rust | Reads and persists app configuration to `%APPDATA%` |
| `get_diagnostics` | Frontend → Rust | Compiles diagnostic report of environment and tools |
| `exit_app` | Frontend → Rust | Cleanly closes main window or terminates app process |

## Orientation & Coordinates

- `ffprobe` reports stored W/H + `rotate` tag / `displaymatrix` side data.
- Display W/H swaps when rotation is 90° or 270°.
- Preview extraction uses FFmpeg's default autorotate, so the preview the user sees matches what the crop filter will see.
- On encode we apply `crop` in display space and clear `rotate` metadata (`rotate=0`) so the output needs no double rotation.
- **Continuous Bounding**: `clampPan` in `coordinates.ts` uses bidirectional bounds (`boundX1 = margin`, `boundX2 = viewW - margin - curW`) rather than static axis-locking, allowing videos of any aspect ratio (16:9, vertical 9:16 shorts, 4:3) to zoom directly into the cursor location.

## Failure Points & Resilience

- **FFmpeg/ffprobe missing**: resolver + blocking banner with Settings shortcut.
- **No audio**: `-map 0:a?` without `-c:a copy` failure; UI shows "None" or "No audio".
- **Odd dimensions with yuv420**: builder snaps crop/scale to even, UI warns.
- **Input == Output**: refused with explicit warning.
- **Cancel / close during encode**: child process termination (`kill()`), wait, partial file removed.
- **VFR / 10-bit / 4K / multi-hour**: never load full video into memory; preview is one frame; progress uses `out_time_ms / duration`.
- **Intrusive Dialog Elimination**: Native `window.alert()` calls are eliminated. Errors surface through non-intrusive in-app notifications and dedicated modals.
- **Process Feedback**: Process completion and failure surface through persistent toasts with interactive actions (Open Video, Open Explorer, View Details).
