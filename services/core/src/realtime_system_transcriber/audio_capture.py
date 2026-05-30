from __future__ import annotations

import queue
import threading
from dataclasses import dataclass

import numpy as np
from loguru import logger

try:
    import soundcard as sc
except Exception:  # pragma: no cover
    sc = None  # type: ignore[assignment]


@dataclass(slots=True)
class CaptureDevice:
    name: str
    index: int


class WasapiLoopbackCapture:
    def __init__(self, sample_rate: int = 16000, channels: int = 1, block_seconds: float = 2.0) -> None:
        self.sample_rate = sample_rate
        self.channels = channels
        self.block_seconds = block_seconds
        self.block_size = int(sample_rate * block_seconds)
        self._queue: queue.Queue[np.ndarray] = queue.Queue(maxsize=20)
        self._device_name = "unknown"
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()

    @staticmethod
    def list_devices() -> list[CaptureDevice]:
        if sc is None:
            return []
        speakers = sc.all_speakers()
        return [CaptureDevice(name=s.name, index=i) for i, s in enumerate(speakers)]

    def start(self, device_index: int | None = None) -> None:
        if sc is None:
            raise RuntimeError("soundcard is not installed")

        speakers = sc.all_speakers()
        if not speakers:
            raise RuntimeError("No system speakers found for loopback capture")

        if device_index is None:
            speaker = sc.default_speaker()
        else:
            if device_index < 0 or device_index >= len(speakers):
                raise RuntimeError(f"Invalid speaker index: {device_index}")
            speaker = speakers[device_index]

        self._device_name = speaker.name
        loopback_mic = sc.get_microphone(speaker.name, include_loopback=True)
        if loopback_mic is None:
            raise RuntimeError(f"Loopback microphone not found for speaker: {speaker.name}")

        self._stop_event.clear()

        def _capture_loop() -> None:
            # Use loopback recorder to capture system output audio as float32.
            with loopback_mic.recorder(samplerate=self.sample_rate, channels=self.channels) as recorder:
                while not self._stop_event.is_set():
                    data = recorder.record(numframes=self.block_size)
                    mono = np.asarray(data, dtype=np.float32)
                    if mono.ndim > 1:
                        mono = np.mean(mono, axis=1)
                    try:
                        self._queue.put_nowait(mono)
                    except queue.Full:
                        logger.warning("Audio queue full, dropping chunk")

        self._thread = threading.Thread(target=_capture_loop, name="wasapi-loopback-capture", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)
        self._thread = None

    def read_chunk(self, timeout_seconds: float = 3.0) -> np.ndarray:
        return self._queue.get(timeout=timeout_seconds)

    @property
    def device_name(self) -> str:
        return self._device_name
