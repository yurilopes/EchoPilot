import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPostSettings, apiPutSettings } from "../api";
import type { RuntimeSettingsPatch } from "../api";
import type { RuntimeSettings } from "../types";
import { normalizeAnalysisLanguage, normalizeTranscriptionLanguage } from "../languageOptions";

export const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  language: "auto",
  asr_engine: "whisper",
  model_id: "base",
  ai_enabled: true,
  auto_analysis_enabled: true,
  chunk_seconds: 2,
  analysis_interval_seconds: 2,
  clear_transcript_on_start: false,
  base_url: "https://api.deepseek.com",
  llm_model: "deepseek-v4-flash",
  prompt: "Summarize key points and action items from this transcript.",
  analysis_language: "en",
};

export const SUPPORTED_LLM_MODEL_OPTIONS = [
  { value: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
] as const;

type UseRuntimeSettingsArgs = {
  onCoreUnavailable?: () => void;
};

type UpdateSettingsOptions = {
  persistNow?: boolean;
};

type RuntimeSettingsWorkspace = {
  settings: RuntimeSettings;
  settingsLoaded: boolean;
  updateSettings: (patch: RuntimeSettingsPatch, options?: UpdateSettingsOptions) => Promise<RuntimeSettings>;
  saveRuntimeSettings: (value?: RuntimeSettings) => Promise<void>;
  flushRuntimeSettings: (value?: RuntimeSettings) => void;
};

function normalizeRuntimeSettings(value: RuntimeSettings): RuntimeSettings {
  const normalizedBase = { ...DEFAULT_RUNTIME_SETTINGS, ...value };
  const llmModelSupported = SUPPORTED_LLM_MODEL_OPTIONS.some((option) => option.value === normalizedBase.llm_model);
  const withSupportedModel = llmModelSupported
    ? normalizedBase
    : { ...normalizedBase, llm_model: DEFAULT_RUNTIME_SETTINGS.llm_model };
  return {
    ...withSupportedModel,
    language: normalizeTranscriptionLanguage(withSupportedModel),
    analysis_language: normalizeAnalysisLanguage(withSupportedModel.analysis_language),
  };
}

function settingsEqual(a: RuntimeSettings, b: RuntimeSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useRuntimeSettings({ onCoreUnavailable }: UseRuntimeSettingsArgs = {}): RuntimeSettingsWorkspace {
  const [settingsState, setSettingsState] = useState<RuntimeSettings>(DEFAULT_RUNTIME_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const settingsRef = useRef<RuntimeSettings>(DEFAULT_RUNTIME_SETTINGS);
  const settingsLoadedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markCoreUnavailable = useCallback((error: unknown) => {
    if (String(error).toLowerCase().includes("core api is temporarily unavailable")) {
      onCoreUnavailable?.();
      return true;
    }
    return false;
  }, [onCoreUnavailable]);

  const persistFullSettings = useCallback(async (settings: RuntimeSettings): Promise<RuntimeSettings> => {
    const normalized = normalizeRuntimeSettings(settings);
    settingsRef.current = normalized;
    setSettingsState(normalized);
    const confirmed = normalizeRuntimeSettings(await apiPutSettings(normalized));
    settingsRef.current = confirmed;
    setSettingsState(confirmed);
    return confirmed;
  }, []);

  const scheduleSave = useCallback((settings: RuntimeSettings) => {
    if (!settingsLoadedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persistFullSettings(settings).catch((error) => {
        if (!markCoreUnavailable(error)) {
          console.warn("settings_autosave_failed", error);
        }
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          scheduleSave(settingsRef.current);
        }, 1000);
      });
    }, 350);
  }, [markCoreUnavailable, persistFullSettings]);

  const saveRuntimeSettings = useCallback(async (value?: RuntimeSettings): Promise<void> => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    try {
      await persistFullSettings(value ?? settingsRef.current);
    } catch (error) {
      if (!markCoreUnavailable(error)) throw error;
      scheduleSave(settingsRef.current);
    }
  }, [markCoreUnavailable, persistFullSettings, scheduleSave]);

  const updateSettings = useCallback(async (
    patch: RuntimeSettingsPatch,
    options: UpdateSettingsOptions = {},
  ): Promise<RuntimeSettings> => {
    const previous = settingsRef.current;
    const next = normalizeRuntimeSettings({ ...settingsRef.current, ...patch });
    settingsRef.current = next;
    setSettingsState(next);

    if (!settingsLoadedRef.current) {
      return next;
    }

    if (options.persistNow) {
      try {
        return await persistFullSettings(next);
      } catch (error) {
        settingsRef.current = previous;
        setSettingsState(previous);
        if (!markCoreUnavailable(error)) throw error;
        scheduleSave(settingsRef.current);
        return settingsRef.current;
      }
    }
    scheduleSave(next);
    return next;
  }, [markCoreUnavailable, persistFullSettings, scheduleSave]);

  const flushRuntimeSettings = useCallback((value?: RuntimeSettings) => {
    if (!settingsLoadedRef.current) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const snapshot = normalizeRuntimeSettings(value ?? settingsRef.current);
    settingsRef.current = snapshot;

    // Keep the backend settings file as the only persistence target.
    // Desktop-side cached snapshots can overwrite fresher UI state on close.
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      try {
        const sent = navigator.sendBeacon(
          "http://127.0.0.1:8765/settings",
          new Blob([JSON.stringify(snapshot)], { type: "application/json" }),
        );
        if (sent) return;
      } catch (error) {
        console.warn("settings_unload_beacon_failed", error);
      }
    }
    void apiPostSettings(snapshot).catch((error) => console.warn("settings_unload_flush_failed", error));
  }, []);

  useEffect(() => {
    const flushSettings = () => {
      flushRuntimeSettings();
    };
    const flushSettingsFromParent = (event: MessageEvent) => {
      if (event.data?.type === "echopilot-flush-runtime-settings") {
        flushRuntimeSettings();
      }
    };

    window.addEventListener("pagehide", flushSettings);
    window.addEventListener("beforeunload", flushSettings);
    window.addEventListener("message", flushSettingsFromParent);
    return () => {
      window.removeEventListener("pagehide", flushSettings);
      window.removeEventListener("beforeunload", flushSettings);
      window.removeEventListener("message", flushSettingsFromParent);
    };
  }, [flushRuntimeSettings]);

  useEffect(() => {
    const windowWithFlush = window as Window & {
      __echopilotFlushRuntimeSettings?: () => void;
    };
    windowWithFlush.__echopilotFlushRuntimeSettings = flushRuntimeSettings;
    return () => {
      if (windowWithFlush.__echopilotFlushRuntimeSettings === flushRuntimeSettings) {
        delete windowWithFlush.__echopilotFlushRuntimeSettings;
      }
    };
  }, [flushRuntimeSettings]);

  useEffect(() => {
    let cancelled = false;
    let loadRetryTimer: ReturnType<typeof setTimeout> | null = null;

    const loadSettings = () => {
      apiGet<RuntimeSettings>("/settings")
        .then((loaded) => {
          if (cancelled) return;
          const normalized = normalizeRuntimeSettings(loaded);
          settingsRef.current = normalized;
          settingsLoadedRef.current = true;
          setSettingsState(normalized);
          setSettingsLoaded(true);
          if (!settingsEqual(normalized, loaded)) {
            scheduleSave(normalized);
          }
        })
        .catch((error) => {
          if (cancelled) return;
          if (markCoreUnavailable(error)) {
            loadRetryTimer = setTimeout(loadSettings, 1000);
            return;
          }
          console.warn("settings_boot_failed", error);
        });
    };

    loadSettings();
    return () => {
      cancelled = true;
      if (loadRetryTimer) clearTimeout(loadRetryTimer);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [markCoreUnavailable, scheduleSave]);

  return {
    settings: settingsState,
    settingsLoaded,
    updateSettings,
    saveRuntimeSettings,
    flushRuntimeSettings,
  };
}
