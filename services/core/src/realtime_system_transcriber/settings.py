from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class RuntimeSettings(BaseModel):
    language: str = "en"
    asr_engine: Literal["whisper", "parakeet"] = "whisper"
    model_id: str = "base"
    ai_enabled: bool = True
    chunk_seconds: float = 2.0
    analysis_interval_seconds: int = 0
    base_url: str = "https://api.deepseek.com"
    llm_model: str = "deepseek-chat"
    prompt: str = "Summarize key points and action items from this transcript."


class AppSettings(BaseSettings):
    host: str = "127.0.0.1"
    port: int = 8765
    log_level: str = "INFO"
    settings_path: Path = Path("runtime/settings.json")
    secret_service_name: str = "echopilot"
    secret_username: str = "llm_api_key"

    model_config = SettingsConfigDict(env_file=".env", env_prefix="RST_")


def ensure_runtime_settings(path: Path) -> RuntimeSettings:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        settings = RuntimeSettings()
        path.write_text(settings.model_dump_json(indent=2), encoding="utf-8")
        return settings
    return RuntimeSettings.model_validate_json(path.read_text(encoding="utf-8"))


def save_runtime_settings(path: Path, runtime_settings: RuntimeSettings) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(runtime_settings.model_dump_json(indent=2), encoding="utf-8")
