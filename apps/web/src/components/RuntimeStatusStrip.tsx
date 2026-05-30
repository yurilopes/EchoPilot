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
      <div className="status-chip status-chip-priority"><span>Transcription</span><strong>{runLabel}</strong></div>
      <div className="status-chip status-chip-priority"><span>Connection</span><strong>{backendConnecting ? "reconnecting" : "online"}</strong></div>
      <div className="status-chip status-chip-priority"><span>Runtime model</span><strong>{status?.model ?? settingsModelId}</strong></div>
      <div className="status-chip"><span>Device</span><strong>{status?.capture_device ?? "-"}</strong></div>
      <div className="status-chip"><span>Engine</span><strong>{status?.backend_asr ?? settingsEngine}</strong></div>
      <div className="status-chip"><span>CUDA</span><strong>{status?.cuda_active ? "active" : "inactive"}</strong></div>
    </section>
  );
}
