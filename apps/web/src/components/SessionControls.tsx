import { Loader2, Play, Square, Sparkles } from "lucide-react";
import type { SessionUiState } from "../types";

type Props = {
  sessionState: SessionUiState;
  canAnalyze: boolean;
  onStart: () => void;
  onStop: () => void;
  onAnalyze: () => void;
};

export function SessionControls({ sessionState, canAnalyze, onStart, onStop, onAnalyze }: Props) {
  const startEnabled = sessionState === "idle" || sessionState === "error";
  const stopEnabled = sessionState === "running" || sessionState === "starting";
  const statusCopy =
    sessionState === "running"
      ? "Listening to system audio"
      : sessionState === "starting"
        ? "Starting transcription..."
        : sessionState === "stopping"
          ? "Stopping transcription..."
          : "Stopped";

  return (
    <div>
      <div className="row">
        <button className="btn primary" onClick={onStart} disabled={!startEnabled}>
          {sessionState === "starting" ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
          {sessionState === "starting" ? "Starting..." : "Start"}
        </button>
        <button className="btn" onClick={onStop} disabled={!stopEnabled}>
          {sessionState === "stopping" ? <Loader2 size={16} className="spin" /> : <Square size={16} />}
          {sessionState === "stopping" ? "Stopping..." : "Stop"}
        </button>
        <button className="btn accent" onClick={onAnalyze} disabled={!canAnalyze}>
          <Sparkles size={16} /> Analyze Now
        </button>
      </div>
      <div className="microcopy">{statusCopy}</div>
    </div>
  );
}
