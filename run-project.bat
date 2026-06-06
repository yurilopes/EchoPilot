@echo off
setlocal

cd /d "%~dp0"

echo [run] Starting EchoPilot...
echo [run] To stop all project processes, run scripts\stop-local.bat
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-local.ps1"
if errorlevel 1 (
  echo.
  echo [run] EchoPilot stopped because startup failed.
  echo [run] Review the error above, then press any key to close this window.
  pause >nul
)

endlocal
