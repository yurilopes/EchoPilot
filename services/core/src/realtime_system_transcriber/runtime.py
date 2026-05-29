from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone

from loguru import logger

from realtime_system_transcriber.asr_engine import AsrEngine
from realtime_system_transcriber.audio_capture import WasapiLoopbackCapture
from realtime_system_transcriber.llm_client import LlmClient
from realtime_system_transcriber.secrets import SecretStore
from realtime_system_transcriber.settings import RuntimeSettings
from realtime_system_transcriber.transcript_store import TranscriptStore


@dataclass(slots=True)
class RuntimeState:
    running: bool = False
    capture_device: str = "not-started"
    llm_connection_status: str = "unknown"
    last_analysis: str = ""


class RuntimeController:
    def __init__(self, runtime_settings: RuntimeSettings, secret_store: SecretStore) -> None:
        self.runtime_settings = runtime_settings
        self.secret_store = secret_store
        self.transcript_store = TranscriptStore()
        self.capture = WasapiLoopbackCapture(block_seconds=runtime_settings.chunk_seconds)
        self.asr = AsrEngine(runtime_settings.model_size, runtime_settings.language)
        self.llm = LlmClient()
        self.state = RuntimeState()
        self._runner_task: asyncio.Task[None] | None = None
        self._analysis_task: asyncio.Task[None] | None = None
        self._subscribers: set[asyncio.Queue[dict]] = set()

    async def start(self) -> None:
        if self.state.running:
            return
        self.asr = AsrEngine(self.runtime_settings.model_size, self.runtime_settings.language)
        self.asr.initialize()
        self.capture.start()
        self.state.capture_device = self.capture.device_name
        self.state.running = True
        self._runner_task = asyncio.create_task(self._run_loop(), name="transcribe-runner")
        if self.runtime_settings.analysis_interval_seconds > 0:
            self._analysis_task = asyncio.create_task(self._analysis_loop(), name="analysis-loop")
        logger.info("runtime_started", capture_device=self.state.capture_device)

    async def stop(self) -> None:
        if not self.state.running:
            return
        self.state.running = False
        self.capture.stop()
        if self._runner_task:
            await asyncio.wait([self._runner_task], timeout=2)
        if self._analysis_task:
            self._analysis_task.cancel()
        logger.info("runtime_stopped")

    async def _run_loop(self) -> None:
        while self.state.running:
            try:
                chunk = await asyncio.to_thread(self.capture.read_chunk)
                text = await asyncio.to_thread(self.asr.transcribe_chunk, chunk, self.capture.sample_rate)
                if text:
                    self.transcript_store.add(text)
                    await self.broadcast({"type": "transcript", "text": text, "timestamp": _utc_iso()})
                await self.broadcast({"type": "status", "data": self.status_payload()})
            except Exception as exc:
                logger.exception("run_loop_error", error=str(exc))
                await self.broadcast({"type": "error", "message": str(exc)})
                await asyncio.sleep(0.3)

    async def _analysis_loop(self) -> None:
        while self.state.running:
            await asyncio.sleep(self.runtime_settings.analysis_interval_seconds)
            if self.state.running:
                await self.analyze_now()

    async def analyze_now(self) -> str:
        api_key = self.secret_store.get_api_key()
        if not api_key:
            self.state.llm_connection_status = "missing_api_key"
            raise RuntimeError("API key is not configured")
        transcript = self.transcript_store.full_text().strip()
        if not transcript:
            raise RuntimeError("No transcript available to analyze")

        try:
            result = await self.llm.analyze(
                base_url=self.runtime_settings.base_url,
                model=self.runtime_settings.llm_model,
                api_key=api_key,
                prompt=self.runtime_settings.prompt,
                transcript=transcript,
            )
            self.state.llm_connection_status = "ok"
            self.state.last_analysis = result
            await self.broadcast({"type": "analysis", "text": result, "timestamp": _utc_iso()})
            return result
        except Exception as exc:
            self.state.llm_connection_status = f"error:{exc.__class__.__name__}"
            raise

    async def broadcast(self, payload: dict) -> None:
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                logger.warning("subscriber_queue_full")

    def subscribe(self) -> asyncio.Queue[dict]:
        queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=200)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict]) -> None:
        self._subscribers.discard(queue)

    def status_payload(self) -> dict:
        asr_status = self.asr.status()
        return {
            "running": self.state.running,
            "backend_asr": asr_status.backend_asr,
            "capture_device": self.state.capture_device,
            "model": asr_status.model,
            "language": asr_status.language,
            "avg_chunk_latency_ms": asr_status.avg_chunk_latency_ms,
            "cuda_available": asr_status.cuda_available,
            "cuda_active": asr_status.cuda_active,
            "fallback_reason": asr_status.fallback_reason,
            "llm_connection_status": self.state.llm_connection_status,
            "transcript_chars": len(self.transcript_store.full_text()),
        }


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
