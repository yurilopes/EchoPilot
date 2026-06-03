# Architecture

## Data Flow
1. WASAPI loopback capture reads short audio chunks.
2. ASR engine transcribes chunk incrementally.
3. Transcript chunk is appended to accumulated store.
4. WebSocket broadcasts transcript and runtime status.
5. User triggers LLM analysis manually or periodically.
6. DeepSeek analysis response is returned and streamed to UI.

## Components
- Core service (`services/core`): source of truth for runtime and status.
- Web UI (`apps/web`): operational and diagnostic interface.
- Desktop shell (`apps/desktop`): native controls for windowing modes.

## Observability fields
- backend_asr
- capture_device
- model
- language
- avg_chunk_latency_ms
- cuda_available
- cuda_active
- fallback_reason
- llm_connection_status
