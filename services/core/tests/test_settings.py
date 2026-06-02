from realtime_system_transcriber.settings import RuntimeSettings


def test_runtime_settings_defaults() -> None:
    settings = RuntimeSettings()
    assert settings.language == "en"
    assert settings.asr_engine in {"whisper", "parakeet"}
    assert isinstance(settings.model_id, str) and settings.model_id
    assert settings.auto_analysis_enabled is True
    assert settings.clear_transcript_on_start is False

