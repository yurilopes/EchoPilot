from realtime_system_transcriber.settings import RuntimeSettings


def test_runtime_settings_defaults() -> None:
    settings = RuntimeSettings()
    assert settings.language == "en"
    assert settings.model_size in {"tiny", "base", "small"}
