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

  $Running = Get-Process -Name VideoCropper -ErrorAction SilentlyContinue
  if ($Running) {
    throw "VideoCropper.exe is running (PID $($Running.Id -join ', ')). Close it before rebuilding."
  }
  if (Test-Path -LiteralPath $DistExe) { Remove-Item -LiteralPath $DistExe -Force }

  # Optional artwork: assets\logo.png becomes the window icon (bundled data).
  # The exe file icon additionally needs .ico: a ready-made assets\logo.ico
  # wins; otherwise the PNG is converted on the fly (stdlib only), which
  # requires it to be 256x256 or smaller - ICO entries cannot be larger.
  $LogoPng = Join-Path $Root "assets\logo.png"
  $IconArgs = @()
  $DataArgs = @()
  if (Test-Path -LiteralPath $LogoPng) {
    $DataArgs = @("--add-data", "$LogoPng;assets")
    $LogoIco = Join-Path $Root "assets\logo.ico"
    if (Test-Path -LiteralPath $LogoIco) {
      $IconArgs = @("--icon", $LogoIco)
    } else {
      $IcoOut = Join-Path ([System.IO.Path]::GetTempPath()) "VideoCropper_logo.ico"
      & $VenvPython (Join-Path $Root "tools\png_to_ico.py") $LogoPng $IcoOut
      if ($LASTEXITCODE -eq 0) {
        $IconArgs = @("--icon", $IcoOut)
      } else {
        Write-Warning "No exe icon: place a 256x256 (or smaller) logo.png or a multi-size logo.ico in assets\."
      }
    }
  } else {
    Write-Host "No assets\logo.png found - building without icon." -ForegroundColor Yellow
  }

  $PyArgs = @(
    "-m", "PyInstaller",
    "--noconfirm", "--clean",
    "--name", "VideoCropper",
    "--onefile", "--windowed",
    "--paths", "src",
    "--collect-submodules", "video_cropper",
    "--exclude-module", "tkinter",
    "src/video_cropper/__main__.py"
  ) + $IconArgs + $DataArgs
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
