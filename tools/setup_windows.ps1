#Requires -Version 5.1
<#
.SYNOPSIS
  One-time developer setup for Video Cropper on Windows.

.DESCRIPTION
  Creates the project-local virtual environment (.venv), installs the project
  with dev + build extras, and checks that FFmpeg/ffprobe are available.
  Never touches the global Python environment.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\setup_windows.ps1
#>
[CmdletBinding()]
param(
  [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"

function Invoke-Step([string]$Exe, [string[]]$Arguments, [string]$What) {
  Write-Host "==> $What" -ForegroundColor Cyan
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$What failed (exit $LASTEXITCODE)." }
}

# 1. Python >= 3.10 available?
try {
  $VersionLine = & $Python --version 2>&1
} catch {
  throw "Python not found ('$Python'). Install Python 3.10+ from https://www.python.org/downloads/ and retry."
}
$VersionString = ($VersionLine | Out-String)
if ($VersionString -notmatch 'Python 3\.(\d+)\.') { throw "Could not parse Python version from: $VersionString" }
if ([int]$Matches[1] -lt 10) { throw "Python 3.10+ is required (found $VersionString)." }
Write-Host "Found $VersionString" -ForegroundColor Green

# 2. Virtual environment (project-local, git-ignored).
if (-not (Test-Path -LiteralPath $VenvPython)) {
  Invoke-Step $Python @("-m", "venv", (Join-Path $Root ".venv")) "Creating .venv"
} else {
  Write-Host "==> .venv already exists, reusing it" -ForegroundColor Cyan
}

# 3. Dependencies, inside .venv only.
Invoke-Step $VenvPython @("-m", "pip", "install", "--upgrade", "pip") "Upgrading pip"
Invoke-Step $VenvPython @("-m", "pip", "install", "-e", "$Root[dev,build]") "Installing project (dev,build extras)"

# 4. FFmpeg / ffprobe are external binaries (never pip packages).
$Missing = @()
foreach ($Tool in @("ffmpeg", "ffprobe")) {
  if (-not (Get-Command $Tool -ErrorAction SilentlyContinue)) { $Missing += $Tool }
}
if ($Missing.Count -gt 0) {
  Write-Warning ("Missing from PATH: {0}. Install with 'winget install Gyan.FFmpeg' " -f ($Missing -join ", ") +
    "or set custom paths in the app under Tools -> Settings.")
} else {
  Write-Host "Found ffmpeg + ffprobe on PATH" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done. Next steps:" -ForegroundColor Green
Write-Host "  .venv\Scripts\Activate.ps1"
Write-Host "  python -m pytest -q"
Write-Host "  python -m video_cropper"
