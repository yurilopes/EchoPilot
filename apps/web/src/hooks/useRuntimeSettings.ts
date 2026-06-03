import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { apiGet, apiPostSettings, apiPutSettings, cacheRuntimeSettingsSnapshot } from "../api";
import type { RuntimeSettingsPatch } from "../api";
import type { RuntimeSettings } from "../types";

export const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  language: "en",
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
};

export const SUPPORTED_LLM_MODEL_OPTIONS = [
  { value: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
] as const;

type UseRuntimeSettingsArgs = {
  onCoreUnavailable?: () => void;
};

type RuntimeSettingsWorkspace = {
  settings: RuntimeSettings;
  settingsLoaded: boolean;
  setSettings: Dispatch<SetStateAction<RuntimeSettings>>;
  saveRuntimeSettings: (value?: RuntimeSettings) => Promise<void>;
  saveRuntimeSettingsPatch: (patch: RuntimeSettingsPatch) => Promise<void>;
  flushRuntimeSettings: (value?: RuntimeSettings) => void;
};

function normalizeRuntimeSettings(value: RuntimeSettings): RuntimeSettings {
  const normalizedBase = { ...DEFAULT_RUNTIME_SETTINGS, ...value };
  const llmModelSupported = SUPPORTED_LLM_MODEL_OPTIONS.some((option) => option.value === normalizedBase.llm_model);
  return llmModelSupported
    ? normalizedBase
    : { ...normalizedBase, llm_model: DEFAULT_RUNTIME_SETTINGS.llm_model };
}

export function useRuntimeSettings({ onCoreUnavailable }: UseRuntimeSettingsArgs = {}): RuntimeSettingsWorkspace {
  const [settingsState, setSettingsState] = useState<RuntimeSettings>(DEFAULT_RUNTIME_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistSettingsRef = useRef<(value: RuntimeSettings) => Promise<void>>(async () => undefined);
  const settingsRef = useRef(settingsState);
  settingsRef.current = settingsState;

  const cacheSettingsSnapshot = useCallback((settings: RuntimeSettings) => {
    if (typeof window !== "undefined") {
      const snapshot = JSON.stringify(settings);
      (window as Window & { __echopilotRuntimeSettingsSnapshot?: string }).__echopilotRuntimeSettingsSnapshot = snapshot;
      window.parent?.postMessage({ type: "echopilot-runtime-settings-snapshot", snapshot }, "*");
      try {
        window.localStorage.removeItem("echopilot.runtimeSettings");
      } catch {
        // The backend remains the source of truth when local storage is unavailable.
      }
    }
    void cacheRuntimeSettingsSnapshot(settings);
  }, []);

  const schedulePersistRetry = useCallback(() => {
    if (persistRetryTimerRef.current) clearTimeout(persistRetryTimerRef.current);
    persistRetryTimerRef.current = setTimeout(() => {
      persistRetryTimerRef.current = null;
      void persistSettingsRef.current(settingsRef.current);
    }, 1000);
  }, []);

  const setSettings = useCallback<Dispatch<SetStateAction<RuntimeSettings>>>((value) => {
    const next = typeof value === "function" ? (value as (prevState: RuntimeSettings) => RuntimeSettings)(settingsRef.current) : value;
    settingsRef.current = next;
    cacheSettingsSnapshot(next);
    setSettingsState(next);
  }, [cacheSettingsSnapshot]);

  const persistSettings = useCallback(async (value: RuntimeSettings): Promise<void> => {
    const normalized = normalizeRuntimeSettings(value);
    try {
      await apiPutSettings(normalized);
      if (persistRetryTimerRef.current) {
        clearTimeout(persistRetryTimerRef.current);
        persistRetryTimerRef.current = null;
      }
      if (normalized.llm_model !== value.llm_model) {
        setSettings(normalized);
      }
    } catch (error) {
      if (String(error).toLowerCase().includes("core api is temporarily unavailable")) {
        onCoreUnavailable?.();
        schedulePersistRetry();
        return;
      }
      throw error;
    }
  }, [onCoreUnavailable, schedulePersistRetry, setSettings]);

  useEffect(() => {
    persistSettingsRef.current = persistSettings;
  }, [persistSettings]);

  const saveRuntimeSettings = useCallback(async (value?: RuntimeSettings): Promise<void> => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    await persistSettings(value ?? settingsRef.current);
  }, [persistSettings]);

  const saveRuntimeSettingsPatch = useCallback(async (patch: RuntimeSettingsPatch): Promise<void> => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    await apiPutSettings(patch);
  }, []);

  const flushRuntimeSettings = useCallback((value?: RuntimeSettings) => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const snapshot = value ?? settingsRef.current;
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
    if (settingsLoaded) {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        void persistSettings(settingsRef.current);
      }, 350);
    }
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (persistRetryTimerRef.current) clearTimeout(persistRetryTimerRef.current);
    };
  }, [settingsLoaded, settingsState, persistSettings]);

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
          setSettings(normalized);
          setSettingsLoaded(true);
          if (JSON.stringify(normalized) !== JSON.stringify(loaded)) {
            void apiPutSettings(normalized);
          }
        })
        .catch((error) => {
          if (cancelled) return;
          if (String(error).toLowerCase().includes("core api is temporarily unavailable")) {
            onCoreUnavailable?.();
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
    };
  }, [onCoreUnavailable, setSettings]);

  useEffect(() => {
    cacheSettingsSnapshot(settingsState);
  }, [cacheSettingsSnapshot, settingsState]);

  return {
    settings: settingsState,
    settingsLoaded,
    setSettings,
    saveRuntimeSettings,
    saveRuntimeSettingsPatch,
    flushRuntimeSettings,
  };
}
