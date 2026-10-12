<img src="assets/logo.png" width="120" alt="Video Cropper logo">

# Video Cropper

Minimalist, high-performance desktop utility for visually cropping video frames on Windows.

[![bQZeJ.gif](https://s15.gifyu.com/images/bQZeJ.gif)](https://gifyu.com/image/bQZeJ)

Built with **Rust + Tauri v2 + React 19 + TypeScript + FFmpeg**.

> Drag a rectangle over the region you want to **KEEP** — everything else (audio,
> timing, color metadata) is preserved, and the source file is never modified.

*(The legacy Python 3 / PySide6 implementation is archived in the `legacy/python-pyside6` branch).*

## Requirements

- Windows 10/11 (WebView2 runtime is preinstalled on Windows 10/11)
- Rust 1.78+ (tested on 1.98+)
- Node.js 18+ and `pnpm` (or `npm`)
- FFmpeg **and** ffprobe — install from https://ffmpeg.org/download.html
  (e.g. `winget install Gyan.FFmpeg`) and keep them on `PATH`,
  or point the app at them in **Tools → Settings**

## Developer Setup

One command on Windows PowerShell sets up frontend packages and verifies tools:

```powershell
powershell -ExecutionPolicy Bypass -File tools\setup_windows.ps1
```

Run in development mode:

```powershell
pnpm tauri dev
```

Run test suite:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
pnpm build
```

## Single-File Portable Executable (No Console Window)

The app compiles into a standalone, portable windowed executable:

```powershell
powershell -ExecutionPolicy Bypass -File tools\build_windows.ps1
```

Output: **`dist\VideoCropper.exe`** (~10 MB, no runtime installation needed).

FFmpeg + ffprobe remain external binaries resolved in order:
1. `Tools → Settings` custom path override
2. `bin\` folder next to the executable (`VideoCropper.exe` with `bin\ffmpeg.exe` + `bin\ffprobe.exe`)
3. System `PATH`
4. `FFMPEG_HOME` environment variable

## Workflow

1. **Open Video** (`Ctrl+O`) or drag a video file anywhere onto the window. A full-window drop overlay with a dashed border provides immediate visual feedback. Non-video files are gracefully intercepted with descriptive in-app guidance.
2. Inspect source metadata (frame size, duration, fps, codecs, bit depth, file size) in the **Source** panel. Long filenames are cleanly truncated with hover tooltips to preserve the layout.
3. **Left-drag** on the preview to draw the region to keep; drag inside to move, drag the corner/edge handles to resize.
4. Pick an **aspect ratio** (or type a custom `W:H`); fine-tune **X / Y / Width / Height**.
5. **Navigate fluidly**:
   - **Trackpad**: 2-finger swipe pans in 2D without clicking. `Ctrl` + 2-finger swipe zooms centered directly at the cursor.
   - **Mouse**: Scroll wheel zooms centered at the cursor. Middle-click drag or right-click drag pans the canvas.
   - **Keyboard & Toolbar**: `Ctrl + +` / `Ctrl + -` / `Ctrl + 0` (Fit) zoom toward the cursor or screen center.
6. Preview playback directly in the app with the **Player Bar** (`Space` to toggle play/pause, seek slider, loop toggle).
7. Choose output **Size** and **Encoder**, set the output file.
8. **Start** (`Ctrl+R`) — monitor progress %, current time, processing speed, and ETA. **Cancel** anytime: FFmpeg terminates immediately and partial output is cleaned up.
9. **Interactive Completion Toast**: When processing finishes, a persistent toast appears with quick actions:
   - **Open Video**: Opens the output file in the default system media player without console flashes.
   - **Open Explorer**: Opens Windows Explorer and selects/highlights the newly created video file.
   - If processing fails, a persistent error toast offers **View Details** to inspect the full FFmpeg log.

## Controls Reference

| Input | Action |
|---|---|
| Left-drag (empty area) | Create crop rectangle |
| Left-drag (inside crop) | Move crop rectangle |
| Left-drag (square handle) | Resize crop rectangle |
| Trackpad 2-finger swipe | Fluid 2D canvas pan (up, down, left, right) |
| Right-drag / Middle-drag | Canvas pan (when zoomed) |
| Mouse wheel / Ctrl + trackpad swipe | Zoom centered on cursor (fit … 800%) |
| Shift + wheel | Scroll horizontally |
| Alt + wheel | Scroll vertically in fine steps |
| Space | Toggle video playback (when video is loaded) |
| Ctrl + 0 | Fit canvas to window |
| Ctrl + = / Ctrl + − | Zoom in / Zoom out toward cursor |
| Ctrl + O | Open video file dialog |
| Ctrl + R | Start encoding process |
| Ctrl + Shift + Q | Exit application |
| X / Y / W / H inputs | Exact crop in source display pixels (synced both ways) |

Crop coordinates are always stored in **source display pixels** (post-rotation, exactly what the FFmpeg `crop` filter sees) — zooming and panning never corrupt them.

## Output Sizes

Presets scale the **long side** preserving the crop aspect (always snapped even for 4:2:0 compatibility): `720p→1280 · 1080p→1920 · 1440p→2560 · 4K→3840`.
**Original Crop** keeps crop pixels 1:1. Editing pixels directly implies **Custom**.
Upscaling is never automatic — if the output is larger than the crop, an explicit warning is displayed.

## Encoders

- `CPU · H.264 (libx264, CRF 18, medium)` — default, universal compatibility.
- `NVIDIA NVENC · H.264 / H.265` — listed only when your FFmpeg build provides them; otherwise marked with “(unavailable)” and disabled.

Audio is stream-copied (`-c:a copy`) whenever the source has audio; audio-less files are handled gracefully.

## Output Safety & Error Handling

- The output path defaults to `<name>_cropped.<ext>` next to the input and can never equal the input.
- Existing outputs require explicit overwrite confirmation modal.
- Cancel mid-encode terminates FFmpeg, waits, and deletes only the partial output. The source is only ever opened read-only.
- **Zero intrusive native alerts**: All errors, diagnostics, and notifications are handled in-app via non-blocking notifications and structured dialog modals.

## Settings

Settings (last directories, encoder, ratio, resolution preset, custom FFmpeg paths, grid toggle) are persisted in `%APPDATA%\VideoCropper\settings.json`. Per-video crop rectangles are deliberately never persisted.

## License

This project is licensed under the [MIT License](LICENSE).
