# Realtime System Transcriber

Local-first Windows product for real-time system audio transcription (WASAPI loopback), LLM analysis via OpenAI-compatible APIs, and dual UI delivery (web + desktop with Always On Top and PiP).

## Stack
- Core service: Python + FastAPI + faster-whisper (CTranslate2)
- Web app: React + Vite + TypeScript
- Desktop: Tauri 2
- Secrets: Windows Credential Manager

## Features in this MVP scaffold
- Start/Stop transcription pipeline API.
- WASAPI loopback capture integration path.
- ASR backend with CUDA/CPU fallback status.
- WebSocket streaming for transcript/status events.
- LLM analysis endpoint using base URL + model + prompt.
- Web UI with runtime controls and observability panel.
- Desktop wrapper with Always On Top and PiP toggles.
- Windows scripts for setup, run, and build.

## Quick Start (Windows)
1. Run setup:
```powershell
./scripts/setup-dev.ps1
```
2. Run local stack:
```powershell
./scripts/run-local.ps1
```
3. Open browser UI:
- [http://127.0.0.1:5173](http://127.0.0.1:5173)

## Core API
- `GET /health`
- `GET /diagnostics`
- `GET /settings`
- `PUT /settings`
- `POST /llm/credentials`
- `DELETE /llm/credentials`
- `POST /transcription/start`
- `POST /transcription/stop`
- `POST /analysis/now`
- `GET /transcript`
- `WS /ws`

## Distribution Targets
- MSI installer via Tauri bundling.
- Portable ZIP assembled from desktop build + bundled core runtime.

See [distribution guide](./docs/distribution.md) and [progress log](./docs/progress.md).
