from __future__ import annotations

from pathlib import Path
from threading import Lock
from time import sleep
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_write_locks_guard = Lock()
_write_locks: dict[Path, Lock] = {}


class RuntimeSettings(BaseModel):
    language: str = "en"
    asr_engine: Literal["whisper", "parakeet"] = "whisper"
    model_id: str = "base"
    ai_enabled: bool = True
    auto_analysis_enabled: bool = True
    chunk_seconds: float = 2.0
    analysis_interval_seconds: int = 2
    clear_transcript_on_start: bool = False
    base_url: str = "https://api.deepseek.com"
    llm_model: str = "deepseek-v4-flash"
    prompt: str = "Summarize key points and action items from this transcript."


class AppSettings(BaseSettings):
    host: str = "127.0.0.1"
    port: int = 8765
    log_level: str = "INFO"
    settings_path: Path = Path("runtime/settings.json")
    ui_preferences_path: Path = Path("runtime/ui_preferences.json")
    secret_service_name: str = "echopilot"
    secret_username: str = "llm_api_key"

    model_config = SettingsConfigDict(env_file=".env", env_prefix="RST_")


def ensure_runtime_settings(path: Path) -> RuntimeSettings:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        settings = RuntimeSettings()
        write_json_atomic(path, settings.model_dump_json(indent=2))
        return settings
    return RuntimeSettings.model_validate_json(path.read_text(encoding="utf-8"))


def save_runtime_settings(path: Path, runtime_settings: RuntimeSettings) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    write_json_atomic(path, runtime_settings.model_dump_json(indent=2))


def write_json_atomic(path: Path, content: str) -> None:
    lock_key = path.resolve(strict=False)
    with _write_locks_guard:
        lock = _write_locks.setdefault(lock_key, Lock())

    temp_path = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    with lock:
        try:
            temp_path.write_text(content, encoding="utf-8")
            for attempt in range(5):
                try:
                    temp_path.replace(path)
                    return
                except PermissionError:
                    if attempt == 4:
                        raise
                    sleep(0.05 * (attempt + 1))
        finally:
            if temp_path.exists():
                temp_path.unlink()
