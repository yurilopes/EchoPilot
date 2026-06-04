from __future__ import annotations


WHISPER_LANGUAGES: list[dict[str, str]] = [
    {"value": "auto", "label": "Auto-detect"},
    {"value": "en", "label": "English"},
    {"value": "pt", "label": "Portuguese"},
    {"value": "es", "label": "Spanish"},
    {"value": "fr", "label": "French"},
    {"value": "de", "label": "German"},
    {"value": "it", "label": "Italian"},
    {"value": "ja", "label": "Japanese"},
    {"value": "ko", "label": "Korean"},
    {"value": "zh", "label": "Chinese"},
    {"value": "ru", "label": "Russian"},
    {"value": "ar", "label": "Arabic"},
    {"value": "hi", "label": "Hindi"},
    {"value": "nl", "label": "Dutch"},
    {"value": "pl", "label": "Polish"},
    {"value": "tr", "label": "Turkish"},
    {"value": "sv", "label": "Swedish"},
    {"value": "uk", "label": "Ukrainian"},
    {"value": "vi", "label": "Vietnamese"},
]

ENGLISH_ONLY_LANGUAGES: list[dict[str, str]] = [
    {"value": "en", "label": "English"},
]


def supported_transcription_languages(engine: str, model_id: str) -> list[dict[str, str]]:
    if engine == "whisper" and not _is_english_only_whisper(model_id):
        return WHISPER_LANGUAGES
    return ENGLISH_ONLY_LANGUAGES


def normalize_transcription_language(engine: str, model_id: str, language: str) -> str:
    supported = supported_transcription_languages(engine, model_id)
    values = {item["value"] for item in supported}
    if language in values:
        return language
    return supported[0]["value"]


def _is_english_only_whisper(model_id: str) -> bool:
    lower = model_id.lower()
    tail = lower.rsplit("/", 1)[-1]
    return tail.endswith(".en") or "-en-" in tail or tail.endswith("-en")
