$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "[debug] Enabling transcript pipeline diagnostics..." -ForegroundColor Cyan
$env:ECHOPILOT_TRANSCRIPT_DEBUG = "1"
$env:VITE_ECHOPILOT_TRANSCRIPT_DEBUG = "1"

Write-Host "[debug] Starting full local stack with debug flags" -ForegroundColor Cyan
Write-Host "[debug] Look for log keys: transcript_debug_raw_chunk and transcript_debug_normalized_chunk" -ForegroundColor Yellow

& "$repoRoot\scripts\run-local.ps1"
