import type { CSSProperties } from "react";
import { Loader2, Play, Square } from "lucide-react";
import type { SessionUiState } from "../types";

type Props = {
  sessionState: SessionUiState;
  clearTranscriptOnStart: boolean;
  onToggleClearTranscriptOnStart: (checked: boolean) => void;
  stopCheckboxGapPx: number;
  onStart: () => void;
  onStop: () => void;
};

export function SessionControls({
  sessionState,
  clearTranscriptOnStart,
  onToggleClearTranscriptOnStart,
  stopCheckboxGapPx,
  onStart,
  onStop,
}: Props) {
  const startEnabled = sessionState === "idle" || sessionState === "error";
  const stopEnabled = sessionState === "running" || sessionState === "starting";
  const statusCopy =
    sessionState === "running"
      ? "Running"
      : sessionState === "starting"
        ? "Starting"
        : sessionState === "stopping"
          ? "Stopping"
          : "Stopped";

  return (
    <div className="session-controls">
      <div className="session-status-card">
        <span className={`session-dot session-dot-${sessionState}`} />
        <div>
          <span className="muted">Session Status</span>
          <strong>{statusCopy}</strong>
        </div>
      </div>
      <div className="session-controls-stack" style={{ "--session-checkbox-gap": `${stopCheckboxGapPx}px` } as CSSProperties}>
        <div className="session-controls-actions">
          <button className="btn primary" onClick={onStart} disabled={!startEnabled}>
            {sessionState === "starting" ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
            {sessionState === "starting" ? "Starting..." : "Start"}
          </button>
          <button className="btn" onClick={onStop} disabled={!stopEnabled}>
            {sessionState === "stopping" ? <Loader2 size={16} className="spin" /> : <Square size={16} />}
            {sessionState === "stopping" ? "Stopping..." : "Stop"}
          </button>
        </div>
        <div className="session-controls-footer">
          <label className="inline-check session-toggle">
            <input
              type="checkbox"
              checked={clearTranscriptOnStart}
              onChange={(e) => onToggleClearTranscriptOnStart(e.target.checked)}
            />
            Clear transcript on start
          </label>
        </div>
      </div>
    </div>
  );
}
