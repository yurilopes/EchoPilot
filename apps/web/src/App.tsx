import { useEffect, useMemo, useRef, useState } from "react";
import type { UIEvent } from "react";
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
import { filterAndSortModels, type SortBy, type SortDir } from "./modelCatalog";
import type { AsrModelRow, CatalogResponse, DownloadStateResponse, RuntimeSettings, RuntimeStatus, TabKey, TranscriptFollowState } from "./types";
import { canAnalyzeNow, deriveAiReadiness, deriveSessionState } from "./uiState";

const DEFAULT_SETTINGS: RuntimeSettings = {
  language: "en",
  asr_engine: "whisper",
  model_id: "base",
  ai_enabled: true,
  chunk_seconds: 2,
  analysis_interval_seconds: 0,
  base_url: "https://api.deepseek.com",
  llm_model: "deepseek-chat",
  prompt: "Summarize key points and action items from this transcript.",
};

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
  const [error, setError] = useState("");
  const [backendConnecting, setBackendConnecting] = useState(false);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadStateResponse | null>(null);
  const [modelFilter, setModelFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("live");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pendingApply, setPendingApply] = useState<{ engine: "whisper" | "parakeet"; modelId: string } | null>(null);
  const [autoApplyAfterDownload, setAutoApplyAfterDownload] = useState(false);
  const [warmupInfo, setWarmupInfo] = useState("");
  const [now, setNow] = useState(Date.now());
  const [inFlight, setInFlight] = useState<"none" | "starting" | "stopping">("none");
  const [followState, setFollowState] = useState<TranscriptFollowState>("following");
  const [unreadChunks, setUnreadChunks] = useState(0);
  const [analysisUpdatedAt, setAnalysisUpdatedAt] = useState<number | null>(null);
  const [optimisticRunTarget, setOptimisticRunTarget] = useState<boolean | null>(null);
  const [optimisticRunUntil, setOptimisticRunUntil] = useState<number>(0);
  const [expandedModelIds, setExpandedModelIds] = useState<Set<string>>(new Set());
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const followStateRef = useRef<TranscriptFollowState>("following");
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

  const aiReadiness = deriveAiReadiness(settings, status);
  const hasOptimisticRun = optimisticRunTarget !== null && nowMs < optimisticRunUntil;
  const effectiveRunning = hasOptimisticRun ? optimisticRunTarget : (status?.running ?? false);
  const sessionState = deriveSessionState({ ...(status ?? ({} as RuntimeStatus)), running: effectiveRunning }, inFlight, !!error);
  const analyzeEnabled = canAnalyzeNow(aiReadiness.state, transcript);
  const displayedTranscript = normalizeTranscriptChunk(transcript);

  useEffect(() => {
    followStateRef.current = followState;
  }, [followState]);

  useEffect(() => {
    apiGet<RuntimeSettings>("/settings")
      .then(setSettings)
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
            const nextSettings = { ...settings, asr_engine: pendingApply.engine, model_id: pendingApply.modelId };
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
  }, [autoApplyAfterDownload, pendingApply, settings]);

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
    return filterAndSortModels(rows, modelFilter, sortBy, sortDir);
  }, [catalog, settings.asr_engine, modelFilter, sortBy, sortDir]);

  useEffect(() => {
    setExpandedModelIds((prev) => {
      const next = new Set(prev);
      for (const model of activeModels) {
        if (model.download_state === "downloading" || model.download_state === "queued" || model.download_state === "error") {
          next.add(model.id);
        }
      }
      return next;
    });
  }, [activeModels]);

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
    const nextSettings = { ...settings, model_id: modelId };
    setSettings(nextSettings);
    await apiPutSettings(nextSettings);
    await apiApplyModel(nextSettings.asr_engine, modelId, true);
    await refreshCatalog();
    setTab("live");
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
        <div>
          <p className="label">EchoPilot</p>
          <h1>Live-first workspace</h1>
          <p className="muted">{aiReadiness.state === "ready" ? "AI analysis enabled" : "AI needs setup"}</p>
        </div>
        <SessionControls
          sessionState={sessionState}
          canAnalyze={analyzeEnabled}
          onStart={onStart}
          onStop={onStop}
          onAnalyze={() => safe(async () => {
            setAnalysis((await apiPost<{ analysis: string }>("/analysis/now")).analysis);
            setAnalysisUpdatedAt(Date.now());
          })}
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
        {["live", "ai", "models", "settings"].map((item) => (
          <button key={item} className={`tab ${tab === item ? "active" : ""}`} onClick={() => setTab(item as TabKey)}>{item[0].toUpperCase() + item.slice(1)}</button>
        ))}
      </nav>

      {error ? <div className="error">{error}</div> : null}
      {backendConnecting ? <div className="warning">Reconnecting to core backend...</div> : null}
      {status?.fallback_reason ? <div className="warning">CUDA fallback active: {status.fallback_reason}</div> : null}
      {queueAlert ? <div className="warning">{queueAlert}</div> : null}

      {tab === "live" ? (
        <section className="live-grid live-fill">
          <LiveTranscriptPane
            text={displayedTranscript}
            followState={followState}
            unreadCount={unreadChunks}
            preRef={transcriptRef}
            onScroll={onTranscriptScroll}
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
            onOpenAiTab={() => setTab("ai")}
          />
        </section>
      ) : null}

      {tab === "ai" ? (
        <section className="panel">
          <h2>AI Configuration</h2>
          <AiReadinessCard readinessState={aiReadiness.state} readinessMessage={aiReadiness.message} statusLabel={aiReadiness.state === "ready" ? "Configured" : "Needs setup"} />
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label>Enable AI analysis<select value={settings.ai_enabled ? "yes" : "no"} onChange={(e) => setSettings({ ...settings, ai_enabled: e.target.value === "yes" })}><option value="yes">Enabled</option><option value="no">Disabled</option></select></label>
            <label>Base URL<input value={settings.base_url} onChange={(e) => setSettings({ ...settings, base_url: e.target.value })} /></label>
            <label>Model Name<input value={settings.llm_model} onChange={(e) => setSettings({ ...settings, llm_model: e.target.value })} /></label>
            <label>Periodic Analysis (s)<input type="number" min={0} max={600} value={settings.analysis_interval_seconds} onChange={(e) => setSettings({ ...settings, analysis_interval_seconds: Number(e.target.value) })} /><span className="muted">Lower values increase API usage and UI churn.</span></label>
            <label className="wide">Analysis Prompt<textarea value={settings.prompt} onChange={(e) => setSettings({ ...settings, prompt: e.target.value })} /></label>
            <label className="wide">API Key (stored in Windows Credential Manager)<input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} /></label>
            <div className="row wide"><button className="btn" onClick={() => safe(async () => { await apiPutSettings(settings); await refreshCatalog(); })}>Save AI Settings</button><button className="btn" onClick={() => safe(async () => { await apiPost("/llm/credentials", { api_key: apiKey }); setApiKey(""); })}>Save API Key</button></div>
          </div>
        </section>
      ) : null}

      {tab === "models" ? (
        <section className="panel">
          <h2>ASR Model Manager</h2>
          <div className="selected-model"><span className="muted">Current runtime model</span><strong>{status?.model ?? "unknown"}</strong><span className="muted">engine: {status?.backend_asr ?? "-"}</span></div>
          <div className="selected-model"><span className="muted">Selected pending model</span><strong>{settings.model_id || "none"}</strong><span className="muted">engine: {settings.asr_engine}</span></div>
          <div className="queue-summary">
            <span className="badge badge-soft">active: {downloadState?.active_task_id ?? "none"}</span>
            <span className="badge badge-soft">queued: {downloadState?.queued_count ?? 0}</span>
            <span className="badge badge-soft">done: {downloadState?.completed_count ?? 0}</span>
            <span className={`badge ${(downloadState?.failed_count ?? 0) > 0 ? "badge-primary" : "badge-soft"}`}>failed: {downloadState?.failed_count ?? 0}</span>
            <span className="badge badge-soft">global: {downloadState?.aggregate_percent?.toFixed(1) ?? "0.0"}%</span>
          </div>

          <div className="models-toolbar">
            <div className="models-toolbar-main row">
              <select value={settings.asr_engine} onChange={(e) => setSettings({ ...settings, asr_engine: e.target.value as "whisper" | "parakeet" })}><option value="whisper">Whisper</option><option value="parakeet">Parakeet</option></select>
              <input value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} placeholder="Filter model id..." />
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}><option value="downloads">Sort: downloads</option><option value="speed">Sort: speed</option><option value="quality">Sort: quality</option><option value="live">Sort: live suitability</option><option value="size">Sort: model size</option><option value="installed">Sort: installed</option><option value="name">Sort: name</option></select>
              <select value={sortDir} onChange={(e) => setSortDir(e.target.value as SortDir)}><option value="desc">Order: desc</option><option value="asc">Order: asc</option></select>
            </div>
            <div className="models-toolbar-actions row">
              <button className="btn" onClick={() => safe(async () => { await apiPutSettings(settings); await refreshCatalog(); })}>Select Model</button>
              <button className="btn primary" onClick={() => safe(async () => { await applyModelDirect(settings.model_id); })}>Apply to Runtime</button>
              <label className="inline-check"><input type="checkbox" checked={autoApplyAfterDownload} onChange={(e) => setAutoApplyAfterDownload(e.target.checked)} />Auto-apply after download</label>
              <button className="btn btn-quiet" onClick={() => safe(refreshCatalog)}>Refresh</button>
              <button className="btn btn-quiet" onClick={() => safe(warmupWithRetry)}>Warmup</button>
            </div>
          </div>
          {warmupInfo ? <div className="muted" style={{ marginBottom: 10 }}>{warmupInfo}</div> : null}

          <div className="model-list">
            {activeModels.slice(0, 200).map((model) => {
              const isSelected = model.id === settings.model_id || model.is_selected;
              const isRuntimeModel = (status?.model ?? "") === model.id;
              const isExpanded = expandedModelIds.has(model.id);
              return (
                <ModelRow
                  key={model.id}
                  model={model}
                  isSelected={isSelected}
                  isRuntimeModel={isRuntimeModel}
                  isExpanded={isExpanded}
                  elapsedSeconds={elapsedSeconds(model.task_timestamps?.started_at)}
                  canUse={model.availability === "ready" && !isSelected}
                  bytes={bytes}
                  onUse={(modelId) => safe(async () => { await applyModelDirect(modelId); })}
                  onDownload={(modelId) => safe(async () => { await apiDownloadModel(settings.asr_engine, modelId); if (autoApplyAfterDownload) setPendingApply({ engine: settings.asr_engine, modelId }); await refreshCatalog(); })}
                  onCancel={(taskId) => safe(async () => { await apiCancelDownload(taskId); await refreshCatalog(); })}
                  onRetry={(taskId) => safe(async () => { await apiRetryDownload(taskId); await refreshCatalog(); })}
                  onToggleExpanded={() => setExpandedModelIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(model.id)) next.delete(model.id);
                    else next.add(model.id);
                    return next;
                  })}
                />
              );
            })}
          </div>
        </section>
      ) : null}

      {tab === "settings" ? (
        <section className="panel">
          <h2>Runtime Settings</h2>
          <div className="form-grid">
            <label>Language<select value={settings.language} onChange={(e) => setSettings({ ...settings, language: e.target.value })}><option value="en">English</option><option value="pt">Portuguese</option><option value="es">Spanish</option><option value="fr">French</option><option value="de">German</option></select></label>
            <label>Chunk Seconds<input type="number" min={1} max={10} step={0.5} value={settings.chunk_seconds} onChange={(e) => setSettings({ ...settings, chunk_seconds: Number(e.target.value) })} /></label>
            <div className="row wide"><button className="btn" onClick={() => safe(async () => { await apiPutSettings(settings); await refreshCatalog(); })}>Save Runtime Settings</button></div>
          </div>
          <details style={{ marginTop: 12 }}>
            <summary className="muted">Show diagnostics</summary>
            <div className="status-grid" style={{ marginTop: 12 }}>
              <div className="stat"><span>ASR Backend</span><strong>{status?.backend_asr ?? "-"}</strong></div>
              <div className="stat"><span>Capture Device</span><strong>{status?.capture_device ?? "-"}</strong></div>
              <div className="stat"><span>Model</span><strong>{status?.model ?? "-"}</strong></div>
              <div className="stat"><span>Latency</span><strong>{status?.avg_chunk_latency_ms ?? 0} ms</strong></div>
              <div className="stat"><span>CUDA</span><strong>{status?.cuda_active ? "active" : "inactive"}</strong></div>
              <div className="stat"><span>Fallback</span><strong>{status?.fallback_reason ?? "none"}</strong></div>
            </div>
          </details>
        </section>
      ) : null}
    </div>
  );
}
