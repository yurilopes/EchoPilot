import { Cpu, Mic, Monitor, Wifi, Zap } from "lucide-react";
import type { RuntimeStatus, SessionUiState } from "../types";

type Props = {
  status: RuntimeStatus | null;
  settingsModelId: string;
  settingsEngine: string;
  backendConnecting: boolean;
  sessionState: SessionUiState;
};

export function RuntimeStatusStrip({ status, settingsModelId, settingsEngine, backendConnecting, sessionState }: Props) {
  const runLabel = sessionState === "running" || sessionState === "starting" ? "Running" : "Stopped";
  return (
    <section className="status-strip panel">
      <div className="status-chip status-chip-priority">
        <span className="status-chip-icon status-chip-icon-transcription"><span className="status-chip-icon-glyph"><Mic size={18} /></span></span>
        <div>
          <span>Transcription</span>
          <strong>{runLabel}</strong>
        </div>
      </div>
      <div className="status-chip status-chip-priority">
        <span className="status-chip-icon status-chip-icon-connection"><span className="status-chip-icon-glyph"><Wifi size={18} /></span></span>
        <div>
          <span>Connection</span>
          <strong>{backendConnecting ? "reconnecting" : "online"}</strong>
        </div>
      </div>
      <div className="status-chip status-chip-priority">
        <span className="status-chip-icon status-chip-icon-model"><span className="status-chip-icon-glyph"><Cpu size={18} /></span></span>
        <div>
          <span>Runtime model</span>
          <strong>{status?.model ?? settingsModelId}</strong>
        </div>
      </div>
      <div className="status-chip">
        <span className="status-chip-icon status-chip-icon-device"><span className="status-chip-icon-glyph"><Monitor size={18} /></span></span>
        <div>
          <span>Device</span>
          <strong>{status?.capture_device ?? "-"}</strong>
        </div>
      </div>
      <div className="status-chip">
        <span className="status-chip-icon status-chip-icon-engine"><span className="status-chip-icon-glyph"><Mic size={18} /></span></span>
        <div>
          <span>Engine</span>
          <strong>{status?.backend_asr ?? settingsEngine}</strong>
        </div>
      </div>
      <div className="status-chip">
        <span className="status-chip-icon status-chip-icon-cuda"><span className="status-chip-icon-glyph"><Zap size={18} /></span></span>
        <div>
          <span>CUDA</span>
          <strong>{status?.cuda_active ? "active" : "inactive"}</strong>
        </div>
      </div>
    </section>
  );
}
