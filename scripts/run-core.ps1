param()
$ErrorActionPreference = "Stop"
Push-Location "services/core"
if (-not (Test-Path ".venv")) {
  throw "Python virtual environment not found. Run ./scripts/setup-dev.ps1 first."
}
.\.venv\Scripts\uvicorn realtime_system_transcriber.main:app --host 127.0.0.1 --port 8765 --reload
Pop-Location
