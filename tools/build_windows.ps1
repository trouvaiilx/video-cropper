#Requires -Version 5.1
<#
.SYNOPSIS
  Build a single-file, windowed (no console) VideoCropper.exe with PyInstaller.

.DESCRIPTION
  Runs the test suite first (build aborts on failure), then bundles the app
  into dist\VideoCropper.exe. FFmpeg/ffprobe are intentionally NOT bundled:
  the exe resolves them via PATH, Tools -> Settings, or a bin\ folder placed
  next to the exe (portable distribution).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\build_windows.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"
$DistExe = Join-Path $Root "dist\VideoCropper.exe"

if (-not (Test-Path -LiteralPath $VenvPython)) {
  throw "No .venv found. Run tools\setup_windows.ps1 first."
}

Push-Location $Root
try {
  $AppVersion = & $VenvPython -c "import video_cropper; print(video_cropper.__version__)"
  if ($LASTEXITCODE -ne 0) { throw "Could not import video_cropper from .venv." }
  Write-Host "==> Building Video Cropper $AppVersion (single file, windowed)" -ForegroundColor Cyan

  Write-Host "==> Running test suite (gate)" -ForegroundColor Cyan
  & $VenvPython -m pytest -q
  if ($LASTEXITCODE -ne 0) { throw "Tests failed - build aborted." }

  & $VenvPython -c "import PyInstaller" 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "==> Installing build extra (PyInstaller)" -ForegroundColor Cyan
    & $VenvPython -m pip install -e "$Root[build]"
    if ($LASTEXITCODE -ne 0) { throw "Could not install PyInstaller." }
  }

  if (Test-Path -LiteralPath $DistExe) { Remove-Item -LiteralPath $DistExe -Force }

  $PyArgs = @(
    "-m", "PyInstaller",
    "--noconfirm", "--clean",
    "--name", "VideoCropper",
    "--onefile", "--windowed",
    "--paths", "src",
    "--collect-submodules", "video_cropper",
    "--exclude-module", "tkinter",
    "src/video_cropper/__main__.py"
  )
  Write-Host "==> Running PyInstaller" -ForegroundColor Cyan
  & $VenvPython @PyArgs
  if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed (exit $LASTEXITCODE)." }

  if (-not (Test-Path -LiteralPath $DistExe)) { throw "Expected output missing: $DistExe" }
  $SizeMB = ((Get-Item -LiteralPath $DistExe).Length / 1MB).ToString("0.0")
  Write-Host ""
  Write-Host "Built dist\VideoCropper.exe ($SizeMB MB)" -ForegroundColor Green
  Write-Host "FFmpeg is external: keep ffmpeg.exe + ffprobe.exe on PATH,"
  Write-Host "configure them in Tools -> Settings, or ship a bin\ folder next to the exe."
} finally {
  Pop-Location
}
