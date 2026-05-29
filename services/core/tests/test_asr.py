from realtime_system_transcriber.asr_engine import AsrEngine


def test_asr_status_payload_without_init() -> None:
    engine = AsrEngine("base", "en")
    status = engine.status()
    assert status.model == "base"
    assert status.language == "en"
    assert isinstance(status.avg_chunk_latency_ms, float)
