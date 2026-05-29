from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from realtime_system_transcriber.runtime import RuntimeController
from realtime_system_transcriber.secrets import SecretStore
from realtime_system_transcriber.settings import AppSettings, RuntimeSettings, ensure_runtime_settings, save_runtime_settings
from realtime_system_transcriber.telemetry import configure_logging

app_settings = AppSettings()
runtime_settings = ensure_runtime_settings(app_settings.settings_path)
secret_store = SecretStore(app_settings.secret_service_name, app_settings.secret_username)
runtime_controller = RuntimeController(runtime_settings, secret_store)


class RuntimeSettingsUpdate(BaseModel):
    language: str = Field(default="en")
    model_size: str = Field(default="base")
    chunk_seconds: float = Field(default=2.0)
    analysis_interval_seconds: int = Field(default=0)
    base_url: str = Field(default="https://api.deepseek.com")
    llm_model: str = Field(default="deepseek-chat")
    prompt: str = Field(default="Summarize key points and action items from this transcript.")


class LlmCredentialsInput(BaseModel):
    api_key: str


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging(app_settings.log_level)
    yield
    await runtime_controller.stop()


app = FastAPI(title="Realtime System Transcriber Core", version="0.1.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "service": "core", "status": runtime_controller.status_payload()}


@app.get("/diagnostics")
async def diagnostics() -> dict:
    return {
        "status": runtime_controller.status_payload(),
        "runtime_settings": runtime_controller.runtime_settings.model_dump(),
    }


@app.get("/settings")
async def get_settings() -> dict:
    return runtime_controller.runtime_settings.model_dump()


@app.put("/settings")
async def update_settings(payload: RuntimeSettingsUpdate) -> dict:
    new_settings = RuntimeSettings(**payload.model_dump())
    runtime_controller.runtime_settings = new_settings
    save_runtime_settings(app_settings.settings_path, new_settings)
    return {"ok": True, "settings": new_settings.model_dump()}


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
            payload = await asyncio.wait_for(queue.get(), timeout=30)
            await websocket.send_json(payload)
    except (WebSocketDisconnect, TimeoutError):
        pass
    finally:
        runtime_controller.unsubscribe(queue)
