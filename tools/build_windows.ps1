#Requires -Version 5.1
<#
.SYNOPSIS
  Build a single-file, windowed (no console) portable VideoCropper.exe with Rust + Tauri.

.DESCRIPTION
  Runs the test suite and frontend build first as gates, then compiles the
  release Rust binary with embedded frontend and window icon, placing the
  portable executable into dist\VideoCropper.exe.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\build_windows.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$ReleaseExe = Join-Path $Root "src-tauri\target\release\video-cropper.exe"
$DistDir = Join-Path $Root "dist"
$DistExe = Join-Path $DistDir "VideoCropper.exe"

Push-Location $Root
try {
  Write-Host "==> Building Video Cropper (Rust + Tauri v2, Portable)" -ForegroundColor Cyan

  Write-Host "==> Running Rust test suite (gate)" -ForegroundColor Cyan
  & cargo test --manifest-path src-tauri/Cargo.toml
  if ($LASTEXITCODE -ne 0) { throw "Rust tests failed - build aborted." }

  Write-Host "==> Building frontend assets (gate)" -ForegroundColor Cyan
  & pnpm build
  if ($LASTEXITCODE -ne 0) { throw "Frontend build failed - build aborted." }

  $Running = Get-Process -Name VideoCropper -ErrorAction SilentlyContinue
  if ($Running) {
    throw "VideoCropper.exe is currently running. Close it before rebuilding."
  }

  Write-Host "==> Compiling optimized release binary with embedded assets" -ForegroundColor Cyan
  & pnpm tauri build --no-bundle
  if ($LASTEXITCODE -ne 0) { throw "Tauri release build failed (exit $LASTEXITCODE)." }

  if (-not (Test-Path -LiteralPath $ReleaseExe)) {
    throw "Expected release output missing: $ReleaseExe"
  }

  if (-not (Test-Path -LiteralPath $DistDir)) {
    New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
  }

  Copy-Item -LiteralPath $ReleaseExe -Destination $DistExe -Force

  $SizeMB = ((Get-Item -LiteralPath $DistExe).Length / 1MB).ToString("0.1")
  Write-Host ""
  Write-Host "Successfully built dist\VideoCropper.exe ($SizeMB MB)" -ForegroundColor Green
  Write-Host "Portable distribution: keep ffmpeg.exe + ffprobe.exe on PATH,"
  Write-Host "configure them in Tools -> Settings, or ship a bin\ folder next to the exe."
} finally {
  Pop-Location
}
