import { useEffect, useMemo, useState } from "react";
import { Play, Sparkles, Square } from "lucide-react";
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
import { ModelRow } from "./components/ModelRow";
import { filterAndSortModels, type SortBy, type SortDir } from "./modelCatalog";
import type { AsrModelRow, CatalogResponse, DownloadStateResponse, RuntimeSettings, RuntimeStatus, TabKey } from "./types";

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
  const [sortBy, setSortBy] = useState<SortBy>("downloads");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [pendingApply, setPendingApply] = useState<{ engine: "whisper" | "parakeet"; modelId: string } | null>(null);
  const [autoApplyAfterDownload, setAutoApplyAfterDownload] = useState(false);
  const [warmupInfo, setWarmupInfo] = useState("");
  const [now, setNow] = useState(Date.now());

  const refreshCatalog = async () => setCatalog(await apiGet<CatalogResponse>("/asr/catalog"));

  useEffect(() => {
    apiGet<RuntimeSettings>("/settings").then(setSettings).catch((e) => setError(String(e)));
    apiGet<{ status: RuntimeStatus }>("/health").then((x) => setStatus(x.status)).catch((e) => setError(String(e)));
    apiGet<{ text: string }>("/transcript").then((x) => setTranscript(x.text)).catch(() => undefined);
    refreshCatalog().catch((e) => setError(String(e)));

    let stopped = false;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let connectingBannerTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stopped) return;
      ws = new WebSocket(socketUrl());
      ws.onopen = () => {
        setBackendConnecting(false);
        setError("");
        if (connectingBannerTimer) {
          clearTimeout(connectingBannerTimer);
          connectingBannerTimer = null;
        }
      };
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "status") setStatus(msg.data as RuntimeStatus);
        if (msg.type === "transcript") setTranscript((prev) => `${prev}${prev ? "\n" : ""}${msg.text}`);
        if (msg.type === "analysis") setAnalysis(msg.text);
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

  const activeModels = useMemo(() => {
    if (!catalog) return [] as AsrModelRow[];
    const rows = settings.asr_engine === "whisper" ? catalog.models.whisper : catalog.models.parakeet;
    return filterAndSortModels(rows, modelFilter, sortBy, sortDir);
  }, [catalog, settings.asr_engine, modelFilter, sortBy, sortDir]);

  const elapsedSeconds = (startedAt: number | null | undefined) => (startedAt ? Math.max(0, Math.floor(now / 1000 - startedAt)) : 0);
  const liveStatusChip = settings.ai_enabled ? "AI analysis enabled" : "AI analysis disabled";
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
      setError(String(e));
    }
  };

  return (
    <div className="page">
      <header className="hero sticky-header">
        <div><p className="label">Realtime System Transcriber</p><h1>Live-first workspace</h1><p className="muted">{liveStatusChip}</p></div>
        <div className="row">
          <button className="btn primary" onClick={() => safe(() => apiPost("/transcription/start"))}><Play size={16} /> Start</button>
          <button className="btn" onClick={() => safe(() => apiPost("/transcription/stop"))}><Square size={16} /> Stop</button>
          <button className="btn accent" onClick={() => safe(async () => setAnalysis((await apiPost<{ analysis: string }>("/analysis/now")).analysis))} disabled={!settings.ai_enabled}><Sparkles size={16} /> Analyze Now</button>
        </div>
      </header>

      <nav className="tabs">
        {["live", "ai", "models", "settings"].map((item) => (
          <button key={item} className={`tab ${tab === item ? "active" : ""}`} onClick={() => setTab(item as TabKey)}>{item[0].toUpperCase() + item.slice(1)}</button>
        ))}
      </nav>

      {showRestartConfirm ? <div className="modal-backdrop"><div className="modal"><h3>Restart required</h3><p>Applying this model now will restart live capture/transcription. Continue?</p><div className="row"><button className="btn" onClick={() => setShowRestartConfirm(false)}>Cancel</button><button className="btn primary" onClick={() => safe(async () => { const payload = pendingApply ?? { engine: settings.asr_engine, modelId: settings.model_id }; await apiApplyModel(payload.engine, payload.modelId, true); await refreshCatalog(); setShowRestartConfirm(false); setPendingApply(null); })}>Apply and Restart</button></div></div></div> : null}
      {error ? <div className="error">{error}</div> : null}
      {backendConnecting ? <div className="warning">Reconnecting to core backend...</div> : null}
      {status?.fallback_reason ? <div className="warning">CUDA fallback active: {status.fallback_reason}</div> : null}
      {queueAlert ? <div className="warning">{queueAlert}</div> : null}

      {tab === "live" ? <section className="live-grid"><article className="panel transcript-panel"><h2>Live Transcript</h2><pre>{transcript || "No transcript yet."}</pre></article><article className="panel analysis-panel"><h2>AI Analysis</h2><pre>{analysis || (settings.ai_enabled ? "No analysis yet." : "AI analysis is disabled in AI tab.")}</pre></article></section> : null}

      {tab === "ai" ? <section className="panel"><h2>AI Configuration</h2><div className="form-grid"><label>Enable AI analysis<select value={settings.ai_enabled ? "yes" : "no"} onChange={(e) => setSettings({ ...settings, ai_enabled: e.target.value === "yes" })}><option value="yes">Enabled</option><option value="no">Disabled</option></select></label><label>Base URL<input value={settings.base_url} onChange={(e) => setSettings({ ...settings, base_url: e.target.value })} /></label><label>Model Name<input value={settings.llm_model} onChange={(e) => setSettings({ ...settings, llm_model: e.target.value })} /></label><label>Periodic Analysis (s)<input type="number" min={0} max={600} value={settings.analysis_interval_seconds} onChange={(e) => setSettings({ ...settings, analysis_interval_seconds: Number(e.target.value) })} /></label><label className="wide">Analysis Prompt<textarea value={settings.prompt} onChange={(e) => setSettings({ ...settings, prompt: e.target.value })} /></label><label className="wide">API Key (stored in Windows Credential Manager)<input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} /></label><div className="row wide"><button className="btn" onClick={() => safe(async () => { await apiPutSettings(settings); await refreshCatalog(); })}>Save AI Settings</button><button className="btn" onClick={() => safe(async () => { await apiPost("/llm/credentials", { api_key: apiKey }); setApiKey(""); })}>Save API Key</button></div></div></section> : null}

      {tab === "models" ? <section className="panel"><h2>ASR Model Manager</h2><div className="selected-model"><span className="muted">Currently selected model</span><strong>{settings.model_id || "none"}</strong><span className="muted">engine: {settings.asr_engine}</span></div><div className="queue-summary"><span>active: {downloadState?.active_task_id ?? "none"}</span><span>queued: {downloadState?.queued_count ?? 0}</span><span>done: {downloadState?.completed_count ?? 0}</span><span>failed: {downloadState?.failed_count ?? 0}</span><span>global: {downloadState?.aggregate_percent?.toFixed(1) ?? "0.0"}%</span></div><div className="row" style={{ marginBottom: 12 }}><select value={settings.asr_engine} onChange={(e) => setSettings({ ...settings, asr_engine: e.target.value as "whisper" | "parakeet" })}><option value="whisper">Whisper</option><option value="parakeet">Parakeet</option></select><input value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} placeholder="Filter model id..." /><select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}><option value="downloads">Sort: downloads</option><option value="speed">Sort: speed</option><option value="quality">Sort: quality</option><option value="live">Sort: live suitability</option><option value="size">Sort: model size</option><option value="installed">Sort: installed</option><option value="name">Sort: name</option></select><select value={sortDir} onChange={(e) => setSortDir(e.target.value as SortDir)}><option value="desc">Order: desc</option><option value="asc">Order: asc</option></select><button className="btn" onClick={() => safe(refreshCatalog)}>Refresh Catalog</button><button className="btn" onClick={() => safe(async () => { await apiPutSettings(settings); await refreshCatalog(); })}>Save Selected Model</button><button className="btn primary" onClick={() => safe(async () => { if (status?.running) { setPendingApply({ engine: settings.asr_engine, modelId: settings.model_id }); setShowRestartConfirm(true); return; } await apiApplyModel(settings.asr_engine, settings.model_id, true); await refreshCatalog(); })}>Apply Model Now</button><button className="btn" onClick={() => safe(async () => { const r = await apiWarmupModel(); setWarmupInfo(`Warmup done in ${r.elapsed_ms} ms`); })}>Warmup Model</button><label className="inline-check"><input type="checkbox" checked={autoApplyAfterDownload} onChange={(e) => setAutoApplyAfterDownload(e.target.checked)} />Auto-apply after download</label></div>{warmupInfo ? <div className="muted" style={{ marginBottom: 10 }}>{warmupInfo}</div> : null}<div className="model-list">{activeModels.slice(0, 200).map((model) => { const isSelected = model.id === settings.model_id || model.is_selected; return <ModelRow key={model.id} model={model} isSelected={isSelected} elapsedSeconds={elapsedSeconds(model.task_timestamps?.started_at)} canUse={model.availability === "ready" && !isSelected} showUse={!isSelected} bytes={bytes} onUse={(modelId) => setSettings({ ...settings, model_id: modelId })} onDownload={(modelId) => safe(async () => { await apiDownloadModel(settings.asr_engine, modelId); if (autoApplyAfterDownload) setPendingApply({ engine: settings.asr_engine, modelId }); await refreshCatalog(); })} onCancel={(taskId) => safe(async () => { await apiCancelDownload(taskId); await refreshCatalog(); })} onRetry={(taskId) => safe(async () => { await apiRetryDownload(taskId); await refreshCatalog(); })} />; })}</div></section> : null}

      {tab === "settings" ? <section className="panel"><h2>Runtime Settings</h2><div className="form-grid"><label>Language<select value={settings.language} onChange={(e) => setSettings({ ...settings, language: e.target.value })}><option value="en">English</option><option value="pt">Portuguese</option><option value="es">Spanish</option><option value="fr">French</option><option value="de">German</option></select></label><label>Chunk Seconds<input type="number" min={1} max={10} step={0.5} value={settings.chunk_seconds} onChange={(e) => setSettings({ ...settings, chunk_seconds: Number(e.target.value) })} /></label><div className="row wide"><button className="btn" onClick={() => safe(async () => { await apiPutSettings(settings); await refreshCatalog(); })}>Save Runtime Settings</button></div></div><div className="status-grid" style={{ marginTop: 12 }}><div className="stat"><span>ASR Backend</span><strong>{status?.backend_asr ?? "-"}</strong></div><div className="stat"><span>Capture Device</span><strong>{status?.capture_device ?? "-"}</strong></div><div className="stat"><span>Model</span><strong>{status?.model ?? "-"}</strong></div><div className="stat"><span>Latency</span><strong>{status?.avg_chunk_latency_ms ?? 0} ms</strong></div><div className="stat"><span>CUDA</span><strong>{status?.cuda_active ? "active" : "inactive"}</strong></div><div className="stat"><span>Fallback</span><strong>{status?.fallback_reason ?? "none"}</strong></div></div></section> : null}
    </div>
  );
}
