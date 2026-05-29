import { useEffect, useMemo, useState } from "react";
import { Play, Square, Activity, Sparkles, Cpu } from "lucide-react";
import { apiGet, apiPost, apiPutSettings, socketUrl } from "./api";
import type { RuntimeSettings, RuntimeStatus } from "./types";

const DEFAULT_SETTINGS: RuntimeSettings = {
  language: "en",
  model_size: "base",
  chunk_seconds: 2,
  analysis_interval_seconds: 0,
  base_url: "https://api.deepseek.com",
  llm_model: "deepseek-chat",
  prompt: "Summarize key points and action items from this transcript."
};

export function App() {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [settings, setSettings] = useState<RuntimeSettings>(DEFAULT_SETTINGS);
  const [transcript, setTranscript] = useState<string>("");
  const [analysis, setAnalysis] = useState<string>("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    apiGet<RuntimeSettings>("/settings").then(setSettings).catch((e) => setError(String(e)));
    apiGet<{ status: RuntimeStatus }>("/health")
      .then((data) => setStatus(data.status))
      .catch((e) => setError(String(e)));
    apiGet<{ text: string }>("/transcript").then((x) => setTranscript(x.text)).catch(() => undefined);

    const ws = new WebSocket(socketUrl());
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "status") setStatus(msg.data as RuntimeStatus);
      if (msg.type === "transcript") setTranscript((prev) => `${prev}${prev ? "\n" : ""}${msg.text}`);
      if (msg.type === "analysis") setAnalysis(msg.text);
      if (msg.type === "error") setError(msg.message);
    };
    ws.onerror = () => setError("WebSocket connection failed. Is core running?");
    return () => ws.close();
  }, []);

  const statusCards = useMemo(
    () => [
      ["ASR Backend", status?.backend_asr ?? "-"],
      ["Capture Device", status?.capture_device ?? "-"],
      ["Model", status?.model ?? "-"],
      ["Language", status?.language ?? "-"],
      ["Chunk Latency", `${status?.avg_chunk_latency_ms ?? 0} ms`],
      ["CUDA", `${status?.cuda_active ? "active" : "inactive"} / available=${status?.cuda_available ?? false}`],
      ["Fallback", status?.fallback_reason ?? "none"],
      ["LLM", status?.llm_connection_status ?? "unknown"]
    ],
    [status]
  );

  async function saveSettings() {
    try {
      await apiPutSettings(settings);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }

  async function saveApiKey() {
    try {
      await apiPost("/llm/credentials", { api_key: apiKey });
      setApiKey("");
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }

  async function start() {
    try {
      await apiPost("/transcription/start");
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }

  async function stop() {
    try {
      await apiPost("/transcription/stop");
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }

  async function analyzeNow() {
    try {
      const response = await apiPost<{ analysis: string }>("/analysis/now");
      setAnalysis(response.analysis);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="label">Realtime System Transcriber</p>
          <h1>System Audio to Actionable Intelligence</h1>
        </div>
        <div className="row">
          <button className="btn primary" onClick={start}><Play size={16} /> Start</button>
          <button className="btn" onClick={stop}><Square size={16} /> Stop</button>
          <button className="btn accent" onClick={analyzeNow}><Sparkles size={16} /> Analyze Now</button>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <section className="grid">
        <article className="panel">
          <h2><Activity size={16} /> Runtime Status</h2>
          <div className="status-grid">
            {statusCards.map(([k, v]) => (
              <div key={k} className="stat">
                <span>{k}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <h2><Cpu size={16} /> Settings</h2>
          <div className="form-grid">
            <label>Language
              <select value={settings.language} onChange={(e) => setSettings({ ...settings, language: e.target.value })}>
                <option value="en">English</option><option value="pt">Portuguese</option><option value="es">Spanish</option><option value="fr">French</option><option value="de">German</option>
              </select>
            </label>
            <label>Model
              <select value={settings.model_size} onChange={(e) => setSettings({ ...settings, model_size: e.target.value as RuntimeSettings["model_size"] })}>
                <option value="tiny">tiny (lowest latency)</option>
                <option value="base">base (balanced)</option>
                <option value="small">small (better quality)</option>
              </select>
            </label>
            <label>Chunk Seconds
              <input type="number" min={1} max={10} step={0.5} value={settings.chunk_seconds} onChange={(e) => setSettings({ ...settings, chunk_seconds: Number(e.target.value) })} />
            </label>
            <label>Periodic Analysis (s)
              <input type="number" min={0} max={600} value={settings.analysis_interval_seconds} onChange={(e) => setSettings({ ...settings, analysis_interval_seconds: Number(e.target.value) })} />
            </label>
            <label>Base URL
              <input value={settings.base_url} onChange={(e) => setSettings({ ...settings, base_url: e.target.value })} />
            </label>
            <label>Model Name
              <input value={settings.llm_model} onChange={(e) => setSettings({ ...settings, llm_model: e.target.value })} />
            </label>
            <label className="wide">Analysis Prompt
              <textarea value={settings.prompt} onChange={(e) => setSettings({ ...settings, prompt: e.target.value })} />
            </label>
            <label className="wide">API Key (stored in Windows Credential Manager)
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            </label>
            <div className="row wide">
              <button className="btn" onClick={saveSettings}>Save Settings</button>
              <button className="btn" onClick={saveApiKey}>Save API Key</button>
            </div>
          </div>
        </article>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>Live Transcript</h2>
          <pre>{transcript || "No transcript yet."}</pre>
        </article>
        <article className="panel">
          <h2>Latest Analysis</h2>
          <pre>{analysis || "No analysis yet."}</pre>
        </article>
      </section>
    </div>
  );
}
