<img src="assets/logo.png" width="120" alt="Video Cropper logo">

# Video Cropper

Minimalist, production-quality desktop utility for visually cropping video frames on Windows.

Built with **Python 3 + PySide6 (Qt 6) + FFmpeg**.

> Drag a rectangle over the region you want to **KEEP** — everything else (audio,
> timing, color metadata) is preserved, and the source file is never modified.

## Requirements

- Windows 10/11 (primary target; no Windows-only APIs in the codebase)
- Python 3.10+ (developed and tested on 3.11)
- FFmpeg **and** ffprobe — install from https://ffmpeg.org/download.html
  (e.g. `winget install Gyan.FFmpeg`) and keep them on `PATH`,
  or point the app at them in **Tools → Settings**

## Setup (isolated virtual environment — always)

One command per OS — creates `.venv`, installs the project with dev + build
extras, and checks FFmpeg:

```powershell
# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File tools\setup_windows.ps1
```

```bash
# Linux / macOS
./tools/setup_unix.sh
```

Then:

```powershell
.venv\Scripts\Activate.ps1   # Windows PowerShell (cmd.exe: .venv\Scripts\activate)
# source .venv/bin/activate  # Linux / macOS
python -m pytest -q
python -m video_cropper
```

Manual equivalent (what the scripts do):

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[dev,build]"
python -c "import sys; print(sys.executable)"   # → ...\video-cropper\.venv\Scripts\python.exe
ffmpeg -version
ffprobe -version
```

Linux note: PySide6 needs X11/Wayland client libs
(`sudo apt install libegl1 libxkbcommon0 libdbus-1-3`) and `python3-venv`
(`sudo apt install python3-venv`). macOS: `brew install python ffmpeg`.

Never install project dependencies into the global Python. `.venv/` is git-ignored.

## Single-file executable (no console window)

The app bundles into one windowed executable via PyInstaller (tests run first
as a build gate; FFmpeg stays external on purpose):

```powershell
# Windows → dist\VideoCropper.exe
powershell -ExecutionPolicy Bypass -File tools\build_windows.ps1
```

```bash
# Linux → dist/VideoCropper | macOS → dist/VideoCropper.app
./tools/build_unix.sh
```

The exe has no console window. It still needs FFmpeg + ffprobe, resolved as:
`Tools → Settings` override → `bin\` folder next to the exe (portable:
ship `VideoCropper.exe` with `bin\ffmpeg.exe` + `bin\ffprobe.exe`) → system
`PATH`. macOS note: the bundle is ad-hoc signed — on first launch,
right-click → Open if Gatekeeper blocks it. `dist/` and `build/` are
git-ignored; only source is committed.

### Application icon

Drop your artwork at **`assets/logo.png`** (repo root; committed like source).
It is used in three places: this README header, the app window/taskbar icon
at runtime, and — on Windows — the exe file icon. The exe icon needs `.ico`
format: provide **`assets/logo.ico`** (multi-size, preferred) or keep
`logo.png` at 256 px or smaller so the build can convert it on the fly with
`tools/png_to_ico.py` (stdlib only, no extra dependency). A larger PNG still
works for the window icon and README; only the exe file icon falls back to
the default. macOS bundles additionally pick up `assets/logo.icns` when
present; Linux uses the PNG.

## Workflow

1. **Open Video** (`Ctrl+O`) or drag a video file onto the window.
2. Inspect source metadata (frame size, duration, fps, codecs) in the **Source** panel.
3. **Left-drag** on the preview to draw the region to keep; drag inside to move,
   drag the square handles to resize.
4. Pick an **aspect ratio** (or type a custom `W:H`); fine-tune **X / Y / Width / Height**.
5. Zoom with **Ctrl + wheel** (cursor-centered, up to 800%), pan with **right-drag**,
   scroll horizontally with **Shift + wheel**, scroll vertically in fine steps
   with **Alt + wheel**, reset with **Fit** (`Ctrl+0`).
6. Choose output **Size** and **Encoder**, set the output file.
7. **Start** (`Ctrl+R`) — watch %, position, speed and ETA. **Cancel** any time:
   FFmpeg is terminated and the partial output is removed.

## Controls reference

| Input | Action |
|---|---|
| Left-drag (empty area) | Create crop |
| Left-drag (inside crop) | Move crop |
| Left-drag (square handle) | Resize crop |
| Right-drag | Pan (when zoomed) |
| Ctrl + wheel | Zoom, centered on cursor (fit … 800%) |
| Shift + wheel | Scroll horizontally |
| Alt + wheel | Scroll vertically in fine steps |
| Ctrl+0 / Ctrl+= / Ctrl− | Fit / zoom in / zoom out |
| Ctrl+O | Open video |
| X / Y / W / H spinboxes | Exact crop in source pixels (synced both ways) |

Crop coordinates are always stored in **source display pixels** (post-rotation,
exactly what the FFmpeg `crop` filter sees) — zooming and panning can never
corrupt them; the conversion lives in one place (`utils/coordinates.py`).

## Output sizes

Presets scale the **long side** preserving the crop aspect (always snapped even
for 4:2:0 compatibility): `720p→1280 · 1080p→1920 · 1440p→2560 · 4K→3840`.
**Original Crop** keeps crop pixels 1:1. Editing pixels directly implies **Custom**.
Upscaling is never automatic — if the output is larger than the crop you get an
explicit warning. Crop origin and dimensions are snapped down to even values
at encode time (at most 1 px) as required by 4:2:0 H.264/H.265.

## Encoders

`CPU · H.264 (libx264, CRF 18, medium)` — default, works everywhere.
`NVIDIA NVENC · H.264 / H.265` — listed only when your FFmpeg build actually
provides them; otherwise greyed out with “(unavailable)”. Detection runs at
load time (`ffmpeg -encoders`). Audio is stream-copied (`-c:a copy`) whenever
the source has an audio stream; audio-less files are handled gracefully.

Rotation (phone footage) is handled end to end: the preview shows autorotated
frames, the crop applies in display space, and stale `rotate` metadata is
cleared on the output so no player double-rotates it.

## Output safety

- The output path defaults to `<name>_cropped.<ext>` next to the input and can
  never equal the input — that job is refused with an explanation.
- Existing outputs require explicit overwrite confirmation.
- Cancel/close mid-encode kills FFmpeg (`QProcess`), waits, and deletes only the
  partial output. The source is only ever opened read-only.

## Settings (persisted via QSettings)

Window geometry, last folders, encoder, ratio, resolution preset, custom
FFmpeg/ffprobe paths, grid toggle. Per-video crop rects are deliberately
**never** persisted.

**Tools → Diagnostics** shows versions, input/crop/output state and the exact
FFmpeg command — one click copies it for bug reports.

## Architecture

```
video_cropper/
  pyproject.toml   Python + PySide6 + dev/build extras
  .gitattributes   LF line endings, binary handling, archive exclusions
  tools/
    setup_windows.ps1  one-command dev setup (venv + deps + FFmpeg check)
    setup_unix.sh      same for Linux / macOS
    build_windows.ps1  test gate + one-file windowed dist\VideoCropper.exe
    build_unix.sh      same → dist/VideoCropper[.app]
  src/video_cropper/
    app/        application factory + MainWindow (layout & wiring only)
    models/     CropConfig · VideoMetadata · ProcessingJob  ← source of truth
    ffmpeg/     resolver · probe · preview · encoder · command_builder · process · progress
    graphics/   CropScene · CropView · CropRectItem · handles · dim overlay · guides
    ui/         theme · crop/output/metadata/progress panels · dialogs
    services/   video_service (worker thread) · processing_service · settings_service
    utils/      coordinates · validation · time · paths
  tests/        crop · coordinates · ratios · ffmpeg commands · progress · sizes · orientation · resolver
```

Rules: the GUI never builds FFmpeg syntax (only `command_builder` does);
progress parsing is pure (`ffmpeg/progress.py`); long work never blocks the UI
thread (probe/preview in a `QThread`, encoding in `QProcess` with `-progress pipe:1`).
See `ARCHITECTURE.md` for the data-flow diagram and failure-point analysis.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| “FFmpeg could not be found” | Install FFmpeg + ffprobe, or set paths in Tools → Settings |
| “No video stream found” | File has no decodable video stream (or is corrupt) |
| NVENC entries unavailable | Your FFmpeg build lacks NVENC or no NVIDIA GPU/driver — use CPU H.264 |
| Output is rotated wrong | Source had exotic rotation metadata — file an issue with Tools → Diagnostics output |
| 10-bit source, 8-bit-looking output | libx264 builds are usually 8-bit; H.265/NVENC preserves depth better |
| Built exe says “FFmpeg could not be found” | The exe does not bundle FFmpeg — put it on PATH, set Tools → Settings, or ship `bin\` next to the exe |

Errors show a one-line explanation; technical details stay expandable in the
dialog instead of a raw traceback.

## Git workflow

Conventional commits per phase (`feat: …`, `fix: …`, `refactor: …`,
`test: …`, `docs: …`, `chore: …`). Check `git log --oneline` — history is the
design record. Never commit `.venv/`, previews, encodes, or temp files
(all covered by `.gitignore`).

## License

MIT
