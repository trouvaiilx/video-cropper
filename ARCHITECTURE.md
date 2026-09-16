# Architecture notes — Video Cropper

## Principles

Minimalist UI → precise interaction → robust processing → modular architecture.

- Models are the source of truth (`CropConfig`, `VideoMetadata`, `ProcessingJob`).
- GUI consumes models; it never duplicates coordinate math or FFmpeg syntax.
- All FFmpeg command construction lives in `ffmpeg/command_builder.py`.
- All progress parsing lives in `ffmpeg/progress.py` (pure, tested).
- Long operations never block the GUI thread:
  - ffprobe / preview extraction run in a worker `QThread` (`services/video_service.py`)
  - encoding runs in `QProcess` (`ffmpeg/process.py`) with async stdout parsing
- Scene coordinates == preview pixels. Source coordinates == display (autorotated)
  source pixels. Conversion is a single scale factor owned by `utils/coordinates.py`.

## Data flow

```
file → VideoService → ffprobe → VideoMetadata
                   → ffmpeg preview → QPixmap + preview_scale
                   → CropScene (scene units = preview px)
                   → CropConfig (source px, via coordinates.py)
                   → ProcessingJob (+ output/encoder choices)
                   → command_builder → FfmpegProcess (QProcess)
                   → progress parser → ProgressPanel
```

## Orientation

- ffprobe reports stored W/H + `rotation` tag / displaymatrix.
- Display W/H swaps when rotation is 90/270.
- Preview extraction uses FFmpeg's default autorotate, so the preview the user
  sees matches what the crop filter will see.
- On encode we apply `crop` in display space and clear `rotate` metadata so the
  output needs no rotation.

## Failure points (deliberately handled)

- FFmpeg/ffprobe missing → resolver + blocking banner with Settings shortcut.
- No audio → `-map 0:a?` + no `-c:a copy` failure; UI shows "No audio".
- Odd dimensions with yuv420 → builder snaps crop/scale to even, UI warns.
- input == output → refused with explicit message.
- Cancel / close during encode → QProcess kill, wait, partial file removed.
- VFR / 10-bit / 4K / multi-hour → never load full video; preview is one frame;
  progress uses `out_time_ms / duration`.
