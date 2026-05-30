from __future__ import annotations

import ctypes
import os
import site
from dataclasses import dataclass
from pathlib import Path
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
    def __init__(self, engine: str, model_id: str, language: str) -> None:
        self.engine = engine
        self.model_id = model_id
        self.language = language
        self.backend_asr = engine
        self.cuda_available = False
        self.cuda_active = False
        self.fallback_reason: str | None = None
        self._latency_samples: list[float] = []
        self._model: Any | None = None
        self._device: str = "cpu"
        self._pipeline: Any | None = None

    def initialize(self) -> None:
        self._prepare_cuda_runtime()
        if self.engine == "whisper":
            self._init_whisper()
            return
        if self.engine == "parakeet":
            self._init_parakeet()
            return
        raise RuntimeError(f"Unsupported ASR engine: {self.engine}")

    def _init_whisper(self) -> None:
        if WhisperModel is None:
            raise RuntimeError("faster-whisper is not installed")
        for device in ("cuda", "cpu"):
            try:
                compute_type = "float16" if device == "cuda" else "int8"
                self._model = WhisperModel(self.model_id, device=device, compute_type=compute_type)
                self._device = device
                self.cuda_available = device == "cuda"
                self.cuda_active = device == "cuda"
                if device == "cpu":
                    self.fallback_reason = "cuda_unavailable_or_failed"
                return
            except Exception as exc:
                logger.warning("Whisper init failed", device=device, error=str(exc))
                self.fallback_reason = f"{device}_init_failed"
        raise RuntimeError("Unable to initialize whisper backend")

    def _init_parakeet(self) -> None:
        try:
            import torch
            from transformers import pipeline
        except Exception as exc:
            raise RuntimeError("Parakeet requires transformers and torch installed") from exc

        if torch.cuda.is_available():
            device = 0
            dtype = torch.float16
            self.cuda_available = True
            self.cuda_active = True
            self._device = "cuda"
        else:
            device = -1
            dtype = torch.float32
            self.cuda_active = False
            self.cuda_available = False
            self._device = "cpu"
            self.fallback_reason = "cuda_unavailable_or_failed"

        self._pipeline = pipeline(
            "automatic-speech-recognition",
            model=self.model_id,
            device=device,
            torch_dtype=dtype,
        )

    def transcribe_chunk(self, chunk: np.ndarray, sample_rate: int) -> str:
        start = perf_counter()
        text = ""

        if self.engine == "whisper":
            text = self._transcribe_whisper(chunk)
        elif self.engine == "parakeet":
            text = self._transcribe_parakeet(chunk, sample_rate)
        else:
            raise RuntimeError(f"Unsupported ASR engine: {self.engine}")

        elapsed = (perf_counter() - start) * 1000
        self._latency_samples.append(elapsed)
        if len(self._latency_samples) > 100:
            self._latency_samples.pop(0)
        return text

    def _transcribe_whisper(self, chunk: np.ndarray) -> str:
        if self._model is None:
            return ""
        try:
            segments, _ = self._model.transcribe(chunk.astype(np.float32), language=self.language, vad_filter=True)
            return " ".join(segment.text.strip() for segment in segments if segment.text.strip())
        except Exception as exc:
            message = str(exc).lower()
            if self._device == "cuda" and ("cublas" in message or "cudnn" in message or "cuda" in message):
                logger.warning("CUDA runtime failed during transcription, falling back to CPU", error=str(exc))
                self._fallback_whisper_to_cpu(reason="cuda_runtime_library_missing")
                segments, _ = self._model.transcribe(chunk.astype(np.float32), language=self.language, vad_filter=True)
                return " ".join(segment.text.strip() for segment in segments if segment.text.strip())
            raise

    def _transcribe_parakeet(self, chunk: np.ndarray, sample_rate: int) -> str:
        if self._pipeline is None:
            return ""
        result = self._pipeline({"array": chunk.astype(np.float32), "sampling_rate": sample_rate})
        if isinstance(result, dict):
            return str(result.get("text", "")).strip()
        return str(result).strip()

    def _fallback_whisper_to_cpu(self, reason: str) -> None:
        if WhisperModel is None:
            self.cuda_active = False
            self.fallback_reason = reason
            return
        self._model = WhisperModel(self.model_id, device="cpu", compute_type="int8")
        self._device = "cpu"
        self.cuda_active = False
        self.cuda_available = False
        self.fallback_reason = reason

    def _prepare_cuda_runtime(self) -> None:
        if os.name != "nt":
            return
        candidates: list[Path] = []
        cuda_path = os.environ.get("CUDA_PATH")
        if cuda_path:
            candidates.append(Path(cuda_path) / "bin")
        candidates.append(Path("C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA/v13.3/bin"))
        candidates.append(Path("C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA/v12.9/bin"))
        candidates.append(Path("C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA/v12.8/bin"))
        candidates.append(Path("C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA/v12.6/bin"))
        for site_pkg in site.getsitepackages():
            sp = Path(site_pkg)
            candidates.append(sp / "nvidia" / "cublas" / "bin")
            candidates.append(sp / "nvidia" / "cudnn" / "bin")
            candidates.append(sp / "nvidia" / "cuda_runtime" / "bin")

        for path in candidates:
            if path.exists():
                os.environ["PATH"] = str(path) + os.pathsep + os.environ.get("PATH", "")
                try:
                    os.add_dll_directory(str(path))
                except Exception:
                    pass

        try:
            ctypes.WinDLL("cublas64_12.dll")
            self.cuda_available = True
        except Exception:
            self.cuda_available = False

    def status(self) -> AsrStatus:
        avg = sum(self._latency_samples) / len(self._latency_samples) if self._latency_samples else 0.0
        return AsrStatus(
            backend_asr=self.backend_asr,
            cuda_available=self.cuda_available,
            cuda_active=self.cuda_active,
            fallback_reason=self.fallback_reason,
            model=self.model_id,
            language=self.language,
            avg_chunk_latency_ms=round(avg, 2),
        )
