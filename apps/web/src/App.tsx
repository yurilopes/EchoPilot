import { useEffect, useMemo, useRef, useState } from "react";
import type { UIEvent } from "react";
import { Boxes, Mic, Settings2, Sparkles } from "lucide-react";
import {
  apiApplyModel,
  apiCancelDownload,
  apiDownloadModel,
  apiGet,
  apiPost,
  apiPutSettings,
  apiRetryDownload,
  apiWarmupModel,
  socketUrl,
} from "./api";
import { AiReadinessCard } from "./components/AiReadinessCard";
import { AnalysisPane } from "./components/AnalysisPane";
import { LiveTranscriptPane } from "./components/LiveTranscriptPane";
import { ModelRow } from "./components/ModelRow";
import { RuntimeStatusStrip } from "./components/RuntimeStatusStrip";
import { SessionControls } from "./components/SessionControls";
import { filterAndSortModels, type ModelFilterCriteria, type SortBy, type SortDir } from "./modelCatalog";
import type { AsrModelRow, CatalogResponse, DownloadStateResponse, RuntimeSettings, RuntimeStatus, TabKey, TranscriptFollowState } from "./types";
import { canAnalyzeNow, deriveAiReadiness, deriveSessionState } from "./uiState";

const DEFAULT_SETTINGS: RuntimeSettings = {
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

const AI_MODEL_OPTIONS = [
  { value: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
];

const APP_VERSION = "0.6.0";

const APP_TABS: Array<{ key: TabKey; label: string; icon: typeof Mic }> = [
  { key: "live", label: "Live", icon: Mic },
  { key: "ai", label: "AI", icon: Sparkles },
  { key: "models", label: "Models", icon: Boxes },
  { key: "settings", label: "Settings", icon: Settings2 },
];

function bytes(value: number | null): string {
  if (!value) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let n = value;
  let idx = 0;
  while (n >= 1024 && idx < units.length - 1) {
    n /= 1024;
    idx += 1;
  }
  return `${n.toFixed(1)} ${units[idx]}`;
}

export function App() {
  const transcriptDebug = (import.meta.env.VITE_ECHOPILOT_TRANSCRIPT_DEBUG ?? "").toString() === "1";
  const [tab, setTab] = useState<TabKey>("live");
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [settings, setSettings] = useState<RuntimeSettings>(DEFAULT_SETTINGS);
  const [transcript, setTranscript] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyHint, setApiKeyHint] = useState("");
  const [apiKeyEdited, setApiKeyEdited] = useState(false);
  const [error, setError] = useState("");
  const [backendConnecting, setBackendConnecting] = useState(false);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadStateResponse | null>(null);
  const [modelFilter, setModelFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("live");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [modelFilters, setModelFilters] = useState<ModelFilterCriteria>({
    live: [],
    quality: [],
    speed: [],
    size: [],
    state: [],
    installed: [],
  });
  const [pendingApply, setPendingApply] = useState<{ engine: "whisper" | "parakeet"; modelId: string } | null>(null);
  const [autoApplyAfterDownload, setAutoApplyAfterDownload] = useState(false);
  const [warmupInfo, setWarmupInfo] = useState("");
  const [now, setNow] = useState(Date.now());
  const [inFlight, setInFlight] = useState<"none" | "starting" | "stopping">("none");
  const [followState, setFollowState] = useState<TranscriptFollowState>("following");
  const [unreadChunks, setUnreadChunks] = useState(0);
  const [analysisUpdatedAt, setAnalysisUpdatedAt] = useState<number | null>(null);
  const [aiKeyConfigured, setAiKeyConfigured] = useState(false);
  const [optimisticRunTarget, setOptimisticRunTarget] = useState<boolean | null>(null);
  const [optimisticRunUntil, setOptimisticRunUntil] = useState<number>(0);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const followStateRef = useRef<TranscriptFollowState>("following");
  const initializedRef = useRef(false);
  const prevEngineRef = useRef<"whisper" | "parakeet">(DEFAULT_SETTINGS.asr_engine);
  const settingsRef = useRef(settings);
  const aiSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nowMs = Date.now();

  const refreshCatalog = async () => setCatalog(await apiGet<CatalogResponse>("/asr/catalog"));

  const normalizeTranscriptChunk = (value: string): string => {
    return value
      .replace(/-\s*[\r\n\u000B\u000C\u0085\u2028\u2029]+\s*/g, "")
      .replace(/\\r\\n|\\n|\\r/g, " ")
      .replace(/[\r\n\u000B\u000C\u0085\u2028\u2029]+/g, " ")
      .replace(/\u00A0/g, " ")
      .replace(/[\u0000-\u0009\u000E-\u001F\u007F]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const aiReadiness = deriveAiReadiness(settings, status, aiKeyConfigured);
  const hasOptimisticRun = optimisticRunTarget !== null && nowMs < optimisticRunUntil;
  const effectiveRunning = hasOptimisticRun ? optimisticRunTarget : (status?.running ?? false);
  const sessionState = deriveSessionState({ ...(status ?? ({} as RuntimeStatus)), running: effectiveRunning }, inFlight, !!error);
  const analyzeEnabled = canAnalyzeNow(aiReadiness.state, transcript);
  const displayedTranscript = normalizeTranscriptChunk(transcript);
  const analysisStateLabel =
    aiReadiness.state !== "ready"
      ? "Analysis unavailable"
      : status?.analysis_in_progress
        ? "Analysis in progress"
        : !settings.auto_analysis_enabled
          ? "Automatic analysis disabled"
          : status?.transcript_signature && status?.last_analysis_signature && status.transcript_signature === status.last_analysis_signature && transcript.trim().length > 0
            ? "Analysis up to date"
            : "Waiting for new transcript";

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!initializedRef.current) return;
    if (aiSaveTimerRef.current) clearTimeout(aiSaveTimerRef.current);
    aiSaveTimerRef.current = setTimeout(() => {
      void safe(async () => {
        await apiPutSettings(settings);
      });
    }, 350);
    return () => {
      if (aiSaveTimerRef.current) clearTimeout(aiSaveTimerRef.current);
    };
  }, [settings]);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      apiGet<RuntimeSettings>("/settings")
        .then((loaded) => {
          const normalizedBase = { ...DEFAULT_SETTINGS, ...loaded };
          const normalized = AI_MODEL_OPTIONS.some((opt) => opt.value === normalizedBase.llm_model)
            ? normalizedBase
            : { ...normalizedBase, llm_model: DEFAULT_SETTINGS.llm_model };
          setSettings(normalized);
          if (normalized.llm_model !== loaded.llm_model) {
            void apiPutSettings(normalized);
          }
        })
        .catch((e) => {
          if (String(e).toLowerCase().includes("core api is temporarily unavailable")) {
            setBackendConnecting(true);
            return;
          }
          setError(String(e));
        });

      apiGet<{ status: RuntimeStatus }>("/health")
        .then((x) => {
          setStatus(x.status);
          setBackendConnecting(false);
        })
        .catch((e) => {
          if (String(e).toLowerCase().includes("core api is temporarily unavailable")) {
            setBackendConnecting(true);
            return;
          }
          setError(String(e));
        });
      apiGet<{ text: string }>("/transcript")
        .then((x) => setTranscript(normalizeTranscriptChunk(String(x.text ?? ""))))
        .catch(() => undefined);
      refreshCatalog().catch((e) => {
        if (String(e).toLowerCase().includes("core api is temporarily unavailable")) {
          setBackendConnecting(true);
          return;
        }
        // Catalog failures should not interrupt live transcription UX.
        console.warn("catalog_refresh_failed", e);
      });
      apiGet<{ configured: boolean; masked?: string | null }>("/llm/credentials/status")
        .then((x) => {
          setAiKeyConfigured(!!x.configured);
          setApiKeyHint((x.masked ?? "").trim());
          setApiKey("");
          setApiKeyEdited(false);
        })
        .catch(() => {
          setAiKeyConfigured(false);
          setApiKeyHint("");
          setApiKey("");
          setApiKeyEdited(false);
        });
    }

    let stopped = false;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let connectingBannerTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stopped) return;
      ws = new WebSocket(socketUrl());
      ws.onopen = () => {
        setBackendConnecting(false);
        if (connectingBannerTimer) clearTimeout(connectingBannerTimer);
      };
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "status") setStatus(msg.data as RuntimeStatus);
        if (msg.type === "transcript") {
          const normalized = normalizeTranscriptChunk(String(msg.text ?? ""));
          if (!normalized) return;
          if (transcriptDebug && /[\r\n\u0085\u2028\u2029]/.test(String(msg.text ?? ""))) {
            console.debug("transcript_debug_ws_payload_contains_linebreak", JSON.stringify(msg.text ?? "").slice(0, 240));
          }
          setTranscript((prev) => normalizeTranscriptChunk(`${prev}${prev ? " " : ""}${normalized}`));
          if (followStateRef.current === "paused") setUnreadChunks((v) => v + 1);
        }
        if (msg.type === "analysis") {
          setAnalysis(msg.text);
          setAnalysisUpdatedAt(Date.now());
        }
        if (msg.type === "transcript_reset" || msg.type === "analysis_reset") {
          setTranscript("");
          setAnalysis("");
          setAnalysisUpdatedAt(null);
          setUnreadChunks(0);
          setFollowState("following");
          transcriptRef.current?.scrollTo({ top: 0, behavior: "auto" });
        }
        if (msg.type === "error") setError(msg.message);
      };
      ws.onclose = () => {
        if (!stopped) {
          if (!connectingBannerTimer) {
            connectingBannerTimer = setTimeout(() => {
              setBackendConnecting(true);
              connectingBannerTimer = null;
            }, 1200);
          }
          retryTimer = setTimeout(connect, 1000);
        }
      };
      ws.onerror = () => ws?.close();
    };

    const poll = setInterval(async () => {
      try {
        const state = await apiGet<DownloadStateResponse>("/asr/download/state");
        setDownloadState(state);
        setNow(Date.now());
        if (autoApplyAfterDownload && pendingApply) {
          const doneTask = state.tasks.find((t) => t.engine === pendingApply.engine && t.model_id === pendingApply.modelId && t.status === "done");
          if (doneTask) {
            const nextSettings = { ...settingsRef.current, asr_engine: pendingApply.engine, model_id: pendingApply.modelId };
            setSettings(nextSettings);
            await apiPutSettings(nextSettings);
            await apiApplyModel(pendingApply.engine, pendingApply.modelId, true);
            await refreshCatalog();
            setPendingApply(null);
            setAutoApplyAfterDownload(false);
          }
        }
      } catch {
        // no-op
      }
    }, 1000);

    connect();
    return () => {
      stopped = true;
      clearInterval(poll);
      if (retryTimer) clearTimeout(retryTimer);
      if (connectingBannerTimer) clearTimeout(connectingBannerTimer);
      ws?.close();
    };
  }, [autoApplyAfterDownload, pendingApply]);

  useEffect(() => {
    if (followState !== "following") return;
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    if (unreadChunks > 0) setUnreadChunks(0);
  }, [transcript, followState, unreadChunks]);

  const activeModels = useMemo(() => {
    if (!catalog) return [] as AsrModelRow[];
    const rows = settings.asr_engine === "whisper" ? catalog.models.whisper : catalog.models.parakeet;
    return filterAndSortModels(rows, modelFilter, sortBy, sortDir, modelFilters);
  }, [catalog, settings.asr_engine, modelFilter, sortBy, sortDir, modelFilters]);

  const activeEngineRows = useMemo(() => {
    if (!catalog) return [] as AsrModelRow[];
    return settings.asr_engine === "whisper" ? catalog.models.whisper : catalog.models.parakeet;
  }, [catalog, settings.asr_engine]);

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

  const toggleFilter = <K extends keyof ModelFilterCriteria>(key: K, value: ModelFilterCriteria[K][number]) => {
    setModelFilters((prev) => {
      const current = prev[key] as Array<typeof value>;
      const next = current.includes(value) ? current.filter((x) => x !== value) : [...current, value];
      return { ...prev, [key]: next };
    });
  };

  useEffect(() => {
    if (!initializedRef.current) return;
    if (prevEngineRef.current === settings.asr_engine) return;
    prevEngineRef.current = settings.asr_engine;
    setModelFilters({ live: [], quality: [], speed: [], size: [], state: [], installed: [] });
    setModelFilter("");
    void safe(async () => {
      await refreshCatalog();
    });
  }, [settings.asr_engine]);

  const elapsedSeconds = (startedAt: number | null | undefined) => (startedAt ? Math.max(0, Math.floor(now / 1000 - startedAt)) : 0);
  const analysisUpdatedLabel = analysisUpdatedAt ? `Updated ${Math.max(0, Math.floor((Date.now() - analysisUpdatedAt) / 1000))}s ago` : "No analysis updates yet";
  const queueAlert =
    (downloadState?.failed_count ?? 0) > 0
      ? "One or more downloads failed. Use Retry on the affected model."
      : downloadState?.tasks.some((t) => t.status === "downloading" && t.progress.bytes_downloaded === 0 && elapsedSeconds(t.started_at) > 20)
        ? "Active download has no progress yet. If this persists, cancel and retry."
        : "";

  const safe = async (fn: () => Promise<void>) => {
    try {
      await fn();
      setError("");
    } catch (e) {
      if (String(e).toLowerCase().includes("core api is temporarily unavailable")) {
        setBackendConnecting(true);
        return;
      }
      setError(String(e));
    }
  };

  const isTransientCoreUnavailable = (value: unknown): boolean =>
    String(value).toLowerCase().includes("core api is temporarily unavailable");

  const reconcileRunningStateAfterTransientError = async (expectedRunning: boolean): Promise<boolean> => {
    try {
      const health = await apiGet<{ status: RuntimeStatus }>("/health");
      setStatus(health.status);
      const matches = !!health.status?.running === expectedRunning;
      if (matches) {
        setOptimisticRunTarget(expectedRunning);
        setOptimisticRunUntil(Date.now() + 2500);
        setError("");
        return true;
      }
    } catch {
      // keep original error path
    }
    return false;
  };

  const onStart = () => safe(async () => {
    if (inFlight !== "none") return;
    setInFlight("starting");
    setTab("live");
    try {
      await apiPost("/transcription/start");
      setOptimisticRunTarget(true);
      setOptimisticRunUntil(Date.now() + 2500);
    } catch (e) {
      if (isTransientCoreUnavailable(e)) {
        const recovered = await reconcileRunningStateAfterTransientError(true);
        if (recovered) return;
      }
      throw e;
    } finally {
      setInFlight("none");
    }
  });

  const onStop = () => safe(async () => {
    if (inFlight !== "none") return;
    setInFlight("stopping");
    try {
      await apiPost("/transcription/stop");
      setOptimisticRunTarget(false);
      setOptimisticRunUntil(Date.now() + 2500);
    } catch (e) {
      if (isTransientCoreUnavailable(e)) {
        const recovered = await reconcileRunningStateAfterTransientError(false);
        if (recovered) return;
      }
      throw e;
    } finally {
      setInFlight("none");
    }
  });

  const onTranscriptScroll = (ev: UIEvent<HTMLDivElement>) => {
    const el = ev.currentTarget;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setFollowState(nearBottom ? "following" : "paused");
  };

  const applyModelDirect = async (modelId: string) => {
    // Backend /asr/apply persists runtime settings atomically.
    await apiApplyModel(settings.asr_engine, modelId, true);
    const persistedSettings = await apiGet<RuntimeSettings>("/settings");
    setSettings(persistedSettings);
    await refreshCatalog();
    setTab("live");
  };

  const clearTranscript = async () => {
    await apiPost("/transcript/clear");
    setTranscript("");
    setAnalysis("");
    setAnalysisUpdatedAt(null);
    setUnreadChunks(0);
    setFollowState("following");
    transcriptRef.current?.scrollTo({ top: 0, behavior: "auto" });
  };

  const warmupWithRetry = async () => {
    try {
      const r = await apiWarmupModel();
      setWarmupInfo(`Warmup done in ${r.elapsed_ms} ms`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 900));
      const r = await apiWarmupModel();
      setWarmupInfo(`Warmup done in ${r.elapsed_ms} ms`);
    }
  };

  return (
    <div className="page page-fill">
      <header className="hero sticky-header">
        <div className="hero-brand">
          <div className="hero-mark" aria-hidden="true">
            <Mic size={28} />
          </div>
          <div className="hero-copy">
            <h1 className="hero-title">EchoPilot</h1>
            <p className="hero-subtitle">Live computer-audio transcription & AI analysis</p>
          </div>
        </div>
        <SessionControls
          sessionState={sessionState}
          clearTranscriptOnStart={settings.clear_transcript_on_start}
          onToggleClearTranscriptOnStart={(checked) => setSettings({ ...settings, clear_transcript_on_start: checked })}
          stopCheckboxGapPx={0}
          onStart={onStart}
          onStop={onStop}
        />
      </header>

      <RuntimeStatusStrip
        status={status}
        settingsModelId={settings.model_id}
        settingsEngine={settings.asr_engine}
        backendConnecting={backendConnecting}
        sessionState={sessionState}
      />

      <nav className="tabs">
        {APP_TABS.map((item) => (
          <button key={item.key} type="button" className={`tab ${tab === item.key ? "active" : ""}`} onClick={() => setTab(item.key)}>
            <item.icon size={16} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="workspace-shell">
        <div className="workspace-alerts">
          {error ? <div className="error">{error}</div> : null}
          {backendConnecting ? <div className="warning">Reconnecting to core backend...</div> : null}
          {status?.fallback_reason ? <div className="warning">CUDA fallback active: {status.fallback_reason}</div> : null}
          {queueAlert ? <div className="warning">{queueAlert}</div> : null}
        </div>

        <main className="workspace-content">
          {tab === "live" ? (
            <section className="live-grid live-fill">
              <LiveTranscriptPane
                text={displayedTranscript}
                followState={followState}
                unreadCount={unreadChunks}
                preRef={transcriptRef}
                onScroll={onTranscriptScroll}
                onClearTranscript={() => safe(clearTranscript)}
                onJumpToLatest={() => {
                  setFollowState("following");
                  setUnreadChunks(0);
                  transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
                }}
              />
              <AnalysisPane
                analysisText={analysis || (settings.ai_enabled ? "No analysis yet." : "AI analysis is disabled in AI tab.")}
                readinessState={aiReadiness.state}
                readinessMessage={aiReadiness.message}
                updatedLabel={analysisUpdatedLabel}
                analysisStateLabel={analysisStateLabel}
                canAnalyzeNow={analyzeEnabled}
                autoAnalysisEnabled={settings.auto_analysis_enabled}
                onToggleAutoAnalysis={(checked) => setSettings({ ...settings, auto_analysis_enabled: checked })}
                onAnalyzeNow={() => safe(async () => {
                  setAnalysis((await apiPost<{ analysis: string }>("/analysis/now")).analysis);
                  setAnalysisUpdatedAt(Date.now());
                })}
                onOpenAiTab={() => setTab("ai")}
              />
            </section>
          ) : null}

          {tab === "ai" ? (
            <section className="panel tab-panel ai-tab-panel">
              <div className="panel-head">
                <h2>AI Configuration</h2>
                <AiReadinessCard readinessState={aiReadiness.state} readinessMessage={aiReadiness.message} statusLabel={aiReadiness.state === "ready" ? "Configured" : "Needs setup"} />
              </div>
              <div className="form-grid ai-form-grid">
                <label>Enable AI analysis<select value={settings.ai_enabled ? "yes" : "no"} onChange={(e) => setSettings({ ...settings, ai_enabled: e.target.value === "yes" })}><option value="yes">Enabled</option><option value="no">Disabled</option></select></label>
                <label>Base URL<input value={settings.base_url} onChange={(e) => setSettings({ ...settings, base_url: e.target.value })} /></label>
                <label>Model Name
                  <select value={settings.llm_model} onChange={(e) => setSettings({ ...settings, llm_model: e.target.value })}>
                    {AI_MODEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>Periodic Analysis (s)<input type="number" min={0} max={600} value={settings.analysis_interval_seconds} onChange={(e) => setSettings({ ...settings, analysis_interval_seconds: Number(e.target.value) })} /></label>
                <label className="wide">Analysis Prompt<textarea value={settings.prompt} onChange={(e) => setSettings({ ...settings, prompt: e.target.value })} /></label>
                <label className="wide">API Key (stored in Windows Credential Manager)<input type="text" value={apiKeyEdited ? apiKey : (apiKey || apiKeyHint)} onFocus={() => { if (apiKeyHint && !apiKeyEdited) setApiKeyEdited(true); }} onChange={(e) => { if (!apiKeyEdited) setApiKeyEdited(true); setApiKey(e.target.value); }} /></label>
                <div className="wide muted ai-help-line">Lower periodic values increase API usage and UI churn.</div>
                <div className="row wide"><button className="btn" onClick={() => safe(async () => { const nextApiKey = apiKey.trim(); if (!nextApiKey) return; await apiPost("/llm/credentials", { api_key: nextApiKey }); const credentials = await apiGet<{ configured: boolean; masked?: string | null }>("/llm/credentials/status"); setAiKeyConfigured(!!credentials.configured); setApiKeyHint((credentials.masked ?? "").trim()); setApiKey(""); setApiKeyEdited(false); })}>Save API Key</button></div>
              </div>
            </section>
          ) : null}

          {tab === "models" ? (
            <section className="panel tab-panel models-tab-panel">
              <div className="models-inline-status">
                <span className="muted">Runtime:</span>
                <strong>{status?.model ?? "unknown"}</strong>
                <span className="muted">({status?.backend_asr ?? "-"})</span>
                <span className="models-sep">|</span>
                <span className="muted">Selected:</span>
                <strong>{settings.model_id || "none"}</strong>
                <span className="muted">({settings.asr_engine})</span>
              </div>
              <div className="queue-summary">
                <span className="badge badge-soft">active: {downloadState?.active_task_id ?? "none"}</span>
                <span className="badge badge-soft">queued: {downloadState?.queued_count ?? 0}</span>
                <span className="badge badge-soft">done: {downloadState?.completed_count ?? 0}</span>
                <span className={`badge ${(downloadState?.failed_count ?? 0) > 0 ? "badge-primary" : "badge-soft"}`}>failed: {downloadState?.failed_count ?? 0}</span>
                <span className="badge badge-soft">global: {downloadState?.aggregate_percent?.toFixed(1) ?? "0.0"}%</span>
              </div>

              <div className="models-toolbar">
                <div className="models-toolbar-main row">
                  <select
                    value={settings.asr_engine}
                    onChange={(e) => {
                      const engine = e.target.value as "whisper" | "parakeet";
                      const nextSettings = { ...settings, asr_engine: engine };
                      setSettings(nextSettings);
                      setModelFilters({ live: [], quality: [], speed: [], size: [], state: [], installed: [] });
                      setModelFilter("");
                      void safe(async () => {
                        await apiPutSettings(nextSettings);
                      });
                      void safe(async () => {
                        await refreshCatalog();
                      });
                    }}
                  >
                    <option value="whisper">Whisper</option>
                    <option value="parakeet">Parakeet</option>
                  </select>
                  <input value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} placeholder="Filter model id..." />
                </div>
                <div className="models-filter-dropdowns row">
                  <details className="filter-dropdown">
                    <summary>Live suitability ({modelFilters.live.length})</summary>
                    <div className="models-filter-options">
                      {filterOptions.live.map((v) => (
                        <label key={`live-${v}`} className="inline-check">
                          <input type="checkbox" checked={modelFilters.live.includes(v)} onChange={() => toggleFilter("live", v)} />
                          {v}
                        </label>
                      ))}
                    </div>
                  </details>
                  <details className="filter-dropdown">
                    <summary>Quality ({modelFilters.quality.length})</summary>
                    <div className="models-filter-options">
                      {filterOptions.quality.map((v) => (
                        <label key={`quality-${v}`} className="inline-check">
                          <input type="checkbox" checked={modelFilters.quality.includes(v)} onChange={() => toggleFilter("quality", v)} />
                          {v}
                        </label>
                      ))}
                    </div>
                  </details>
                  <details className="filter-dropdown">
                    <summary>Speed ({modelFilters.speed.length})</summary>
                    <div className="models-filter-options">
                      {filterOptions.speed.map((v) => (
                        <label key={`speed-${v}`} className="inline-check">
                          <input type="checkbox" checked={modelFilters.speed.includes(v)} onChange={() => toggleFilter("speed", v)} />
                          {v}
                        </label>
                      ))}
                    </div>
                  </details>
                  <details className="filter-dropdown">
                    <summary>Size ({modelFilters.size.length})</summary>
                    <div className="models-filter-options">
                      {filterOptions.size.map((v) => (
                        <label key={`size-${v}`} className="inline-check">
                          <input type="checkbox" checked={modelFilters.size.includes(v)} onChange={() => toggleFilter("size", v)} />
                          {v}
                        </label>
                      ))}
                    </div>
                  </details>
                  <details className="filter-dropdown">
                    <summary>State ({modelFilters.state.length})</summary>
                    <div className="models-filter-options">
                      {filterOptions.state.map((v) => (
                        <label key={`state-${v}`} className="inline-check">
                          <input type="checkbox" checked={modelFilters.state.includes(v)} onChange={() => toggleFilter("state", v)} />
                          {v}
                        </label>
                      ))}
                    </div>
                  </details>
                  <details className="filter-dropdown">
                    <summary>Installed ({modelFilters.installed.length})</summary>
                    <div className="models-filter-options">
                      {(["yes", "no"] as const).map((v) => (
                        <label key={`installed-${v}`} className="inline-check">
                          <input type="checkbox" checked={modelFilters.installed.includes(v)} onChange={() => toggleFilter("installed", v)} />
                          {v}
                        </label>
                      ))}
                    </div>
                  </details>
                  <details className="filter-dropdown advanced-sort">
                    <summary>Advanced sort</summary>
                    <div className="models-filter-options">
                      <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}><option value="downloads">downloads</option><option value="speed">speed</option><option value="quality">quality</option><option value="live">live suitability</option><option value="size">model size</option><option value="installed">installed</option><option value="name">name</option></select>
                      <select value={sortDir} onChange={(e) => setSortDir(e.target.value as SortDir)}><option value="desc">desc</option><option value="asc">asc</option></select>
                    </div>
                  </details>
                </div>
                <div className="models-toolbar-actions row">
                  <button className="btn" onClick={() => safe(async () => { await apiPutSettings(settings); await refreshCatalog(); })}>Select Model</button>
                  <button className="btn primary" onClick={() => safe(async () => { await applyModelDirect(settings.model_id); })}>Apply to Runtime</button>
                  <label className="inline-check"><input type="checkbox" checked={autoApplyAfterDownload} onChange={(e) => setAutoApplyAfterDownload(e.target.checked)} />Auto-apply after download</label>
                  <button className="btn btn-quiet" onClick={() => safe(refreshCatalog)}>Refresh</button>
                  <button className="btn btn-quiet" onClick={() => safe(warmupWithRetry)}>Warmup</button>
                  <button className="btn btn-quiet" onClick={() => setModelFilters({ live: [], quality: [], speed: [], size: [], state: [], installed: [] })}>Clear filters</button>
                </div>
              </div>
              {warmupInfo ? <div className="muted" style={{ marginBottom: 10 }}>{warmupInfo}</div> : null}

              <div className="model-list">
                {activeModels.length === 0 ? (
                  <div className="model-empty">
                    <strong>No models match current filters.</strong>
                    <span className="muted">Try clearing filters or switching engine.</span>
                    <button className="btn btn-quiet" onClick={() => setModelFilters({ live: [], quality: [], speed: [], size: [], state: [], installed: [] })}>Clear filters</button>
                  </div>
                ) : null}
                {activeModels.slice(0, 200).map((model) => {
                  const isSelected = model.id === settings.model_id || model.is_selected;
                  const isRuntimeModel = (status?.model ?? "") === model.id;
                  return (
                    <ModelRow
                      key={model.id}
                      model={model}
                      isSelected={isSelected}
                      isRuntimeModel={isRuntimeModel}
                      elapsedSeconds={elapsedSeconds(model.task_timestamps?.started_at)}
                      canUse={model.availability === "ready" && !isSelected}
                      bytes={bytes}
                      onUse={(modelId) => safe(async () => { await applyModelDirect(modelId); })}
                      onDownload={(modelId) => safe(async () => { await apiDownloadModel(settings.asr_engine, modelId); if (autoApplyAfterDownload) setPendingApply({ engine: settings.asr_engine, modelId }); await refreshCatalog(); })}
                      onCancel={(taskId) => safe(async () => { await apiCancelDownload(taskId); await refreshCatalog(); })}
                      onRetry={(taskId) => safe(async () => { await apiRetryDownload(taskId); await refreshCatalog(); })}
                    />
                  );
                })}
              </div>
            </section>
          ) : null}

          {tab === "settings" ? (
            <section className="panel tab-panel settings-tab-panel">
              <div className="panel-head">
                <h2>Runtime Settings</h2>
                <span className="badge badge-soft">Auto-saved</span>
              </div>
              <div className="settings-grid">
                <div className="settings-card">
                  <div className="settings-card-head">
                    <strong>Capture</strong>
                    <span className="muted">Adjust language and chunking for transcription flow.</span>
                  </div>
                  <div className="form-grid">
                    <label>Language<select value={settings.language} onChange={(e) => setSettings({ ...settings, language: e.target.value })}><option value="en">English</option><option value="pt">Portuguese</option><option value="es">Spanish</option><option value="fr">French</option><option value="de">German</option></select></label>
                    <label>Chunk Seconds<input type="number" min={1} max={10} step={0.5} value={settings.chunk_seconds} onChange={(e) => setSettings({ ...settings, chunk_seconds: Number(e.target.value) })} /></label>
                    <div className="row wide"><button className="btn" onClick={() => safe(async () => { await apiPutSettings(settings); await refreshCatalog(); })}>Save Runtime Settings</button></div>
                  </div>
                </div>
                <div className="settings-card">
                  <div className="settings-card-head">
                    <strong>Diagnostics</strong>
                    <span className="muted">Backend state, capture, and model health.</span>
                  </div>
                  <div className="status-grid settings-stat-grid">
                    <div className="stat"><span>ASR Backend</span><strong>{status?.backend_asr ?? "-"}</strong></div>
                    <div className="stat"><span>Capture Device</span><strong>{status?.capture_device ?? "-"}</strong></div>
                    <div className="stat"><span>Model</span><strong>{status?.model ?? "-"}</strong></div>
                    <div className="stat"><span>Latency</span><strong>{status?.avg_chunk_latency_ms ?? 0} ms</strong></div>
                    <div className="stat"><span>CUDA</span><strong>{status?.cuda_active ? "active" : "inactive"}</strong></div>
                    <div className="stat"><span>Fallback</span><strong>{status?.fallback_reason ?? "none"}</strong></div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </main>
        <footer className="app-footer">
          <div className="footer-item">EchoPilot v{APP_VERSION}</div>
          <div className="footer-item">Local processing only</div>
          <div className="footer-item">Your data stays on this device</div>
        </footer>
      </div>
    </div>
  );
}
