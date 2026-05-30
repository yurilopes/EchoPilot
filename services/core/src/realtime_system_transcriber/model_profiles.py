from __future__ import annotations


def profile_model(engine: str, model_id: str) -> dict:
    mid = model_id.lower()
    if engine == "whisper":
        return _profile_whisper(mid)
    return _profile_parakeet(mid)


def _profile_whisper(model_id: str) -> dict:
    if "tiny" in model_id:
        return _pack_profile("ultra-fast", "basic", "excellent", "very-light", "Live captions and low-latency UI")
    if "base" in model_id:
        return _pack_profile("fast", "good", "excellent", "light", "Default live transcription")
    if "small" in model_id:
        return _pack_profile("medium-fast", "good-plus", "very-good", "medium", "Balanced quality for meetings")
    if "medium" in model_id:
        return _pack_profile("medium", "high", "good", "heavy", "Higher accuracy when latency budget allows")
    if "large-v3" in model_id or "large-v2" in model_id or "large" in model_id:
        return _pack_profile("slow", "very-high", "fair", "very-heavy", "Best quality offline or near-real-time")
    if "turbo" in model_id or "distil" in model_id:
        return _pack_profile("very-fast", "high", "very-good", "medium", "High quality with low latency")
    return _pack_profile("unknown", "unknown", "unknown", "unknown", "Profile not classified yet")


def _profile_parakeet(model_id: str) -> dict:
    if "0.6b" in model_id:
        return _pack_profile("very-fast", "high", "excellent", "medium", "Strong live ASR with low latency")
    if "1.1b" in model_id:
        return _pack_profile("medium", "very-high", "good", "heavy", "Higher quality, higher VRAM and compute cost")
    if "ctc" in model_id:
        return _pack_profile("very-fast", "high", "excellent", "medium", "Low-latency decoding and robust live behavior")
    if "tdt" in model_id or "rnnt" in model_id or "unified" in model_id:
        return _pack_profile("fast", "high", "excellent", "medium", "Streaming-friendly transducer family")
    return _pack_profile("medium", "high", "very-good", "medium", "General-purpose Parakeet profile")


def _pack_profile(speed: str, quality: str, live: str, footprint: str, recommendation: str) -> dict:
    return {
        "speed": speed,
        "quality": quality,
        "live_suitability": live,
        "footprint": footprint,
        "recommendation": recommendation,
    }
