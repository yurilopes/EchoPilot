param()
$ErrorActionPreference = "Stop"
Push-Location "services/core"
if (-not (Test-Path ".venv")) {
  throw "Python virtual environment not found. Run ./scripts/setup-dev.ps1 first."
}

# Prefer explicit CUDA runtime resolution for the Python process.
$cudaCandidates = @()
if ($env:CUDA_PATH) { $cudaCandidates += (Join-Path $env:CUDA_PATH "bin") }
$cudaCandidates += @(
  "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.3\bin",
  "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.9\bin",
  "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.8\bin",
  "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.6\bin"
)
foreach ($cudaBin in $cudaCandidates) {
  if (Test-Path $cudaBin) {
    $env:PATH = "$cudaBin;$env:PATH"
  }
}

.\.venv\Scripts\python -m uvicorn realtime_system_transcriber.main:app --host 127.0.0.1 --port 8765 --reload
Pop-Location
