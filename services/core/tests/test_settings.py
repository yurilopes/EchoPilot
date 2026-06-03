from fastapi.testclient import TestClient

from realtime_system_transcriber import main
from realtime_system_transcriber.settings import RuntimeSettings


def test_runtime_settings_defaults() -> None:
    settings = RuntimeSettings()
    assert settings.language == "en"
    assert settings.asr_engine in {"whisper", "parakeet"}
    assert isinstance(settings.model_id, str) and settings.model_id
    assert settings.auto_analysis_enabled is True
    assert settings.clear_transcript_on_start is False


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

