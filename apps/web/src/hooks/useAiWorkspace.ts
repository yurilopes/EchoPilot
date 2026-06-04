import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { RuntimeSettingsPatch } from "../api";
import { apiGet, apiPost } from "../api";
import type { RuntimeSettings, RuntimeStatus, TabKey } from "../types";
import { canAnalyzeNow as canAnalyzeNowBase, deriveAiReadiness } from "../uiState";

type AnalysisStateKind = "unavailable" | "ready" | "waiting" | "up-to-date" | "in-progress";

type UseAiWorkspaceArgs = {
  settings: RuntimeSettings;
  updateSettings: (patch: RuntimeSettingsPatch, options?: { persistNow?: boolean }) => Promise<RuntimeSettings>;
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
  autoAnalysisSaving: boolean;
  autoAnalysisError: string;
  onOpenAiTab: () => void;
  aiEnabled: boolean;
  setAiEnabled: (checked: boolean) => void;
  baseUrl: string;
  setBaseUrl: (value: string) => void;
  llmModel: string;
  setLlmModel: (value: string) => void;
  analysisLanguage: string;
  setAnalysisLanguage: (value: string) => void;
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
  updateSettings,
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
  const [autoAnalysisSaving, setAutoAnalysisSaving] = useState(false);
  const [autoAnalysisError, setAutoAnalysisError] = useState("");

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
    setAutoAnalysisSaving(true);
    setAutoAnalysisError("");
    try {
      await updateSettings({ auto_analysis_enabled: checked }, { persistNow: true });
    } catch (error) {
      setAutoAnalysisError("Save failed");
      throw error;
    } finally {
      setAutoAnalysisSaving(false);
    }
  };

  const setAiEnabled = (checked: boolean) => {
    void updateSettings({ ai_enabled: checked });
  };

  const setBaseUrl = (value: string) => {
    void updateSettings({ base_url: value });
  };

  const setLlmModel = (value: string) => {
    void updateSettings({ llm_model: value });
  };

  const setAnalysisLanguage = (value: string) => {
    void updateSettings({ analysis_language: value });
  };

  const setAnalysisIntervalSeconds = (value: number) => {
    void updateSettings({ analysis_interval_seconds: value });
  };

  const setPrompt = (value: string) => {
    void updateSettings({ prompt: value });
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
    autoAnalysisSaving,
    autoAnalysisError,
    onOpenAiTab,
    aiEnabled: settings.ai_enabled,
    setAiEnabled,
    baseUrl: settings.base_url,
    setBaseUrl,
    llmModel: settings.llm_model,
    setLlmModel,
    analysisLanguage: settings.analysis_language,
    setAnalysisLanguage,
    analysisIntervalSeconds: settings.analysis_interval_seconds,
    setAnalysisIntervalSeconds,
    prompt: settings.prompt,
    setPrompt,
  };
}
