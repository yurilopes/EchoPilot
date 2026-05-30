param()
$ErrorActionPreference = "Stop"

function Stop-PortProcess {
  param([int]$Port)
  $listeners = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
  if ($listeners) {
    $processIds = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $processIds) {
      if ($processId -ne $PID) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

Write-Host "[run] Cleaning stale listeners on 8765 and 5173"
Stop-PortProcess -Port 8765
Stop-PortProcess -Port 5173

Write-Host "[run] Starting core API"
$core = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/run-core.ps1' -WorkingDirectory $PSScriptRoot\.. -PassThru

Write-Host "[run] Waiting for core health endpoint"
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
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
  throw "Core API did not become healthy on http://127.0.0.1:8765/health"
}

Write-Host "[run] Starting web UI"
$web = Start-Process powershell -ArgumentList '-NoProfile','-Command','cd apps/web; npm run dev -- --host 127.0.0.1 --port 5173' -WorkingDirectory $PSScriptRoot\.. -PassThru

Write-Host "[run] Starting desktop app"
$desktop = Start-Process powershell -ArgumentList '-NoProfile','-Command','cd apps/desktop; npm run dev' -WorkingDirectory $PSScriptRoot\.. -PassThru

Write-Host "[run] Core PID: $($core.Id) | Web PID: $($web.Id) | Desktop PID: $($desktop.Id)"
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
