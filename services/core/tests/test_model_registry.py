from dataclasses import dataclass

from realtime_system_transcriber.model_registry import AsrModelRegistry


@dataclass
class FakeHubModel:
    id: str
    downloads: int = 10
    last_modified: str = "2026-06-02"


class FakeHubApi:
    def __init__(self, models: list[FakeHubModel] | None = None, error: Exception | None = None) -> None:
        self.models = models or []
        self.error = error
        self.calls = 0

    def list_models(self, **_: object) -> list[FakeHubModel]:
        self.calls += 1
        if self.error:
            raise self.error
        return self.models


def test_list_models_uses_cached_remote_catalog(tmp_path) -> None:
    registry = AsrModelRegistry(tmp_path)
    api = FakeHubApi([FakeHubModel("Systran/faster-whisper-base")])
    registry.api = api

    first = registry.list_models("whisper")
    second = registry.list_models("whisper")

    assert api.calls == 1
    assert any(row["id"] == "Systran/faster-whisper-base" for row in first)
    assert second == first


def test_failed_catalog_lookup_is_cached(tmp_path) -> None:
    registry = AsrModelRegistry(tmp_path)
    api = FakeHubApi(error=RuntimeError("offline"))
    registry.api = api

    first = registry.list_models("parakeet")
    second = registry.list_models("parakeet")

    assert api.calls == 1
    assert first == []
    assert second == []


def test_cached_catalog_keeps_installed_state_dynamic(tmp_path) -> None:
    registry = AsrModelRegistry(tmp_path)
    api = FakeHubApi([FakeHubModel("Systran/faster-whisper-base")])
    registry.api = api

    before = registry.list_models("whisper")
    (tmp_path / "models--Systran--faster-whisper-base").mkdir()
    after = registry.list_models("whisper")

    row_before = next(row for row in before if row["id"] == "Systran/faster-whisper-base")
    row_after = next(row for row in after if row["id"] == "Systran/faster-whisper-base")
    assert api.calls == 1
    assert row_before["installed"] is False
    assert row_after["installed"] is True
