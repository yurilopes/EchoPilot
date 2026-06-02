from __future__ import annotations

import pytest

import realtime_system_transcriber.runtime as runtime_module
from realtime_system_transcriber.runtime import RuntimeController
from realtime_system_transcriber.settings import RuntimeSettings


class FakeSecretStore:
    def get_api_key(self) -> str | None:
        return "sk-test"


@pytest.mark.asyncio
async def test_analysis_only_runs_when_transcript_snapshot_changes(monkeypatch: pytest.MonkeyPatch) -> None:
    controller = RuntimeController(
        RuntimeSettings(
            ai_enabled=True,
            chunk_seconds=2.0,
            analysis_interval_seconds=2,
            base_url="https://api.deepseek.com",
            llm_model="deepseek-v4-flash",
            prompt="Summarize",
        ),
        FakeSecretStore(),
    )
    controller.state.running = True

    calls: list[str] = []

    async def fake_analyze(
        *,
        base_url: str,
        model: str,
        api_key: str,
        prompt: str,
        transcript: str,
        timeout_seconds: int = 60,
    ) -> str:
        calls.append(transcript)
        return f"analysis:{transcript}"

    monkeypatch.setattr(controller.llm, "analyze", fake_analyze)

    controller.transcript_store.add("hello")

    assert await controller.maybe_analyze_due() is True
    assert calls == ["hello"]
    assert controller.state.last_analysis == "analysis:hello"

    assert await controller.maybe_analyze_due() is False
    assert calls == ["hello"]

    controller.transcript_store.add("hello world")
    assert await controller.maybe_analyze_due() is True
    assert calls == ["hello", "hello hello world"]


@pytest.mark.asyncio
async def test_auto_analysis_task_is_not_started_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    controller = RuntimeController(
        RuntimeSettings(
            ai_enabled=True,
            auto_analysis_enabled=False,
            chunk_seconds=2.0,
            analysis_interval_seconds=2,
            base_url="https://api.deepseek.com",
            llm_model="deepseek-v4-flash",
            prompt="Summarize",
        ),
        FakeSecretStore(),
    )
    controller.state.running = True

    def forbidden_create_task(*args, **kwargs):  # type: ignore[no-untyped-def]
        raise AssertionError("analysis task should not be created when auto analysis is disabled")

    monkeypatch.setattr(runtime_module.asyncio, "create_task", forbidden_create_task)

    await controller.apply_runtime_settings(controller.runtime_settings)
    assert controller._analysis_task is None
