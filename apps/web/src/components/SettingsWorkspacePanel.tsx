import type { RuntimeSettings, RuntimeStatus } from "../types";
import type { LanguageOption } from "../languageOptions";
import { transcriptionLanguageOptions } from "../languageOptions";

type Props = {
  settings: RuntimeSettings;
  status: RuntimeStatus | null;
  onLanguageChange: (value: string) => void;
  onChunkSecondsChange: (value: number) => void;
  onSaveRuntimeSettings: () => void;
};

export function SettingsWorkspacePanel({
  settings,
  status,
  onLanguageChange,
  onChunkSecondsChange,
  onSaveRuntimeSettings,
}: Props) {
  const languageOptions: LanguageOption[] = transcriptionLanguageOptions(settings);
  return (
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
            <label>
              Transcription Language
              <select value={settings.language} onChange={(e) => onLanguageChange(e.target.value)}>
                {languageOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              Chunk Seconds
              <input type="number" min={1} max={10} step={0.5} value={settings.chunk_seconds} onChange={(e) => onChunkSecondsChange(Number(e.target.value))} />
            </label>
            <div className="row wide">
              <button className="btn" onClick={() => onSaveRuntimeSettings()}>
                Save Runtime Settings
              </button>
            </div>
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
  );
}
