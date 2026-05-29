from __future__ import annotations

import queue
from dataclasses import dataclass

import numpy as np
import sounddevice as sd
from loguru import logger


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
        self._stream: sd.InputStream | None = None
        self._queue: queue.Queue[np.ndarray] = queue.Queue(maxsize=20)
        self._device_name = "unknown"

    @staticmethod
    def list_devices() -> list[CaptureDevice]:
        devices = sd.query_devices()
        result: list[CaptureDevice] = []
        for index, device in enumerate(devices):
            hostapi = sd.query_hostapis(device["hostapi"])
            if "Windows WASAPI" in hostapi["name"] and device["max_input_channels"] > 0:
                result.append(CaptureDevice(name=device["name"], index=index))
        return result

    def start(self, device_index: int | None = None) -> None:
        extra = sd.WasapiSettings(loopback=True)

        def _callback(indata: np.ndarray, frames: int, time, status) -> None:  # type: ignore[no-untyped-def]
            if status:
                logger.warning("Audio callback status", status=str(status))
            mono = np.mean(indata, axis=1).astype(np.float32)
            try:
                self._queue.put_nowait(mono)
            except queue.Full:
                logger.warning("Audio queue full, dropping chunk")

        if device_index is None:
            default_output = sd.default.device[1]
            device_index = default_output

        self._device_name = str(sd.query_devices(device_index)["name"])
        self._stream = sd.InputStream(
            samplerate=self.sample_rate,
            channels=self.channels,
            dtype="float32",
            blocksize=self.block_size,
            device=device_index,
            callback=_callback,
            extra_settings=extra,
        )
        self._stream.start()

    def stop(self) -> None:
        if self._stream:
            self._stream.stop()
            self._stream.close()
            self._stream = None

    def read_chunk(self, timeout_seconds: float = 3.0) -> np.ndarray:
        return self._queue.get(timeout=timeout_seconds)

    @property
    def device_name(self) -> str:
        return self._device_name
