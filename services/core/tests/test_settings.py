import json
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from realtime_system_transcriber import main
from realtime_system_transcriber.settings import AppSettings, CORE_ROOT, RuntimeSettings, save_runtime_settings


def test_runtime_settings_defaults() -> None:
    settings = RuntimeSettings()
    assert settings.language == "auto"
    assert settings.analysis_language == "en"
    assert settings.asr_engine in {"whisper", "parakeet"}
    assert isinstance(settings.model_id, str) and settings.model_id
    assert settings.auto_analysis_enabled is True
    assert settings.clear_transcript_on_start is False


def test_app_settings_default_paths_are_core_absolute(monkeypatch) -> None:
    monkeypatch.delenv("RST_SETTINGS_PATH", raising=False)
    monkeypatch.delenv("RST_UI_PREFERENCES_PATH", raising=False)

    settings = AppSettings()

    assert settings.settings_path == CORE_ROOT / "runtime" / "settings.json"
    assert settings.ui_preferences_path == CORE_ROOT / "runtime" / "ui_preferences.json"


def test_settings_update_preserves_missing_fields(tmp_path, monkeypatch) -> None:
    settings_path = tmp_path / "settings.json"
    monkeypatch.setattr(main.app_settings, "settings_path", settings_path)
    main.runtime_controller.runtime_settings = RuntimeSettings(auto_analysis_enabled=False)

    client = TestClient(main.app)
    response = client.post("/settings", json={})

    assert response.status_code == 200
    assert response.json()["settings"]["auto_analysis_enabled"] is False
    assert main.runtime_controller.runtime_settings.auto_analysis_enabled is False


def test_partial_auto_analysis_update_persists_false(tmp_path, monkeypatch) -> None:
    settings_path = tmp_path / "settings.json"
    monkeypatch.setattr(main.app_settings, "settings_path", settings_path)
    main.runtime_controller.runtime_settings = RuntimeSettings(
        auto_analysis_enabled=True,
        language="pt",
        chunk_seconds=3.5,
    )

    client = TestClient(main.app)
    response = client.put("/settings", json={"auto_analysis_enabled": False})

    assert response.status_code == 200
    settings = RuntimeSettings.model_validate_json(settings_path.read_text(encoding="utf-8"))
    assert settings.auto_analysis_enabled is False
    assert settings.language == "pt"
    assert settings.chunk_seconds == 3.5


def test_runtime_settings_preserve_unknown_fields(tmp_path) -> None:
    settings_path = tmp_path / "runtime" / "settings.json"
    settings_path.parent.mkdir(parents=True)
    settings_path.write_text(
        '{"language":"auto","prompt":"Custom prompt","future_checkbox":false}',
        encoding="utf-8",
    )

    settings = RuntimeSettings.model_validate_json(settings_path.read_text(encoding="utf-8"))
    save_runtime_settings(settings_path, settings)

    saved = json.loads(settings_path.read_text(encoding="utf-8"))
    assert saved["prompt"] == "Custom prompt"
    assert saved["future_checkbox"] is False


def test_settings_update_preserves_unknown_fields(tmp_path, monkeypatch) -> None:
    settings_path = tmp_path / "settings.json"
    monkeypatch.setattr(main.app_settings, "settings_path", settings_path)
    main.runtime_controller.runtime_settings = RuntimeSettings(
        prompt="Custom prompt",
        future_checkbox=False,
    )

    client = TestClient(main.app)
    response = client.put("/settings", json={"auto_analysis_enabled": False})

    assert response.status_code == 200
    saved = RuntimeSettings.model_validate_json(settings_path.read_text(encoding="utf-8"))
    assert saved.prompt == "Custom prompt"
    assert saved.model_extra["future_checkbox"] is False
    assert saved.auto_analysis_enabled is False


def test_transcription_language_is_normalized_for_selected_model(tmp_path, monkeypatch) -> None:
    settings_path = tmp_path / "settings.json"
    monkeypatch.setattr(main.app_settings, "settings_path", settings_path)
    main.runtime_controller.runtime_settings = RuntimeSettings(
        asr_engine="parakeet",
        model_id="nvidia/parakeet-tdt-0.6b-v2",
        language="en",
    )

    client = TestClient(main.app)
    response = client.put("/settings", json={"language": "auto"})

    assert response.status_code == 200
    assert response.json()["settings"]["language"] == "en"


def test_analysis_language_falls_back_to_english(tmp_path, monkeypatch) -> None:
    settings_path = tmp_path / "settings.json"
    monkeypatch.setattr(main.app_settings, "settings_path", settings_path)
    main.runtime_controller.runtime_settings = RuntimeSettings()

    client = TestClient(main.app)
    response = client.put("/settings", json={"analysis_language": "unknown"})

    assert response.status_code == 200
    assert response.json()["settings"]["analysis_language"] == "en"


def test_runtime_settings_concurrent_writes_leave_valid_json(tmp_path) -> None:
    settings_path = tmp_path / "runtime" / "settings.json"

    def write_settings(index: int) -> None:
        save_runtime_settings(settings_path, RuntimeSettings(language=f"lang-{index}"))

    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(write_settings, range(40)))

    settings = RuntimeSettings.model_validate_json(settings_path.read_text(encoding="utf-8"))
    assert settings.language.startswith("lang-")
    assert list(settings_path.parent.glob("*.tmp")) == []

