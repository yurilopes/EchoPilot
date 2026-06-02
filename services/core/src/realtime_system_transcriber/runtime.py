from __future__ import annotations

import asyncio
import hashlib
import os
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
    analysis_in_progress: bool = False
    last_analysis_signature: str = ""


class RuntimeController:
    def __init__(self, runtime_settings: RuntimeSettings, secret_store: SecretStore) -> None:
        self.runtime_settings = runtime_settings
        self.secret_store = secret_store
        self.transcript_store = TranscriptStore()
        self.capture = WasapiLoopbackCapture(block_seconds=runtime_settings.chunk_seconds)
        self.asr = AsrEngine(runtime_settings.asr_engine, runtime_settings.model_id, runtime_settings.language)
        self.llm = LlmClient()
        self.state = RuntimeState()
        self._runner_task: asyncio.Task[None] | None = None
        self._analysis_task: asyncio.Task[None] | None = None
        self._subscribers: set[asyncio.Queue[dict]] = set()
        self._debug_transcript = os.environ.get("ECHOPILOT_TRANSCRIPT_DEBUG", "").strip() == "1"
        self._debug_chunk_count = 0
        self._analysis_lock = asyncio.Lock()
        self._last_analyzed_transcript = ""

    async def start(self) -> None:
        if self.state.running:
            return
        self.asr = AsrEngine(self.runtime_settings.asr_engine, self.runtime_settings.model_id, self.runtime_settings.language)
        self.asr.initialize()
        if self.runtime_settings.clear_transcript_on_start:
            await self.clear_transcript()
        self.capture.start()
        self.state.capture_device = self.capture.device_name
        self.state.running = True
        self._runner_task = asyncio.create_task(self._run_loop(), name="transcribe-runner")
        await self._sync_analysis_task()
        logger.info("runtime_started", capture_device=self.state.capture_device)

    async def stop(self) -> None:
        if not self.state.running:
            return
        self.state.running = False
        self.capture.stop()
        if self._runner_task:
            await asyncio.wait([self._runner_task], timeout=2)
        await self._sync_analysis_task()
        logger.info("runtime_stopped")

    async def apply_runtime_settings(self, runtime_settings: RuntimeSettings) -> None:
        self.runtime_settings = runtime_settings
        self.capture.block_seconds = runtime_settings.chunk_seconds
        self.capture.block_size = int(self.capture.sample_rate * runtime_settings.chunk_seconds)

        if not self.state.running:
            return

        await self._sync_analysis_task()

    async def clear_transcript(self) -> None:
        self.transcript_store.clear()
        self.state.last_analysis = ""
        self.state.last_analysis_signature = ""
        self.state.analysis_in_progress = False
        self._last_analyzed_transcript = ""
        await self.broadcast({"type": "transcript_reset", "timestamp": _utc_iso()})
        await self.broadcast({"type": "analysis_reset", "timestamp": _utc_iso()})
        await self.broadcast({"type": "status", "data": self.status_payload()})

    async def _run_loop(self) -> None:
        while self.state.running:
            try:
                chunk = await asyncio.to_thread(self.capture.read_chunk)
                text = await asyncio.to_thread(self.asr.transcribe_chunk, chunk, self.capture.sample_rate)
                if text:
                    if self._debug_transcript:
                        self._debug_chunk_count += 1
                        if self._debug_chunk_count % 20 == 0:
                            logger.info(
                                "transcript_debug_raw_chunk",
                                chunk_index=self._debug_chunk_count,
                                contains_linebreak=any(ch in text for ch in ("\n", "\r", "\u2028", "\u2029", "\u0085")),
                                raw_repr=repr(text[:220]),
                            )
                    normalized = self.transcript_store.add(text)
                    if normalized:
                        if self._debug_transcript and self._debug_chunk_count % 20 == 0:
                            logger.info(
                                "transcript_debug_normalized_chunk",
                                chunk_index=self._debug_chunk_count,
                                contains_linebreak=any(ch in normalized for ch in ("\n", "\r", "\u2028", "\u2029", "\u0085")),
                                normalized_repr=repr(normalized[:220]),
                            )
                        await self.broadcast({"type": "transcript", "text": normalized, "timestamp": _utc_iso()})
                await self.broadcast({"type": "status", "data": self.status_payload()})
            except Exception as exc:
                logger.exception("run_loop_error", error=str(exc))
                await self.broadcast({"type": "error", "message": str(exc)})
                await asyncio.sleep(0.3)

    async def _analysis_loop(self) -> None:
        try:
            while self.state.running:
                if not self.runtime_settings.auto_analysis_enabled or self.runtime_settings.analysis_interval_seconds <= 0:
                    break
                interval = max(1, int(self.runtime_settings.analysis_interval_seconds))
                await asyncio.sleep(interval)
                if not self.state.running or not self.runtime_settings.auto_analysis_enabled:
                    break
                try:
                    await self.maybe_analyze_due()
                except Exception as exc:
                    logger.warning("analysis_loop_error", error=str(exc))
        except asyncio.CancelledError:
            raise

    async def _sync_analysis_task(self) -> None:
        should_run = self.state.running and self.runtime_settings.auto_analysis_enabled and self.runtime_settings.analysis_interval_seconds > 0
        if not should_run:
            if self._analysis_task:
                self._analysis_task.cancel()
                try:
                    await self._analysis_task
                except asyncio.CancelledError:
                    pass
                finally:
                    self._analysis_task = None
            return
        if self._analysis_task and not self._analysis_task.done():
            return
        self._analysis_task = asyncio.create_task(self._analysis_loop(), name="analysis-loop")

    async def analyze_now(self) -> str:
        async with self._analysis_lock:
            transcript = self.transcript_store.full_text().strip()
            return await self._analyze_transcript_text(transcript, force=True)

    async def maybe_analyze_due(self) -> bool:
        async with self._analysis_lock:
            transcript = self.transcript_store.full_text().strip()
            if not transcript or transcript == self._last_analyzed_transcript:
                return False
            await self._analyze_transcript_text(transcript, force=False)
            return True

    async def _analyze_transcript_text(self, transcript: str, *, force: bool) -> str:
        api_key = self.secret_store.get_api_key()
        if not api_key:
            self.state.llm_connection_status = "missing_api_key"
            raise RuntimeError("API key is not configured")
        if not transcript:
            raise RuntimeError("No transcript available to analyze")
        if not force and transcript == self._last_analyzed_transcript:
            return self.state.last_analysis

        try:
            self.state.analysis_in_progress = True
            await self.broadcast({"type": "status", "data": self.status_payload()})
            transcript_signature = _transcript_signature(transcript)
            result = await self.llm.analyze(
                base_url=self.runtime_settings.base_url,
                model=self.runtime_settings.llm_model,
                api_key=api_key,
                prompt=self.runtime_settings.prompt,
                transcript=transcript,
            )
            self.state.llm_connection_status = "ok"
            self.state.last_analysis = result
            self._last_analyzed_transcript = transcript
            self.state.last_analysis_signature = transcript_signature
            await self.broadcast({"type": "analysis", "text": result, "timestamp": _utc_iso()})
            await self.broadcast({"type": "status", "data": self.status_payload()})
            return result
        except Exception as exc:
            self.state.llm_connection_status = f"error:{exc.__class__.__name__}"
            raise
        finally:
            self.state.analysis_in_progress = False
            await self.broadcast({"type": "status", "data": self.status_payload()})

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
        transcript_text = self.transcript_store.full_text().strip()
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
            "analysis_in_progress": self.state.analysis_in_progress,
            "last_analysis_signature": self.state.last_analysis_signature,
            "transcript_signature": _transcript_signature(transcript_text),
            "transcript_chars": len(self.transcript_store.full_text()),
        }


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _transcript_signature(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest() if text else ""
