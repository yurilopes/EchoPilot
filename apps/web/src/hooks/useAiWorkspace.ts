import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { RuntimeSettingsPatch } from "../api";
import { apiGet, apiPost } from "../api";
import type { RuntimeSettings, RuntimeStatus, TabKey } from "../types";
import { canAnalyzeNow as canAnalyzeNowBase, deriveAiReadiness } from "../uiState";

type AnalysisStateKind = "unavailable" | "ready" | "waiting" | "up-to-date" | "in-progress";

type UseAiWorkspaceArgs = {
  settings: RuntimeSettings;
  setSettings: Dispatch<SetStateAction<RuntimeSettings>>;
  saveRuntimeSettings: (value?: RuntimeSettings) => Promise<void>;
  saveRuntimeSettingsPatch: (patch: RuntimeSettingsPatch) => Promise<void>;
  status: RuntimeStatus | null;
  transcript: string;
  setAnalysis: Dispatch<SetStateAction<string>>;
  setActiveTab: (tab: TabKey) => void;
};

type AnalysisState = {
  label: string;
  kind: AnalysisStateKind;
};

export type AiWorkspace = {
  aiReadiness: ReturnType<typeof deriveAiReadiness>;
  aiModelLabel: "Flash" | "Pro";
  aiStatusLabel: string;
  analysisBusy: boolean;
  canAnalyzeNow: boolean;
  analysisStateLabel: string;
  analysisStateKind: AnalysisStateKind;
  apiKey: string;
  apiKeyHint: string;
  apiKeyEdited: boolean;
  apiKeyInputValue: string;
  setApiKey: Dispatch<SetStateAction<string>>;
  setApiKeyEdited: Dispatch<SetStateAction<boolean>>;
  onApiKeyFocus: () => void;
  onApiKeyChange: (value: string) => void;
  saveApiKey: () => Promise<void>;
  onAnalyzeNow: () => Promise<void>;
  onToggleAutoAnalysis: (checked: boolean) => Promise<void>;
  onOpenAiTab: () => void;
  aiEnabled: boolean;
  setAiEnabled: (checked: boolean) => void;
  baseUrl: string;
  setBaseUrl: (value: string) => void;
  llmModel: string;
  setLlmModel: (value: string) => void;
  analysisIntervalSeconds: number;
  setAnalysisIntervalSeconds: (value: number) => void;
  prompt: string;
  setPrompt: (value: string) => void;
};

function deriveAnalysisState(aiReadinessState: ReturnType<typeof deriveAiReadiness>["state"], analysisBusy: boolean, transcript: string, status: RuntimeStatus | null): AnalysisState {
  if (aiReadinessState !== "ready") return { label: "Unavailable", kind: "unavailable" };
  if (analysisBusy) return { label: "In progress", kind: "in-progress" };
  if (transcript.trim().length === 0) return { label: "No transcript", kind: "waiting" };
  if (status?.transcript_signature && status?.last_analysis_signature && status.transcript_signature === status.last_analysis_signature) {
    return { label: "Up to date", kind: "up-to-date" };
  }
  return { label: "Ready", kind: "ready" };
}

export function useAiWorkspace({
  settings,
  setSettings,
  saveRuntimeSettings,
  saveRuntimeSettingsPatch,
  status,
  transcript,
  setAnalysis,
  setActiveTab,
}: UseAiWorkspaceArgs): AiWorkspace {
  const [apiKey, setApiKey] = useState("");
  const [apiKeyHint, setApiKeyHint] = useState("");
  const [apiKeyEdited, setApiKeyEdited] = useState(false);
  const [aiKeyConfigured, setAiKeyConfigured] = useState(false);
  const [manualAnalysisInFlight, setManualAnalysisInFlight] = useState(false);

  const aiReadiness = useMemo(() => deriveAiReadiness(settings, status, aiKeyConfigured), [settings, status, aiKeyConfigured]);
  const aiModelLabel = useMemo(() => (settings.llm_model.toLowerCase().includes("pro") ? "Pro" : "Flash"), [settings.llm_model]);
  const analysisBusy = manualAnalysisInFlight || !!status?.analysis_in_progress;
  const canAnalyzeNow = canAnalyzeNowBase(aiReadiness.state, transcript) && !analysisBusy;
  const analysisState = useMemo(
    () => deriveAnalysisState(aiReadiness.state, analysisBusy, transcript, status),
    [aiReadiness.state, analysisBusy, transcript, status],
  );
  const aiStatusLabel = aiReadiness.state === "ready" ? "Configured" : "Needs setup";
  const apiKeyInputValue = apiKeyEdited ? apiKey : (apiKey || apiKeyHint);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ configured: boolean; masked?: string | null }>("/llm/credentials/status")
      .then((x) => {
        if (cancelled) return;
        setAiKeyConfigured(!!x.configured);
        setApiKeyHint((x.masked ?? "").trim());
        setApiKey("");
        setApiKeyEdited(false);
      })
      .catch(() => {
        if (cancelled) return;
        setAiKeyConfigured(false);
        setApiKeyHint("");
        setApiKey("");
        setApiKeyEdited(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshCredentialsStatus = async () => {
    const credentials = await apiGet<{ configured: boolean; masked?: string | null }>("/llm/credentials/status");
    setAiKeyConfigured(!!credentials.configured);
    setApiKeyHint((credentials.masked ?? "").trim());
    setApiKey("");
    setApiKeyEdited(false);
  };

  const saveApiKey = async () => {
    const nextApiKey = apiKey.trim();
    if (!nextApiKey) return;
    await apiPost("/llm/credentials", { api_key: nextApiKey });
    await refreshCredentialsStatus();
  };

  const onAnalyzeNow = async () => {
    setManualAnalysisInFlight(true);
    try {
      setAnalysis((await apiPost<{ analysis: string }>("/analysis/now")).analysis);
    } finally {
      setManualAnalysisInFlight(false);
    }
  };

  const onToggleAutoAnalysis = async (checked: boolean) => {
    setSettings((prev) => ({ ...prev, auto_analysis_enabled: checked }));
    await saveRuntimeSettingsPatch({ auto_analysis_enabled: checked });
  };

  const setAiEnabled = (checked: boolean) => {
    setSettings((prev) => ({ ...prev, ai_enabled: checked }));
  };

  const setBaseUrl = (value: string) => {
    setSettings((prev) => ({ ...prev, base_url: value }));
  };

  const setLlmModel = (value: string) => {
    setSettings((prev) => ({ ...prev, llm_model: value }));
  };

  const setAnalysisIntervalSeconds = (value: number) => {
    setSettings((prev) => ({ ...prev, analysis_interval_seconds: value }));
  };

  const setPrompt = (value: string) => {
    setSettings((prev) => ({ ...prev, prompt: value }));
  };

  const onOpenAiTab = () => setActiveTab("ai");

  const onApiKeyFocus = () => {
    if (apiKeyHint && !apiKeyEdited) setApiKeyEdited(true);
  };

  const onApiKeyChange = (value: string) => {
    if (!apiKeyEdited) setApiKeyEdited(true);
    setApiKey(value);
  };

  return {
    aiReadiness,
    aiModelLabel,
    aiStatusLabel,
    analysisBusy,
    canAnalyzeNow,
    analysisStateLabel: analysisState.label,
    analysisStateKind: analysisState.kind,
    apiKey,
    apiKeyHint,
    apiKeyEdited,
    apiKeyInputValue,
    setApiKey,
    setApiKeyEdited,
    onApiKeyFocus,
    onApiKeyChange,
    saveApiKey,
    onAnalyzeNow,
    onToggleAutoAnalysis,
    onOpenAiTab,
    aiEnabled: settings.ai_enabled,
    setAiEnabled,
    baseUrl: settings.base_url,
    setBaseUrl,
    llmModel: settings.llm_model,
    setLlmModel,
    analysisIntervalSeconds: settings.analysis_interval_seconds,
    setAnalysisIntervalSeconds,
    prompt: settings.prompt,
    setPrompt,
  };
}
