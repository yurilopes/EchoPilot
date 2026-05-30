from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Literal

TERMINAL_STATUSES = {"done", "error", "canceled"}
STALL_TIMEOUT_SECONDS = 45


@dataclass(slots=True)
class DownloadProgress:
    percent: float = 0.0
    bytes_downloaded: int = 0
    bytes_total: int | None = None
    eta_seconds: int | None = None
    speed_bytes_per_sec: float | None = None
    indeterminate: bool = False
    message: str = ""


@dataclass(slots=True)
class DownloadTask:
    task_id: str
    engine: str
    model_id: str
    status: Literal["queued", "downloading", "done", "error", "canceled"] = "queued"
    progress: DownloadProgress = field(default_factory=DownloadProgress)
    error: str | None = None
    created_at: float = field(default_factory=time.time)
    started_at: float | None = None
    updated_at: float = field(default_factory=time.time)
    last_progress_at: float | None = None
