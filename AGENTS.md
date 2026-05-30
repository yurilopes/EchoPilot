# AGENTS.md

## Project
- Name: `realtime-system-transcriber`
- Scope: local-first Windows app for system audio transcription and LLM analysis.

## Agent Rules
- Never use em dash in generated documentation or user-facing copy.
- Primary platform is Windows 11.
- Prioritize end-to-end functionality early, then refine.
- Keep logs structured and actionable.
- Do not hardcode credentials.
- All repository artifacts must be written in English, including `README.md` and every `.md` documentation file.
- Keep source code and `.md` files near 300 lines maximum. Small overflow is acceptable when splitting would hurt readability, but prefer modularization before files grow much beyond this threshold.

## Architecture Snapshot
- `services/core`: Python FastAPI service with WASAPI loopback, ASR, transcript buffer, and LLM integration.
- `apps/web`: React + Vite operational UI.
- `apps/desktop`: Tauri 2 desktop shell with Always On Top and PiP toggles.
- `scripts`: single-command setup, run, build, and diagnostics.
- `docs`: technical notes and progress logs.

## Operating Conventions
- Settings: `.env` plus `services/core/runtime/settings.json`.
- Secrets: Windows Credential Manager via Python keyring.
- Core API bound to `127.0.0.1:8765`.

## Expected Commands
- Setup: `./scripts/setup-dev.ps1`
- Run all: `./scripts/run-local.ps1`
- Build Windows: `./scripts/build-windows.ps1`

## Observability Contract
Runtime status must expose and log:
- `backend_asr`
- `capture_device`
- `model`
- `language`
- `avg_chunk_latency_ms`
- `cuda_available`
- `cuda_active`
- `fallback_reason`
- `llm_connection_status`
