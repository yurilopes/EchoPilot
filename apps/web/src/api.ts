import type { RuntimeSettings } from "./types";
import type { UiPreferences } from "./types";

const API = "http://127.0.0.1:8765";
export type RuntimeSettingsPatch = Partial<RuntimeSettings>;

function normalizeFetchError(error: unknown): Error {
  if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
    return new Error("Core API is temporarily unavailable. It may be restarting. Please retry in a few seconds.");
  }
  if (error instanceof Error) return error;
  return new Error(String(error));
}

export async function apiGet<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`);
  } catch (error) {
    throw normalizeFetchError(error);
  }
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    throw normalizeFetchError(error);
  }
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiPutSettings(settings: RuntimeSettingsPatch): Promise<RuntimeSettings> {
  let response: Response;
  try {
    response = await fetch(`${API}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
      keepalive: true
    });
  } catch (error) {
    throw normalizeFetchError(error);
  }
  if (!response.ok) throw new Error(await response.text());
  const payload = await response.json() as { settings?: RuntimeSettings };
  if (!payload.settings) throw new Error("Settings response did not include confirmed settings.");
  return payload.settings;
}

export async function apiPostSettings(settings: RuntimeSettingsPatch): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
      keepalive: true
    });
  } catch (error) {
    throw normalizeFetchError(error);
  }
  if (!response.ok) throw new Error(await response.text());
}

export async function apiGetUiPreferences(): Promise<UiPreferences> {
  return apiGet<UiPreferences>("/ui/preferences");
}

export async function apiPutUiPreferences(preferences: UiPreferences): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API}/ui/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preferences),
      keepalive: true
    });
  } catch (error) {
    throw normalizeFetchError(error);
  }
  if (!response.ok) throw new Error(await response.text());
}

export async function apiDownloadModel(engine: string, model_id: string): Promise<{ status: string; message: string }> {
  return apiPost("/asr/download", { engine, model_id });
}

export async function apiCancelDownload(task_id: string): Promise<{ ok: boolean; error?: string }> {
  return apiPost("/asr/download/cancel", { task_id });
}

export async function apiRetryDownload(task_id: string): Promise<{ ok: boolean; task?: unknown; error?: string }> {
  return apiPost("/asr/download/retry", { task_id });
}

export async function apiApplyModel(engine: string, model_id: string, restart_if_running = true): Promise<{ ok: boolean; restarted: boolean }> {
  return apiPost("/asr/apply", { engine, model_id, restart_if_running });
}

export async function apiWarmupModel(): Promise<{ ok: boolean; elapsed_ms: number }> {
  return apiPost("/asr/warmup");
}

export function socketUrl(): string {
  return "ws://127.0.0.1:8765/ws";
}
