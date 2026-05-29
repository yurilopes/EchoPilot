param()
$ErrorActionPreference = "Stop"

Write-Host "[setup] Creating Python venv and installing core dependencies"
Push-Location "services/core"
if (-not (Test-Path ".venv")) {
  python -m venv .venv
}
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\pip install -e .
.\.venv\Scripts\pip install -e .[dev]
Pop-Location

Write-Host "[setup] Installing web dependencies"
Push-Location "apps/web"
npm install
Pop-Location

Write-Host "[setup] Installing desktop dependencies"
Push-Location "apps/desktop"
npm install
Pop-Location

Write-Host "[setup] Done"
