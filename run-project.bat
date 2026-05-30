@echo off
setlocal

cd /d "%~dp0"

echo [run] Starting EchoPilot...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-local.ps1"

endlocal
