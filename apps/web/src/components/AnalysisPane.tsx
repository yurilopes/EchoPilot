import { Lightbulb, Sparkles } from "lucide-react";
import type { AiReadinessState } from "../types";

type Props = {
  analysisText: string;
  hasAnalysis: boolean;
  emptyMessage: string;
  readinessState: AiReadinessState;
  readinessMessage: string;
  aiModelLabel: string;
  analysisStateLabel: string;
  analysisStateKind: "unavailable" | "ready" | "waiting" | "up-to-date" | "in-progress";
  canAnalyzeNow: boolean;
  analysisBusy: boolean;
  autoAnalysisEnabled: boolean;
  onToggleAutoAnalysis: (checked: boolean) => void;
  onAnalyzeNow: () => void;
  onOpenAiTab: () => void;
};

export function AnalysisPane({
  analysisText,
  hasAnalysis,
  emptyMessage,
  readinessState,
  readinessMessage,
  aiModelLabel,
  analysisStateLabel,
  analysisStateKind,
  canAnalyzeNow,
  analysisBusy,
  autoAnalysisEnabled,
  onToggleAutoAnalysis,
  onAnalyzeNow,
  onOpenAiTab,
}: Props) {
  const readinessLabel =
    readinessState === "ready"
      ? `Configured (${aiModelLabel})`
      : readinessState === "disabled"
        ? "Disabled"
        : readinessState === "missing_key"
          ? "Missing key"
          : "Invalid config";

  return (
    <article className="panel analysis-panel">
      <div className="panel-head">
        <h2>AI Analysis</h2>
        <span className={`badge badge-primary ${readinessState === "ready" ? "badge-selected" : ""}`}>
          {readinessLabel}
        </span>
      </div>
      <div className="analysis-actions">
        <button className="btn primary" onClick={onAnalyzeNow} disabled={!canAnalyzeNow} aria-busy={analysisBusy}>
          {analysisBusy ? <Sparkles size={16} className="spin" /> : <Sparkles size={16} />}
          {analysisBusy ? "Analysing..." : "Analyse Now"}
        </button>
        <label className="inline-check analysis-toggle">
          <input
            type="checkbox"
            checked={autoAnalysisEnabled}
            onChange={(e) => onToggleAutoAnalysis(e.target.checked)}
          />
          Automatic analysis
        </label>
        <span className={`badge analysis-state-badge analysis-state-${analysisStateKind}`}>
          {analysisStateLabel}
        </span>
      </div>
      {hasAnalysis ? (
        <div className="analysis-results-shell">
          <pre className="analysis-pre">{analysisText}</pre>
        </div>
      ) : (
        <div className="analysis-empty analysis-empty-ai">
          <div className="analysis-empty-icon">
            <Sparkles size={28} />
          </div>
          <strong>No analysis yet.</strong>
          <span className="muted">{emptyMessage}</span>
        </div>
      )}
      {readinessState !== "ready" ? (
        <div className="row" style={{ marginTop: 8 }}>
          <span className="muted">{readinessMessage}</span>
          <button className="btn" onClick={onOpenAiTab}>Open AI Settings</button>
        </div>
      ) : null}
    </article>
  );
}
