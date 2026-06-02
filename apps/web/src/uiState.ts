import type { AiReadinessState, RuntimeSettings, RuntimeStatus, SessionUiState } from "./types";

export function deriveSessionState(status: RuntimeStatus | null, inFlight: "none" | "starting" | "stopping", hasError: boolean): SessionUiState {
  if (inFlight === "starting") return "starting";
  if (inFlight === "stopping") return "stopping";
  if (hasError) return "error";
  if (status?.running) return "running";
  return "idle";
}

export function deriveAiReadiness(
  settings: RuntimeSettings,
  status: RuntimeStatus | null,
  aiKeyConfigured: boolean,
): { state: AiReadinessState; message: string } {
  if (!settings.ai_enabled) return { state: "disabled", message: "AI analysis is disabled." };
  if (!settings.base_url.trim() || !settings.llm_model.trim() || !settings.prompt.trim()) {
    return { state: "invalid_config", message: "Complete Base URL, model, and prompt." };
  }
  if (!aiKeyConfigured) {
    return { state: "missing_key", message: "API key is not configured." };
  }

  const llmStatus = (status?.llm_connection_status ?? "unknown").toLowerCase();
  if (llmStatus.includes("missing") || llmStatus.includes("key")) {
    return { state: "missing_key", message: "API key is not configured." };
  }
  if ((settings.analysis_interval_seconds ?? 0) <= 0) {
    return { state: "ready", message: "AI is configured and ready. Periodic analysis is disabled until Periodic Analysis (s) is greater than 0." };
  }
  return { state: "ready", message: "AI is configured and ready." };
}

export function canAnalyzeNow(readiness: AiReadinessState, transcriptText: string): boolean {
  return readiness === "ready" && transcriptText.trim().length > 0;
}
