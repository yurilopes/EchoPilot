import { Cpu, Mic, Monitor, SlidersHorizontal, Wifi, Zap } from "lucide-react";
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
  const toProperCase = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return "-";
    if (trimmed.includes("/")) return trimmed;
    return trimmed
      .replace(/[_-]+/g, " ")
      .split(/\s+/)
      .map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part)
      .join(" ");
  };
  return (
    <section className="status-strip panel">
      <div className="status-chip">
        <span className="status-chip-icon status-chip-icon-transcription"><span className="status-chip-icon-glyph"><Mic size={18} /></span></span>
        <div className="status-chip-content">
          <span>Transcription</span>
          <strong>{runLabel}</strong>
        </div>
      </div>
      <div className="status-chip">
        <span className="status-chip-icon status-chip-icon-connection"><span className="status-chip-icon-glyph"><Wifi size={18} /></span></span>
        <div className="status-chip-content">
          <span>Connection</span>
          <strong>{toProperCase(backendConnecting ? "reconnecting" : "online")}</strong>
        </div>
      </div>
      <div className="status-chip">
        <span className="status-chip-icon status-chip-icon-model"><span className="status-chip-icon-glyph"><Zap size={18} /></span></span>
        <div className="status-chip-content">
          <span>Runtime model</span>
          <strong>{toProperCase(status?.model ?? settingsModelId)}</strong>
        </div>
      </div>
      <div className="status-chip">
        <span className="status-chip-icon status-chip-icon-device"><span className="status-chip-icon-glyph"><Monitor size={18} /></span></span>
        <div className="status-chip-content">
          <span>Device</span>
          <strong>{toProperCase(status?.capture_device ?? "-")}</strong>
        </div>
      </div>
      <div className="status-chip">
        <span className="status-chip-icon status-chip-icon-engine"><span className="status-chip-icon-glyph"><SlidersHorizontal size={18} /></span></span>
        <div className="status-chip-content">
          <span>Engine</span>
          <strong>{toProperCase(status?.backend_asr ?? settingsEngine)}</strong>
        </div>
      </div>
      <div className="status-chip">
        <span className="status-chip-icon status-chip-icon-cuda"><span className="status-chip-icon-glyph"><Cpu size={18} /></span></span>
        <div className="status-chip-content">
          <span>CUDA</span>
          <strong>{status?.cuda_active ? "Active" : "Inactive"}</strong>
        </div>
      </div>
    </section>
  );
}
