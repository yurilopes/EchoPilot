@echo off
setlocal

set "ROOT=%~dp0.."

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'SilentlyContinue';" ^
  "$root = (Resolve-Path '%ROOT%').Path;" ^
  "Write-Host '[stop] Stopping EchoPilot local services';" ^
  "$portPids = @(Get-NetTCPConnection -LocalPort 8765,5173 | Where-Object { $_.State -eq 'Listen' -and $_.OwningProcess -gt 0 -and (Get-Process -Id $_.OwningProcess) } | Select-Object -ExpandProperty OwningProcess -Unique);" ^
  "foreach ($pidToStop in $portPids) { if ($pidToStop -and $pidToStop -ne $PID) { Write-Host ('[stop] Port process PID ' + $pidToStop); taskkill.exe /PID $pidToStop /T /F | Out-Null; Stop-Process -Id $pidToStop -Force; } }" ^
  "$patterns = @('scripts\\run-local.ps1','scripts\\run-core.ps1','uvicorn realtime_system_transcriber.main:app','apps/web; npm.cmd run dev','apps\\web; npm.cmd run dev','vite --host 127.0.0.1 --port 5173','apps/desktop; npm run dev','apps\\desktop; npm run dev','tauri dev','realtime_system_transcriber_desktop');" ^
  "$processes = Get-CimInstance Win32_Process | Where-Object { $cmd = $_.CommandLine; $_.ProcessId -ne $PID -and $cmd -and ($patterns | Where-Object { $pattern = $_; $cmd -like ('*' + $pattern + '*') }) };" ^
  "foreach ($process in $processes) { Write-Host ('[stop] EchoPilot process PID ' + $process.ProcessId + ' ' + $process.Name); taskkill.exe /PID $process.ProcessId /T /F | Out-Null; Stop-Process -Id $process.ProcessId -Force; }" ^
  "for ($i = 0; $i -lt 10; $i++) { $remaining = @(Get-NetTCPConnection -LocalPort 8765,5173 | Where-Object { $_.State -eq 'Listen' -and $_.OwningProcess -gt 0 -and (Get-Process -Id $_.OwningProcess) } | Select-Object -ExpandProperty OwningProcess -Unique); if ($remaining.Count -eq 0) { break }; foreach ($pidToStop in $remaining) { Write-Host ('[stop] Waiting on listener PID ' + $pidToStop); taskkill.exe /PID $pidToStop /T /F | Out-Null; Stop-Process -Id $pidToStop -Force }; Start-Sleep -Milliseconds 500 }" ^
  "$remainingPorts = @(Get-NetTCPConnection -LocalPort 8765,5173 | Where-Object { $_.State -eq 'Listen' -and $_.OwningProcess -gt 0 -and (Get-Process -Id $_.OwningProcess) } | Select-Object -ExpandProperty OwningProcess -Unique);" ^
  "if ($remainingPorts.Count -gt 0) { Write-Host ('[stop] Warning: remaining listeners: ' + ($remainingPorts -join ', ')); exit 1 }" ^
  "Write-Host '[stop] Done';"

exit /b %ERRORLEVEL%
