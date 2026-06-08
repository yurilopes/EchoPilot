from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from realtime_system_transcriber.settings import write_json_atomic

TabKey = Literal["live", "ai", "models", "settings"]
SortBy = Literal["name", "downloads", "speed", "quality", "live", "size", "installed"]
SortDir = Literal["asc", "desc"]
LivePanelFocus = Literal["70/30", "50/50", "30/70"]


class ModelFilterPreferences(BaseModel):
    live: list[str] = Field(default_factory=list)
    quality: list[str] = Field(default_factory=list)
    speed: list[str] = Field(default_factory=list)
    size: list[str] = Field(default_factory=list)
    state: list[str] = Field(default_factory=list)
    installed: list[str] = Field(default_factory=list)


class UiPreferences(BaseModel):
    active_tab: TabKey = "live"
    model_filter: str = ""
    sort_by: SortBy = "live"
    sort_dir: SortDir = "desc"
    model_filters: ModelFilterPreferences = Field(default_factory=ModelFilterPreferences)
    auto_apply_after_download: bool = False
    live_panel_focus: LivePanelFocus = "50/50"

    @field_validator("live_panel_focus", mode="before")
    @classmethod
    def normalize_live_panel_focus(cls, value: object) -> str:
        if value in {"70/30", "50/50", "30/70"}:
            return str(value)
        return "50/50"


def ensure_ui_preferences(path: Path) -> UiPreferences:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        preferences = UiPreferences()
        write_json_atomic(path, preferences.model_dump_json(indent=2))
        return preferences

    try:
        raw = path.read_text(encoding="utf-8")
        return UiPreferences.model_validate_json(raw)
    except Exception:
        preferences = UiPreferences()
        write_json_atomic(path, preferences.model_dump_json(indent=2))
        return preferences


def save_ui_preferences(path: Path, ui_preferences: UiPreferences) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    write_json_atomic(path, ui_preferences.model_dump_json(indent=2))
