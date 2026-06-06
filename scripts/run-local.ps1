param()
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDir = Join-Path $root "services/core/runtime"
$logDir = Join-Path $runtimeDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Add-CargoToPath {
  $cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
  if ((Test-Path $cargoBin) -and ($env:PATH -notlike "*$cargoBin*")) {
    $env:PATH = "$cargoBin;$env:PATH"
  }
}

function Get-FileTail {
  param(
    [string]$Path,
    [int]$LineCount = 80
  )
  if (-not (Test-Path $Path)) {
    return @()
  }
  return Get-Content -Path $Path -Tail $LineCount -ErrorAction SilentlyContinue
}

function Ensure-DevEnvironment {
  Add-CargoToPath
  $missing = @()
  if (-not (Test-Path (Join-Path $root "services/core/.venv/Scripts/python.exe"))) {
    $missing += "core Python virtual environment"
  }
  if (-not (Test-Path (Join-Path $root "apps/web/node_modules"))) {
    $missing += "web node_modules"
  }
  if (-not (Test-Path (Join-Path $root "apps/desktop/node_modules"))) {
    $missing += "desktop node_modules"
  }
  if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    $missing += "Rust/Cargo toolchain"
  }
  if ($missing.Count -eq 0) {
    return
  }

  Write-Host ("[run] Missing dependencies: " + ($missing -join ", "))
  Write-Host "[run] Running scripts\setup-dev.ps1"
  & (Join-Path $root "scripts/setup-dev.ps1")
  Add-CargoToPath
}

function Stop-PortProcess {
  param([int]$Port)
  $listeners = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" -and $_.OwningProcess -gt 0 }
  if ($listeners) {
    $processIds = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $processIds) {
      if ($processId -ne $PID) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

Ensure-DevEnvironment

Write-Host "[run] Cleaning stale listeners on 8765 and 5173"
Stop-PortProcess -Port 8765
Stop-PortProcess -Port 5173

Write-Host "[run] Starting core API"
$coreOut = Join-Path $logDir "core.out.log"
$coreErr = Join-Path $logDir "core.err.log"
$webOut = Join-Path $logDir "web.out.log"
$webErr = Join-Path $logDir "web.err.log"
$desktopOut = Join-Path $logDir "desktop.out.log"
$desktopErr = Join-Path $logDir "desktop.err.log"
Remove-Item -LiteralPath @($coreOut, $coreErr, $webOut, $webErr, $desktopOut, $desktopErr) -Force -ErrorAction SilentlyContinue
$core = Start-Process powershell `
  -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/run-core.ps1' `
  -WorkingDirectory $root `
  -RedirectStandardOutput $coreOut `
  -RedirectStandardError $coreErr `
  -PassThru

Write-Host "[run] Waiting for core health endpoint"
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
  if ($core.HasExited) {
    break
  }
  try {
    $resp = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8765/health -TimeoutSec 2
    if ($resp.StatusCode -eq 200) {
      $ready = $true
      break
    }
  }
  catch {}
}
if (-not $ready) {
  Write-Host "[run] Core API did not become healthy on http://127.0.0.1:8765/health"
  Write-Host "[run] Core stdout log: $coreOut"
  Get-FileTail -Path $coreOut | ForEach-Object { Write-Host $_ }
  Write-Host "[run] Core stderr log: $coreErr"
  Get-FileTail -Path $coreErr | ForEach-Object { Write-Host $_ }
  if ($core.HasExited) {
    throw "Core API exited early with code $($core.ExitCode)"
  }
  throw "Core API did not become healthy on http://127.0.0.1:8765/health"
}

Write-Host "[run] Starting web UI"
$web = Start-Process powershell `
  -ArgumentList '-NoProfile','-Command','cd apps/web; npm.cmd run dev -- --host 127.0.0.1 --port 5173' `
  -WorkingDirectory $root `
  -RedirectStandardOutput $webOut `
  -RedirectStandardError $webErr `
  -PassThru

if (Get-Command cargo -ErrorAction SilentlyContinue) {
  Write-Host "[run] Starting desktop app"
  $desktop = Start-Process powershell `
    -ArgumentList '-NoProfile','-Command','cd apps/desktop; npm.cmd run dev' `
    -WorkingDirectory $root `
    -RedirectStandardOutput $desktopOut `
    -RedirectStandardError $desktopErr `
    -PassThru
} else {
  $desktop = $null
  Write-Warning "[run] Rust/Cargo was not found on PATH. Skipping Tauri desktop shell."
  Write-Warning "[run] Install Rust from https://rustup.rs/ to enable the desktop app. The web UI is still available at http://127.0.0.1:5173"
}

if ($desktop) {
  Write-Host "[run] Core PID: $($core.Id) | Web PID: $($web.Id) | Desktop PID: $($desktop.Id)"
} else {
  Write-Host "[run] Core PID: $($core.Id) | Web PID: $($web.Id) | Desktop PID: skipped"
}
Write-Host "[run] Logs: $logDir"
Write-Host "[run] Web UI: http://127.0.0.1:5173"
Write-Host "[run] Use scripts\stop-local.bat to stop all EchoPilot processes."
Write-Host "[run] Press Ctrl+C in this terminal to stop this script."

try {
  while ($true) { Start-Sleep -Seconds 5 }
}
finally {
  foreach ($p in @($core, $web, $desktop)) {
    if ($p -and -not $p.HasExited) {
      Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    }
  }
}
