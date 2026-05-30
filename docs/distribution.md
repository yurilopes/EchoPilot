# Distribution Guide (Windows)

## Output artifacts
- `artifacts/EchoPilot-Setup.msi`
- `artifacts/EchoPilot-Portable.zip`

## Preconditions on target PC
- Windows 11 recommended.
- NVIDIA GPU optional. CPU fallback is supported.
- For GPU mode, compatible NVIDIA driver and CUDA runtime support are required.

## Install flow
1. Download MSI and run installer.
2. Launch `EchoPilot` from Start Menu.
3. Open settings, configure API key and model endpoint.
4. Press Start and verify live transcript updates.

## Portable flow
1. Extract ZIP to any folder.
2. Run desktop executable.
3. App starts local backend and loads web UI.

## Troubleshooting
- If transcript is blank: verify system audio is playing and check `/diagnostics`.
- If CUDA inactive: verify driver/runtime and inspect `fallback_reason`.
- If LLM errors: check base URL, model, and API key in Credential Manager.
