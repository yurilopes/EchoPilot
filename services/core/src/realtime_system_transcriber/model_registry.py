from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import asdict
from pathlib import Path

from huggingface_hub import HfApi, snapshot_download
from loguru import logger
from realtime_system_transcriber.download_tasks import (
    STALL_TIMEOUT_SECONDS,
    TERMINAL_STATUSES,
    DownloadProgress,
    DownloadTask,
)
from realtime_system_transcriber.model_profiles import profile_model
class AsrModelRegistry:
    def __init__(self, cache_dir: Path) -> None:
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.api = HfApi()
        self._lock = threading.Lock()
        self._queue: deque[str] = deque()
        self._tasks: dict[str, DownloadTask] = {}
        self._task_by_model: dict[tuple[str, str], str] = {}
        self._active_task_id: str | None = None
        self._worker = threading.Thread(target=self._worker_loop, name="asr-download-worker", daemon=True)
        self._worker.start()

    def list_models(self, query: str) -> list[dict]:
        try:
            models = self.api.list_models(
                search=query,
                pipeline_tag="automatic-speech-recognition",
                sort="downloads",
                limit=200,
            )
        except Exception:
            models = []
        rows: list[dict] = []
        for model in models:
            model_id = model.id
            if query == "parakeet" and "parakeet" not in model_id.lower():
                continue
            if query == "whisper" and "whisper" not in model_id.lower():
                continue
            rows.append(
                {
                    "id": model_id,
                    "downloads": getattr(model, "downloads", None),
                    "last_modified": str(getattr(model, "last_modified", "")),
                    "installed": self.is_installed(query, model_id),
                    "profile": profile_model(query, model_id),
                }
            )
        if query == "whisper":
            aliases = ["tiny", "base", "small", "medium", "large-v2", "large-v3", "turbo"]
            known = {x["id"] for x in rows}
            for alias in aliases:
                if alias not in known:
                    rows.insert(
                        0,
                        {
                            "id": alias,
                            "downloads": None,
                            "last_modified": "",
                            "installed": self.is_installed(query, alias),
                            "profile": profile_model(query, alias),
                        },
                    )
        return rows

    def enqueue_download(self, engine: str, model_id: str) -> dict:
        if engine == "whisper" and "/" not in model_id:
            # Built-in whisper aliases are downloaded lazily by faster-whisper.
            return {
                "task_id": f"alias-{engine}-{model_id}",
                "engine": engine,
                "model_id": model_id,
                "status": "done",
                "progress": asdict(DownloadProgress(percent=100.0, message="alias ready")),
                "error": None,
            }
        if self.is_installed(engine, model_id):
            return {
                "task_id": f"installed-{engine}-{model_id}",
                "engine": engine,
                "model_id": model_id,
                "status": "done",
                "progress": asdict(DownloadProgress(percent=100.0, message="already installed")),
                "error": None,
            }
        key = (engine, model_id)
        with self._lock:
            existing_id = self._task_by_model.get(key)
            if existing_id and existing_id in self._tasks:
                existing = self._tasks[existing_id]
                if existing.status not in TERMINAL_STATUSES:
                    logger.info("download_enqueue_reuse", task_id=existing.task_id, engine=engine, model_id=model_id, status=existing.status)
                    return asdict(existing)
            task_id = f"task-{int(time.time() * 1000)}-{len(self._tasks) + 1}"
            task = DownloadTask(task_id=task_id, engine=engine, model_id=model_id)
            self._tasks[task_id] = task
            self._task_by_model[key] = task_id
            self._queue.append(task_id)
            logger.info("download_enqueue", task_id=task_id, engine=engine, model_id=model_id)
            return asdict(task)

    def retry_download(self, task_id: str) -> dict:
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return {"ok": False, "error": "task not found"}
            if task.status not in {"error", "canceled"}:
                return {"ok": False, "error": "only error/canceled tasks can be retried"}
            engine = task.engine
            model_id = task.model_id
        return {"ok": True, "task": self.enqueue_download(engine, model_id)}

    def cancel_download(self, task_id: str) -> dict:
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return {"ok": False, "error": "task not found"}
            if task.status == "queued":
                task.status = "canceled"
                task.updated_at = time.time()
                try:
                    self._queue.remove(task_id)
                except ValueError:
                    pass
                logger.info("download_cancel", task_id=task_id, engine=task.engine, model_id=task.model_id)
                return {"ok": True, "task": asdict(task)}
            return {"ok": False, "error": "only queued tasks can be canceled"}

    def state(self) -> dict:
        with self._lock:
            tasks = [asdict(t) for t in self._tasks.values()]
            active = self._active_task_id
        queued = sum(1 for t in tasks if t["status"] == "queued")
        done = sum(1 for t in tasks if t["status"] == "done")
        failed = sum(1 for t in tasks if t["status"] == "error")
        aggregate = 0.0
        considered = [t for t in tasks if t["status"] in {"queued", "downloading", "done"}]
        if considered:
            aggregate = sum(float(t["progress"].get("percent", 0.0)) for t in considered) / len(considered)
        return {
            "active_task_id": active,
            "queued_count": queued,
            "completed_count": done,
            "failed_count": failed,
            "aggregate_percent": round(aggregate, 2),
            "tasks": tasks,
        }

    def queue_health(self) -> dict:
        now = time.time()
        with self._lock:
            tasks = list(self._tasks.values())
            active = self._active_task_id
        stale = 0
        for t in tasks:
            if t.status == "downloading" and t.last_progress_at and (now - t.last_progress_at) > STALL_TIMEOUT_SECONDS:
                stale += 1
        return {
            "active_task_id": active,
            "stale_downloading_count": stale,
            "error_count": sum(1 for t in tasks if t.status == "error"),
            "total_tasks": len(tasks),
        }

    def model_task(self, engine: str, model_id: str) -> dict | None:
        with self._lock:
            task_id = self._task_by_model.get((engine, model_id))
            if not task_id:
                return None
            task = self._tasks.get(task_id)
            return asdict(task) if task else None

    def is_installed(self, engine: str, model_id: str) -> bool:
        if engine == "whisper" and "/" not in model_id:
            return True
        safe = model_id.replace("/", "--")
        return any(p.name.startswith(f"models--{safe}") for p in self.cache_dir.glob("models--*"))

    def _worker_loop(self) -> None:
        while True:
            task_id: str | None = None
            with self._lock:
                if self._queue:
                    task_id = self._queue.popleft()
                    self._active_task_id = task_id
                    task = self._tasks[task_id]
                    if task.status == "canceled":
                        self._active_task_id = None
                        continue
                    task.status = "downloading"
                    task.started_at = time.time()
                    task.updated_at = time.time()
                    task.last_progress_at = task.started_at
                    task.progress.message = "starting"
                    logger.info("download_start", task_id=task.task_id, engine=task.engine, model_id=task.model_id)
            if not task_id:
                time.sleep(0.2)
                continue
            try:
                self._run_download(task_id)
            except Exception as exc:
                with self._lock:
                    task = self._tasks.get(task_id)
                    if task:
                        task.status = "error"
                        task.error = str(exc)
                        task.updated_at = time.time()
                        task.progress.message = "error"
                        logger.error("download_error", task_id=task.task_id, engine=task.engine, model_id=task.model_id, error=str(exc))
            with self._lock:
                self._active_task_id = None

    def _run_download(self, task_id: str) -> None:
        with self._lock:
            task = self._tasks[task_id]
            engine = task.engine
            model_id = task.model_id
            task.progress.indeterminate = True
            task.progress.message = "preparing"
        total_bytes = self._estimate_total_bytes(model_id)
        repo_cache_dir = self._repo_cache_dir(model_id)
        start_time = time.time()
        thread_error: list[Exception] = []

        def downloader() -> None:
            try:
                snapshot_download(repo_id=model_id, cache_dir=str(self.cache_dir), resume_download=True)
            except Exception as exc:  # pragma: no cover
                thread_error.append(exc)
        t = threading.Thread(target=downloader, daemon=True)
        t.start()

        while t.is_alive():
            downloaded = self._directory_size(repo_cache_dir)
            elapsed = max(time.time() - start_time, 1e-6)
            speed = downloaded / elapsed
            eta = None
            percent = 0.0
            indeterminate = total_bytes is None or total_bytes <= 0
            if not indeterminate:
                percent = min(99.0, (downloaded / total_bytes) * 100.0)
                remain = max(total_bytes - downloaded, 0)
                eta = int(remain / speed) if speed > 0 else None

            with self._lock:
                task = self._tasks[task_id]
                now = time.time()
                task.progress = DownloadProgress(
                    percent=round(percent, 2),
                    bytes_downloaded=int(downloaded),
                    bytes_total=int(total_bytes) if total_bytes else None,
                    eta_seconds=eta,
                    speed_bytes_per_sec=round(speed, 2),
                    indeterminate=indeterminate,
                    message="downloading",
                )
                task.updated_at = now
                if downloaded > 0:
                    task.last_progress_at = now
                elif task.last_progress_at is None:
                    task.last_progress_at = now
                if task.last_progress_at and (now - task.last_progress_at) > STALL_TIMEOUT_SECONDS:
                    task.status = "error"
                    task.error = "stalled/no_progress"
                    task.progress.message = "stalled/no_progress"
                    task.updated_at = now
                    logger.error("download_stall_timeout", task_id=task.task_id, engine=task.engine, model_id=task.model_id)
                    raise RuntimeError("stalled/no_progress")
            time.sleep(0.8)
        if thread_error:
            raise RuntimeError(f"download failed: {thread_error[0]}")
        if self.is_installed(engine, model_id):
            with self._lock:
                task = self._tasks[task_id]
                task.status = "done"
                task.progress.percent = 100.0
                task.progress.message = "done"
                task.progress.indeterminate = False if total_bytes else True
                task.error = None
                task.updated_at = time.time()
                task.last_progress_at = task.updated_at
                logger.info("download_done", task_id=task.task_id, engine=task.engine, model_id=task.model_id)
        else:
            with self._lock:
                task = self._tasks[task_id]
                task.status = "error"
                task.error = "download failed or incomplete"
                task.progress.message = "error"
                task.updated_at = time.time()
                logger.error("download_incomplete", task_id=task.task_id, engine=task.engine, model_id=task.model_id)

    def _estimate_total_bytes(self, model_id: str) -> int | None:
        try:
            info = self.api.model_info(model_id)
            total = 0
            for s in info.siblings or []:
                size = getattr(s, "size", None)
                if isinstance(size, int):
                    total += size
            return total if total > 0 else None
        except Exception:
            return None

    def _repo_cache_dir(self, model_id: str) -> Path:
        safe = model_id.replace("/", "--")
        return self.cache_dir / f"models--{safe}"

    def _directory_size(self, path: Path) -> int:
        if not path.exists():
            return 0
        total = 0
        for p in path.rglob("*"):
            try:
                if p.is_file():
                    total += p.stat().st_size
            except OSError:
                continue
        return total
