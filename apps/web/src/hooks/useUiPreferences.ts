import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGetUiPreferences, apiPutUiPreferences } from "../api";
import type { ModelFilterCriteria, SortBy, SortDir, TabKey, UiPreferences, UiPreferences as UiPreferencesShape } from "../types";

export type UiPreferencesSaveState = "loading" | "ready" | "saving" | "error";

const TAB_VALUES: TabKey[] = ["live", "ai", "models", "settings"];
const SORT_VALUES: SortBy[] = ["name", "downloads", "speed", "quality", "live", "size", "installed"];
const SORT_DIR_VALUES: SortDir[] = ["asc", "desc"];

const createEmptyModelFilters = (): ModelFilterCriteria => ({
  live: [],
  quality: [],
  speed: [],
  size: [],
  state: [],
  installed: [],
});

const DEFAULT_UI_PREFERENCES: UiPreferencesShape = {
  active_tab: "live",
  model_filter: "",
  sort_by: "live",
  sort_dir: "desc",
  model_filters: createEmptyModelFilters(),
  auto_apply_after_download: false,
};

const normalizeUiPreferences = (value: Partial<UiPreferencesShape> | null | undefined): UiPreferencesShape => {
  const modelFilters = (value?.model_filters ?? {}) as Partial<ModelFilterCriteria>;
  const activeTab = TAB_VALUES.includes(value?.active_tab as TabKey) ? (value?.active_tab as TabKey) : DEFAULT_UI_PREFERENCES.active_tab;
  const sortBy = SORT_VALUES.includes(value?.sort_by as SortBy) ? (value?.sort_by as SortBy) : DEFAULT_UI_PREFERENCES.sort_by;
  const sortDir = SORT_DIR_VALUES.includes(value?.sort_dir as SortDir) ? (value?.sort_dir as SortDir) : DEFAULT_UI_PREFERENCES.sort_dir;
  return {
    active_tab: activeTab,
    model_filter: value?.model_filter ?? DEFAULT_UI_PREFERENCES.model_filter,
    sort_by: sortBy,
    sort_dir: sortDir,
    model_filters: {
      live: [...(modelFilters.live ?? [])],
      quality: [...(modelFilters.quality ?? [])],
      speed: [...(modelFilters.speed ?? [])],
      size: [...(modelFilters.size ?? [])],
      state: [...(modelFilters.state ?? [])],
      installed: [...(modelFilters.installed ?? [])] as Array<"yes" | "no">,
    },
    auto_apply_after_download: !!value?.auto_apply_after_download,
  };
};

export function useUiPreferences() {
  const [tab, setTab] = useState<TabKey>(DEFAULT_UI_PREFERENCES.active_tab);
  const [modelFilter, setModelFilter] = useState(DEFAULT_UI_PREFERENCES.model_filter);
  const [sortBy, setSortBy] = useState<SortBy>(DEFAULT_UI_PREFERENCES.sort_by);
  const [sortDir, setSortDir] = useState<SortDir>(DEFAULT_UI_PREFERENCES.sort_dir);
  const [modelFilters, setModelFilters] = useState<ModelFilterCriteria>({ ...DEFAULT_UI_PREFERENCES.model_filters });
  const [autoApplyAfterDownload, setAutoApplyAfterDownload] = useState(DEFAULT_UI_PREFERENCES.auto_apply_after_download);
  const [saveState, setSaveState] = useState<UiPreferencesSaveState>("loading");

  const hydratedRef = useRef(false);
  const loadInFlightRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(JSON.stringify(DEFAULT_UI_PREFERENCES));

  const preferences = useMemo<UiPreferencesShape>(() => ({
    active_tab: tab,
    model_filter: modelFilter,
    sort_by: sortBy,
    sort_dir: sortDir,
    model_filters: modelFilters,
    auto_apply_after_download: autoApplyAfterDownload,
  }), [tab, modelFilter, sortBy, sortDir, modelFilters, autoApplyAfterDownload]);

  const load = useCallback(async () => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    try {
      const loaded = normalizeUiPreferences(await apiGetUiPreferences());
      setTab(loaded.active_tab);
      setModelFilter(loaded.model_filter);
      setSortBy(loaded.sort_by);
      setSortDir(loaded.sort_dir);
      setModelFilters(loaded.model_filters);
      setAutoApplyAfterDownload(loaded.auto_apply_after_download);
      lastSavedRef.current = JSON.stringify(loaded);
      setSaveState("ready");
    } catch {
      // Keep defaults until the backend is available. A later call can hydrate again.
      setSaveState((prev) => (prev === "loading" ? "error" : prev));
    } finally {
      hydratedRef.current = true;
      loadInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const serialized = JSON.stringify(preferences);
    if (serialized === lastSavedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState("saving");
    saveTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          await apiPutUiPreferences(preferences);
          lastSavedRef.current = serialized;
          setSaveState("ready");
        } catch {
          setSaveState("error");
        }
      })();
    }, 350);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [preferences]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  const resetForEngineChange = useCallback(() => {
    setModelFilters(createEmptyModelFilters());
    setModelFilter("");
  }, []);

  return {
    activeTab: tab,
    setActiveTab: setTab,
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
    preferencesSaveState: saveState,
    reloadPreferences: load,
    resetForEngineChange,
  };
}
