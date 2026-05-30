import type { AiReadinessState, RuntimeSettings, RuntimeStatus, SessionUiState } from "./types";

export function deriveSessionState(status: RuntimeStatus | null, inFlight: "none" | "starting" | "stopping", hasError: boolean): SessionUiState {
  if (inFlight === "starting") return "starting";
  if (inFlight === "stopping") return "stopping";
  if (hasError) return "error";
  if (status?.running) return "running";
  return "idle";
}

export function deriveAiReadiness(settings: RuntimeSettings, status: RuntimeStatus | null): { state: AiReadinessState; message: string } {
  if (!settings.ai_enabled) return { state: "disabled", message: "AI analysis is disabled." };
  if (!settings.base_url.trim() || !settings.llm_model.trim() || !settings.prompt.trim()) {
    return { state: "invalid_config", message: "Complete Base URL, model, and prompt." };
  }

  const llmStatus = (status?.llm_connection_status ?? "unknown").toLowerCase();
  if (llmStatus.includes("missing") || llmStatus.includes("key")) {
    return { state: "missing_key", message: "API key is not configured." };
  }
  return { state: "ready", message: "AI is configured and ready." };
}

export function canAnalyzeNow(readiness: AiReadinessState, transcriptText: string): boolean {
  return readiness === "ready" && transcriptText.trim().length > 0;
}
