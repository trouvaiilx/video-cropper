#Requires -Version 5.1
<#
.SYNOPSIS
  One-time developer setup for Video Cropper (Rust + Tauri v2) on Windows.

.DESCRIPTION
  Checks Rust/Cargo, Node.js, and pnpm. Installs dependencies and checks FFmpeg.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\setup_windows.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "==> Checking development prerequisites" -ForegroundColor Cyan

# 1. Rust / Cargo
try {
  $RustVersion = & rustc --version 2>&1
  $CargoVersion = & cargo --version 2>&1
  Write-Host "Found $RustVersion and $CargoVersion" -ForegroundColor Green
} catch {
  throw "Rust is required. Install from https://rustup.rs/ and retry."
}

# 2. Node.js
try {
  $NodeVersion = & node --version 2>&1
  Write-Host "Found Node.js $NodeVersion" -ForegroundColor Green
} catch {
  throw "Node.js is required. Install from https://nodejs.org/ and retry."
}

# 3. pnpm
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "==> Installing pnpm" -ForegroundColor Cyan
  & npm install -g pnpm
}
$PnpmVersion = & pnpm --version 2>&1
Write-Host "Found pnpm $PnpmVersion" -ForegroundColor Green

# 4. Install Node dependencies
Push-Location $Root
try {
  Write-Host "==> Installing frontend dependencies" -ForegroundColor Cyan
  & pnpm install
  & pnpm approve-builds --all

  # 5. Check FFmpeg
  $Missing = @()
  foreach ($Tool in @("ffmpeg", "ffprobe")) {
    if (-not (Get-Command $Tool -ErrorAction SilentlyContinue)) { $Missing += $Tool }
  }
  if ($Missing.Count -gt 0) {
    Write-Warning ("Missing from PATH: {0}. Install with 'winget install Gyan.FFmpeg' " -f ($Missing -join ", ") +
      "or configure custom paths in the app under Tools -> Settings.")
  } else {
    Write-Host "Found ffmpeg + ffprobe on PATH" -ForegroundColor Green
  }

  Write-Host ""
  Write-Host "Done! Development commands:" -ForegroundColor Green
  Write-Host "  pnpm tauri dev            # Launch app in development mode"
  Write-Host "  cargo test --manifest-path src-tauri/Cargo.toml  # Run backend unit tests"
  Write-Host "  powershell tools\build_windows.ps1  # Build standalone portable VideoCropper.exe"
} finally {
  Pop-Location
}
