param()
$ErrorActionPreference = "Stop"

function Add-CargoToPath {
  $cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
  if ((Test-Path $cargoBin) -and ($env:PATH -notlike "*$cargoBin*")) {
    $env:PATH = "$cargoBin;$env:PATH"
  }
}

function Ensure-RustToolchain {
  Add-CargoToPath
  if (Get-Command cargo -ErrorAction SilentlyContinue) {
    Write-Host "[setup] Rust/Cargo found"
    return
  }

  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "Rust/Cargo is required for the Tauri desktop app. Install Rust from https://rustup.rs/ and rerun setup."
  }

  Write-Host "[setup] Installing Rust toolchain with winget"
  winget install --id Rustlang.Rustup --exact --source winget --accept-package-agreements --accept-source-agreements
  Add-CargoToPath

  if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw "Rust was installed, but cargo is not available in this shell. Open a new terminal and rerun run-project.bat."
  }
}

Write-Host "[setup] Creating Python venv and installing core dependencies"
Push-Location "services/core"
if (-not (Test-Path ".venv")) {
  python -m venv .venv
}
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\pip install -e .
.\.venv\Scripts\pip install -e .[dev]
Write-Host "[setup] Installing CUDA runtime wheels for faster-whisper on Windows"
.\.venv\Scripts\pip install -e .[cuda]
Pop-Location

Write-Host "[setup] Installing web dependencies"
Push-Location "apps/web"
npm install
Pop-Location

Write-Host "[setup] Installing desktop dependencies"
Push-Location "apps/desktop"
npm install
Pop-Location

Ensure-RustToolchain

Write-Host "[setup] Done"
