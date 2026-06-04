import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  apiApplyModel,
  apiCancelDownload,
  apiDownloadModel,
  apiGet,
  apiRetryDownload,
  apiWarmupModel,
} from "../api";
import { normalizeTranscriptionLanguage } from "../languageOptions";
import { filterAndSortModels } from "../modelCatalog";
import type {
  AsrModelRow,
  CatalogResponse,
  DownloadStateResponse,
  ModelFilterCriteria,
  RuntimeSettings,
  TabKey,
  SortBy,
  SortDir,
} from "../types";

type ModelsPreferences = {
  modelFilter: string;
  setModelFilter: Dispatch<SetStateAction<string>>;
  sortBy: SortBy;
  setSortBy: Dispatch<SetStateAction<SortBy>>;
  sortDir: SortDir;
  setSortDir: Dispatch<SetStateAction<SortDir>>;
  modelFilters: ModelFilterCriteria;
  setModelFilters: Dispatch<SetStateAction<ModelFilterCriteria>>;
  autoApplyAfterDownload: boolean;
  setAutoApplyAfterDownload: Dispatch<SetStateAction<boolean>>;
};

type UseModelsWorkspaceArgs = {
  settings: RuntimeSettings;
  updateSettings: (patch: Partial<RuntimeSettings>, options?: { persistNow?: boolean }) => Promise<RuntimeSettings>;
  setActiveTab: Dispatch<SetStateAction<TabKey>>;
  preferences: ModelsPreferences;
  onCatalogError?: (error: unknown) => void;
};

const createEmptyModelFilters = (): ModelFilterCriteria => ({
  live: [],
  quality: [],
  speed: [],
  size: [],
  state: [],
  installed: [],
});

export function useModelsWorkspace({
  settings,
  updateSettings,
  setActiveTab,
  preferences,
  onCatalogError,
}: UseModelsWorkspaceArgs) {
  const {
    modelFilter,
    setModelFilter,
    sortBy,
    setSortBy,
    sortDir,
    setSortDir,
    modelFilters,
    setModelFilters,
    autoApplyAfterDownload,
    setAutoApplyAfterDownload,
  } = preferences;

  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadStateResponse | null>(null);
  const [pendingApply, setPendingApply] = useState<{ engine: "whisper" | "parakeet"; modelId: string } | null>(null);
  const [warmupInfo, setWarmupInfo] = useState("");
  const [now, setNow] = useState(Date.now());

  const settingsRef = useRef(settings);
  const prevEngineRef = useRef(settings.asr_engine);

  const clearModelFilters = useCallback(() => {
    setModelFilters(createEmptyModelFilters());
    setModelFilter("");
  }, [setModelFilter, setModelFilters]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const refreshCatalog = useCallback(async () => {
    setCatalog(await apiGet<CatalogResponse>("/asr/catalog"));
  }, []);

  const refreshDownloadState = useCallback(async () => {
    const state = await apiGet<DownloadStateResponse>("/asr/download/state");
    setDownloadState(state);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    void refreshCatalog().catch((error) => {
      if (onCatalogError) {
        onCatalogError(error);
        return;
      }
      console.warn("catalog_refresh_failed", error);
    });
    void refreshDownloadState().catch(() => undefined);
  }, [onCatalogError, refreshCatalog, refreshDownloadState]);

  useEffect(() => {
    if (prevEngineRef.current === settings.asr_engine) return;
    prevEngineRef.current = settings.asr_engine;
    clearModelFilters();
    void refreshCatalog().catch((error) => {
      if (onCatalogError) {
        onCatalogError(error);
        return;
      }
      console.warn("catalog_refresh_failed", error);
    });
  }, [clearModelFilters, onCatalogError, refreshCatalog, settings.asr_engine]);

  useEffect(() => {
    const poll = setInterval(() => {
      void (async () => {
        try {
          const state = await apiGet<DownloadStateResponse>("/asr/download/state");
          setDownloadState(state);
          setNow(Date.now());
          if (autoApplyAfterDownload && pendingApply) {
            const doneTask = state.tasks.find((t) => t.engine === pendingApply.engine && t.model_id === pendingApply.modelId && t.status === "done");
            if (doneTask) {
              const baseSettings = { ...settingsRef.current, asr_engine: pendingApply.engine, model_id: pendingApply.modelId };
              const nextSettings = { ...baseSettings, language: normalizeTranscriptionLanguage(baseSettings) };
              await updateSettings(nextSettings, { persistNow: true });
              await apiApplyModel(pendingApply.engine, pendingApply.modelId, true);
              await refreshCatalog();
              setPendingApply(null);
              setAutoApplyAfterDownload(false);
            }
          }
        } catch {
          // keep polling
        }
      })();
    }, 1000);

    return () => clearInterval(poll);
  }, [autoApplyAfterDownload, pendingApply, refreshCatalog, setAutoApplyAfterDownload, updateSettings]);

  const activeEngineRows = useMemo(() => {
    if (!catalog) return [] as AsrModelRow[];
    return settings.asr_engine === "whisper" ? catalog.models.whisper : catalog.models.parakeet;
  }, [catalog, settings.asr_engine]);

  const activeModels = useMemo(() => {
    if (!catalog) return [] as AsrModelRow[];
    const rows = settings.asr_engine === "whisper" ? catalog.models.whisper : catalog.models.parakeet;
    return filterAndSortModels(rows, modelFilter, sortBy, sortDir, modelFilters);
  }, [catalog, modelFilter, modelFilters, settings.asr_engine, sortBy, sortDir]);

  const filterOptions = useMemo(() => {
    const uniq = (arr: string[]) => [...new Set(arr)].sort((a, b) => a.localeCompare(b));
    return {
      live: uniq(activeEngineRows.map((m) => m.profile.live_suitability)),
      quality: uniq(activeEngineRows.map((m) => m.profile.quality)),
      speed: uniq(activeEngineRows.map((m) => m.profile.speed)),
      size: uniq(activeEngineRows.map((m) => m.profile.footprint)),
      state: uniq(activeEngineRows.map((m) => m.availability)),
    };
  }, [activeEngineRows]);

  const elapsedSeconds = useCallback(
    (startedAt: number | null | undefined) => (startedAt ? Math.max(0, Math.floor(now / 1000 - startedAt)) : 0),
    [now],
  );

  const queueAlert = useMemo(() => {
    if ((downloadState?.failed_count ?? 0) > 0) {
      return "One or more downloads failed. Use Retry on the affected model.";
    }
    if (downloadState?.tasks.some((t) => t.status === "downloading" && t.progress.bytes_downloaded === 0 && elapsedSeconds(t.started_at) > 20)) {
      return "Active download has no progress yet. If this persists, cancel and retry.";
    }
    return "";
  }, [downloadState, elapsedSeconds]);

  const toggleFilter = useCallback(<K extends keyof ModelFilterCriteria>(key: K, value: ModelFilterCriteria[K][number]) => {
    setModelFilters((prev) => {
      const current = prev[key] as Array<typeof value>;
      const next = current.includes(value) ? current.filter((x) => x !== value) : [...current, value];
      return { ...prev, [key]: next };
    });
  }, [setModelFilters]);

  const onEngineChange = useCallback(async (engine: "whisper" | "parakeet") => {
    const baseSettings = { ...settingsRef.current, asr_engine: engine };
    const nextSettings = { ...baseSettings, language: normalizeTranscriptionLanguage(baseSettings) };
    clearModelFilters();
    await updateSettings(nextSettings, { persistNow: true });
    await refreshCatalog();
  }, [clearModelFilters, refreshCatalog, updateSettings]);

  const onSelectModel = useCallback(async () => {
    await updateSettings(settingsRef.current, { persistNow: true });
    await refreshCatalog();
  }, [refreshCatalog, updateSettings]);

  const onApplyToRuntime = useCallback(async () => {
    const current = settingsRef.current;
    await apiApplyModel(current.asr_engine, current.model_id, true);
    const persistedSettings = await apiGet<RuntimeSettings>("/settings");
    await updateSettings(persistedSettings, { persistNow: false });
    await refreshCatalog();
    setActiveTab("live");
  }, [refreshCatalog, setActiveTab, updateSettings]);

  const onUseModel = useCallback(async (modelId: string) => {
    const current = settingsRef.current;
    const nextSettings = { ...current, model_id: modelId };
    await updateSettings({ ...nextSettings, language: normalizeTranscriptionLanguage(nextSettings) }, { persistNow: true });
    await apiApplyModel(current.asr_engine, modelId, true);
    const persistedSettings = await apiGet<RuntimeSettings>("/settings");
    await updateSettings(persistedSettings, { persistNow: false });
    await refreshCatalog();
    setActiveTab("live");
  }, [refreshCatalog, setActiveTab, updateSettings]);

  const onDownload = useCallback(async (modelId: string) => {
    const current = settingsRef.current;
    await apiDownloadModel(current.asr_engine, modelId);
    if (autoApplyAfterDownload) {
      setPendingApply({ engine: current.asr_engine, modelId });
    }
    await refreshCatalog();
  }, [autoApplyAfterDownload, refreshCatalog]);

  const onCancel = useCallback(async (taskId: string) => {
    await apiCancelDownload(taskId);
    await refreshCatalog();
  }, [refreshCatalog]);

  const onRetry = useCallback(async (taskId: string) => {
    await apiRetryDownload(taskId);
    await refreshCatalog();
  }, [refreshCatalog]);

  const onWarmup = useCallback(async () => {
    try {
      const r = await apiWarmupModel();
      setWarmupInfo(`Warmup done in ${r.elapsed_ms} ms`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 900));
      const r = await apiWarmupModel();
      setWarmupInfo(`Warmup done in ${r.elapsed_ms} ms`);
    }
  }, []);

  return {
    activeModels,
    activeEngineRows,
    filterOptions,
    downloadState,
    warmupInfo,
    queueAlert,
    refreshCatalog,
    elapsedSeconds,
    toggleFilter,
    onEngineChange,
    onSelectModel,
    onApplyToRuntime,
    onUseModel,
    onDownload,
    onCancel,
    onRetry,
    onWarmup,
    clearFilters: clearModelFilters,
    setWarmupInfo,
    setDownloadState,
  };
}
