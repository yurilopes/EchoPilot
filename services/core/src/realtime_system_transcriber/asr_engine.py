from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter
from typing import Any

import numpy as np
from loguru import logger

try:
    from faster_whisper import WhisperModel
except Exception:  # pragma: no cover
    WhisperModel = None  # type: ignore[assignment]


@dataclass(slots=True)
class AsrStatus:
    backend_asr: str
    cuda_available: bool
    cuda_active: bool
    fallback_reason: str | None
    model: str
    language: str
    avg_chunk_latency_ms: float


class AsrEngine:
    def __init__(self, model_size: str, language: str) -> None:
        self.model_size = model_size
        self.language = language
        self.backend_asr = "faster-whisper"
        self.cuda_available = False
        self.cuda_active = False
        self.fallback_reason: str | None = None
        self._latency_samples: list[float] = []
        self._model: Any | None = None

    def initialize(self) -> None:
        if WhisperModel is None:
            self.backend_asr = "mock"
            self.fallback_reason = "faster_whisper_not_installed"
            logger.warning("ASR backend unavailable, using mock backend")
            return

        for device in ("cuda", "cpu"):
            try:
                compute_type = "float16" if device == "cuda" else "int8"
                self._model = WhisperModel(self.model_size, device=device, compute_type=compute_type)
                self.cuda_available = device == "cuda"
                self.cuda_active = device == "cuda"
                if device == "cpu":
                    self.fallback_reason = "cuda_unavailable_or_failed"
                return
            except Exception as exc:
                logger.warning("ASR init failed", device=device, error=str(exc))
                self.fallback_reason = f"{device}_init_failed"

        self.backend_asr = "mock"
        self.fallback_reason = "all_backends_failed"

    def transcribe_chunk(self, chunk: np.ndarray, sample_rate: int) -> str:
        start = perf_counter()
        text = ""
        if self._model is None:
            text = ""
        else:
            segments, _ = self._model.transcribe(chunk.astype(np.float32), language=self.language, vad_filter=True)
            text = " ".join(segment.text.strip() for segment in segments if segment.text.strip())

        elapsed = (perf_counter() - start) * 1000
        self._latency_samples.append(elapsed)
        if len(self._latency_samples) > 100:
            self._latency_samples.pop(0)
        return text

    def status(self) -> AsrStatus:
        avg = sum(self._latency_samples) / len(self._latency_samples) if self._latency_samples else 0.0
        return AsrStatus(
            backend_asr=self.backend_asr,
            cuda_available=self.cuda_available,
            cuda_active=self.cuda_active,
            fallback_reason=self.fallback_reason,
            model=self.model_size,
            language=self.language,
            avg_chunk_latency_ms=round(avg, 2),
        )
