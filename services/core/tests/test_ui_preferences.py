from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from realtime_system_transcriber.ui_preferences import UiPreferences, ensure_ui_preferences, save_ui_preferences


def test_ui_preferences_defaults_are_created(tmp_path) -> None:
    path = tmp_path / "runtime" / "ui_preferences.json"

    prefs = ensure_ui_preferences(path)

    assert prefs.active_tab == "live"
    assert prefs.model_filter == ""
    assert prefs.sort_by == "live"
    assert prefs.sort_dir == "desc"
    assert prefs.auto_apply_after_download is False
    assert path.exists()


def test_ui_preferences_partial_file_round_trips_with_defaults(tmp_path) -> None:
    path = tmp_path / "runtime" / "ui_preferences.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        """
        {
          "active_tab": "models",
          "model_filters": {
            "live": ["excellent"]
          }
        }
        """,
        encoding="utf-8",
    )

    prefs = ensure_ui_preferences(path)

    assert prefs.active_tab == "models"
    assert prefs.model_filter == ""
    assert prefs.sort_by == "live"
    assert prefs.model_filters.live == ["excellent"]
    assert prefs.model_filters.quality == []


def test_ui_preferences_recovers_from_malformed_file(tmp_path) -> None:
    path = tmp_path / "runtime" / "ui_preferences.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{ not valid json", encoding="utf-8")

    prefs = ensure_ui_preferences(path)

    assert prefs == UiPreferences()
    assert path.read_text(encoding="utf-8").strip().startswith("{")


def test_ui_preferences_round_trip(tmp_path) -> None:
    path = tmp_path / "runtime" / "ui_preferences.json"
    prefs = UiPreferences(
        active_tab="models",
        model_filter="parakeet",
        sort_by="downloads",
        sort_dir="asc",
        model_filters={
            "live": ["excellent"],
            "quality": ["good"],
            "speed": [],
            "size": [],
            "state": [],
            "installed": ["yes"],
        },
        auto_apply_after_download=True,
    )

    save_ui_preferences(path, prefs)
    loaded = ensure_ui_preferences(path)

    assert loaded == prefs


def test_ui_preferences_concurrent_writes_leave_valid_json(tmp_path) -> None:
    path = tmp_path / "runtime" / "ui_preferences.json"

    def write_preferences(index: int) -> None:
        save_ui_preferences(path, UiPreferences(model_filter=f"model-{index}"))

    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(write_preferences, range(40)))

    loaded = ensure_ui_preferences(path)
    assert loaded.model_filter.startswith("model-")
    assert list(path.parent.glob("*.tmp")) == []
