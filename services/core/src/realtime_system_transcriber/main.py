from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from time import perf_counter

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict

from realtime_system_transcriber.model_registry import AsrModelRegistry
from realtime_system_transcriber.runtime import RuntimeController
from realtime_system_transcriber.asr_engine import AsrEngine
from realtime_system_transcriber.asr_languages import normalize_transcription_language, supported_transcription_languages
from realtime_system_transcriber.secrets import SecretStore
from realtime_system_transcriber.settings import AppSettings, RuntimeSettings, ensure_runtime_settings, save_runtime_settings
from realtime_system_transcriber.ui_preferences import UiPreferences, ensure_ui_preferences, save_ui_preferences
from realtime_system_transcriber.telemetry import configure_logging

app_settings = AppSettings()
runtime_settings = ensure_runtime_settings(app_settings.settings_path)
ui_preferences = ensure_ui_preferences(app_settings.ui_preferences_path)
if runtime_settings.asr_engine == "whisper" and "/" in runtime_settings.model_id:
    model_lower = runtime_settings.model_id.lower()
    compatible = ("faster-whisper" in model_lower) or ("ctranslate2" in model_lower) or model_lower.startswith("systran/")
    if not compatible:
        runtime_settings = RuntimeSettings(**{**runtime_settings.model_dump(), "asr_engine": "whisper", "model_id": "base"})
        save_runtime_settings(app_settings.settings_path, runtime_settings)
normalized_language = normalize_transcription_language(runtime_settings.asr_engine, runtime_settings.model_id, runtime_settings.language)
if normalized_language != runtime_settings.language:
    runtime_settings = RuntimeSettings(**{**runtime_settings.model_dump(), "language": normalized_language})
    save_runtime_settings(app_settings.settings_path, runtime_settings)
secret_store = SecretStore(app_settings.secret_service_name, app_settings.secret_username)
runtime_controller = RuntimeController(runtime_settings, secret_store)
model_registry = AsrModelRegistry(cache_dir=app_settings.settings_path.parent / "hf-cache")
settings_update_lock = asyncio.Lock()
SUPPORTED_ANALYSIS_LANGUAGES = {"en", "pt", "es", "fr", "de", "it", "ja", "ko", "zh"}


class RuntimeSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="allow")

    language: str | None = None
    asr_engine: str | None = None
    model_id: str | None = None
    ai_enabled: bool | None = None
    auto_analysis_enabled: bool | None = None
    chunk_seconds: float | None = None
    analysis_interval_seconds: int | None = None
    clear_transcript_on_start: bool | None = None
    base_url: str | None = None
    llm_model: str | None = None
    prompt: str | None = None
    analysis_language: str | None = None


class LlmCredentialsInput(BaseModel):
    api_key: str


class ModelDownloadInput(BaseModel):
    engine: str
    model_id: str


class ModelCancelInput(BaseModel):
    task_id: str


class ModelRetryInput(BaseModel):
    task_id: str


class ApplyModelInput(BaseModel):
    engine: str
    model_id: str
    restart_if_running: bool = True


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging(app_settings.log_level)
    yield
    await runtime_controller.stop()


app = FastAPI(title="EchoPilot Core", version="0.7.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "service": "core", "status": runtime_controller.status_payload()}


@app.get("/diagnostics")
async def diagnostics() -> dict:
    return {
        "status": runtime_controller.status_payload(),
        "runtime_settings": runtime_controller.runtime_settings.model_dump(),
        "settings_path": str(app_settings.settings_path),
        "ui_preferences_path": str(app_settings.ui_preferences_path),
    }


@app.get("/settings")
async def get_settings() -> dict:
    return runtime_controller.runtime_settings.model_dump()


@app.get("/ui/preferences")
async def get_ui_preferences() -> dict:
    return ui_preferences.model_dump()


async def _update_settings(payload: RuntimeSettingsUpdate) -> dict:
    async with settings_update_lock:
        settings_data = runtime_controller.runtime_settings.model_dump()
        settings_data.update(payload.model_dump(exclude_unset=True))
        settings_data["language"] = normalize_transcription_language(
            settings_data["asr_engine"],
            settings_data["model_id"],
            settings_data["language"],
        )
        if settings_data["analysis_language"] not in SUPPORTED_ANALYSIS_LANGUAGES:
            settings_data["analysis_language"] = "en"
        new_settings = RuntimeSettings(**settings_data)
        save_runtime_settings(app_settings.settings_path, new_settings)
        await runtime_controller.apply_runtime_settings(new_settings)
        save_runtime_settings(app_settings.settings_path, new_settings)
        return {"ok": True, "settings": new_settings.model_dump()}


@app.put("/settings")
async def update_settings(payload: RuntimeSettingsUpdate) -> dict:
    return await _update_settings(payload)


@app.post("/settings")
async def update_settings_post(payload: RuntimeSettingsUpdate) -> dict:
    return await _update_settings(payload)


@app.put("/ui/preferences")
async def update_ui_preferences(payload: UiPreferences) -> dict:
    global ui_preferences
    new_preferences = UiPreferences(**payload.model_dump())
    ui_preferences = new_preferences
    save_ui_preferences(app_settings.ui_preferences_path, new_preferences)
    return {"ok": True, "preferences": new_preferences.model_dump()}


@app.get("/asr/catalog")
async def asr_catalog() -> dict:
    selected_engine = runtime_controller.runtime_settings.asr_engine
    selected_model_id = runtime_controller.runtime_settings.model_id
    try:
        whisper_rows = model_registry.list_models("whisper")
    except Exception:
        whisper_rows = []
    try:
        parakeet_rows = model_registry.list_models("parakeet")
    except Exception:
        parakeet_rows = []

    def annotate(rows: list[dict], engine: str) -> list[dict]:
        annotated: list[dict] = []
        for row in rows:
            model_id = row["id"]
            installed = model_registry.is_installed(engine, model_id)
            task = model_registry.model_task(engine, model_id)
            is_selected = engine == selected_engine and model_id == selected_model_id

            download_status = task["status"] if task else "idle"
            availability = "ready" if installed else "needs_download"
            if not installed and download_status in {"queued", "downloading"}:
                availability = "downloading"
            if download_status == "error":
                availability = "error"

            row = {
                **row,
                "is_selected": is_selected,
                "languages": supported_transcription_languages(engine, model_id),
                "availability": availability,
                "download_state": download_status,
                "download_progress": (task["progress"] if task else None),
                "task_id": (task["task_id"] if task else None),
                "task_timestamps": (
                    {
                        "created_at": task.get("created_at"),
                        "started_at": task.get("started_at"),
                        "updated_at": task.get("updated_at"),
                        "last_progress_at": task.get("last_progress_at"),
                    }
                    if task
                    else None
                ),
                "download_error": (task.get("error") if task else None),
            }
            annotated.append(row)
        return annotated

    return {
        "engines": [
            {"id": "whisper", "label": "Whisper"},
            {"id": "parakeet", "label": "Parakeet"},
        ],
        "models": {
            "whisper": annotate(whisper_rows, "whisper"),
            "parakeet": annotate(parakeet_rows, "parakeet"),
        },
    }


@app.post("/asr/download")
async def asr_download(payload: ModelDownloadInput) -> dict:
    return model_registry.enqueue_download(payload.engine, payload.model_id)


@app.get("/asr/download/state")
async def asr_download_state() -> dict:
    return model_registry.state()


@app.post("/asr/download/cancel")
async def asr_download_cancel(payload: ModelCancelInput) -> dict:
    return model_registry.cancel_download(payload.task_id)


@app.post("/asr/download/retry")
async def asr_download_retry(payload: ModelRetryInput) -> dict:
    return model_registry.retry_download(payload.task_id)


@app.get("/asr/download/health")
async def asr_download_health() -> dict:
    return model_registry.queue_health()


@app.post("/asr/apply")
async def asr_apply_model(payload: ApplyModelInput) -> dict:
    installed = model_registry.is_installed(payload.engine, payload.model_id)
    if not installed:
        raise HTTPException(status_code=400, detail="Model is not ready. Download it first.")

    current = runtime_controller.runtime_settings
    running = runtime_controller.state.running

    new_settings = RuntimeSettings(
        **{
            **current.model_dump(),
            "language": normalize_transcription_language(payload.engine, payload.model_id, current.language),
            "asr_engine": payload.engine,
            "model_id": payload.model_id,
        },
    )
    runtime_controller.runtime_settings = new_settings
    save_runtime_settings(app_settings.settings_path, new_settings)

    restarted = False
    if running and payload.restart_if_running:
        await runtime_controller.stop()
        await runtime_controller.start()
        restarted = True

    return {
        "ok": True,
        "restarted": restarted,
        "running": runtime_controller.state.running,
        "settings": new_settings.model_dump(),
    }


@app.post("/asr/warmup")
async def asr_warmup() -> dict:
    s = runtime_controller.runtime_settings
    if not model_registry.is_installed(s.asr_engine, s.model_id):
        raise HTTPException(status_code=400, detail="Selected model is not ready. Download/apply first.")
    started = perf_counter()
    engine = AsrEngine(s.asr_engine, s.model_id, s.language)
    engine.initialize()
    elapsed_ms = (perf_counter() - started) * 1000
    return {
        "ok": True,
        "elapsed_ms": round(elapsed_ms, 2),
        "status": engine.status().__dict__,
    }


@app.post("/llm/credentials")
async def update_api_key(payload: LlmCredentialsInput) -> dict:
    if not payload.api_key.strip():
        raise HTTPException(status_code=400, detail="api_key cannot be empty")
    secret_store.set_api_key(payload.api_key.strip())
    return {"ok": True}


@app.delete("/llm/credentials")
async def clear_api_key() -> dict:
    secret_store.clear_api_key()
    return {"ok": True}


@app.get("/llm/credentials/status")
async def llm_credentials_status() -> dict:
    api_key = secret_store.get_api_key()
    return {
        "configured": bool(api_key and api_key.strip()),
        "masked": secret_store.get_api_key_hint(),
    }


@app.get("/asr/languages")
async def asr_languages() -> dict:
    s = runtime_controller.runtime_settings
    return {
        "engine": s.asr_engine,
        "model_id": s.model_id,
        "selected": s.language,
        "languages": supported_transcription_languages(s.asr_engine, s.model_id),
    }


@app.post("/transcription/start")
async def start_transcription() -> dict:
    await runtime_controller.start()
    return {"ok": True, "status": runtime_controller.status_payload()}


@app.post("/transcription/stop")
async def stop_transcription() -> dict:
    await runtime_controller.stop()
    return {"ok": True, "status": runtime_controller.status_payload()}


@app.post("/analysis/now")
async def analyze_now() -> dict:
    try:
        text = await runtime_controller.analyze_now()
        return {"ok": True, "analysis": text}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/transcript/clear")
async def clear_transcript() -> dict:
    await runtime_controller.clear_transcript()
    return {"ok": True, "status": runtime_controller.status_payload()}


@app.get("/transcript")
async def get_transcript() -> dict:
    return {"text": runtime_controller.transcript_store.full_text()}


@app.websocket("/ws")
async def websocket_stream(websocket: WebSocket) -> None:
    await websocket.accept()
    queue = runtime_controller.subscribe()
    try:
        await websocket.send_json({"type": "status", "data": runtime_controller.status_payload()})
        while True:
            try:
                payload = await asyncio.wait_for(queue.get(), timeout=30)
                await websocket.send_json(payload)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "status", "data": runtime_controller.status_payload()})
    except WebSocketDisconnect:
        pass
    finally:
        runtime_controller.unsubscribe(queue)

