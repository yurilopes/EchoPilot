param()
$ErrorActionPreference = "Stop"

Write-Host "[run] Starting core API"
$core = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/run-core.ps1' -WorkingDirectory $PSScriptRoot\.. -PassThru

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
