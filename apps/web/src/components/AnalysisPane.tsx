import { Lightbulb, Sparkles } from "lucide-react";
import type { AiReadinessState } from "../types";

type Props = {
  analysisText: string;
  readinessState: AiReadinessState;
  readinessMessage: string;
  updatedLabel: string;
  analysisStateLabel: string;
  canAnalyzeNow: boolean;
  autoAnalysisEnabled: boolean;
  onToggleAutoAnalysis: (checked: boolean) => void;
  onAnalyzeNow: () => void;
  onOpenAiTab: () => void;
};

export function AnalysisPane({
  analysisText,
  readinessState,
  readinessMessage,
  updatedLabel,
  analysisStateLabel,
  canAnalyzeNow,
  autoAnalysisEnabled,
  onToggleAutoAnalysis,
  onAnalyzeNow,
  onOpenAiTab,
}: Props) {
  const readinessLabel =
    readinessState === "ready"
      ? "Configured"
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
        <button className="btn primary" onClick={onAnalyzeNow} disabled={!canAnalyzeNow}>
          <Sparkles size={16} /> Analyse Now
        </button>
        <label className="inline-check analysis-toggle">
          <input
            type="checkbox"
            checked={autoAnalysisEnabled}
            onChange={(e) => onToggleAutoAnalysis(e.target.checked)}
          />
          Automatic analysis
        </label>
        <span className="muted analysis-state-label">{analysisStateLabel}</span>
      </div>
      <div className="analysis-results-shell">
        {analysisText ? (
          <pre className="analysis-pre">{analysisText}</pre>
        ) : (
          <div className="analysis-empty">
            <div className="analysis-empty-icon">
              <Sparkles size={28} />
            </div>
            <strong>No analysis yet.</strong>
            <span className="muted">Run an analysis to generate AI insights from your transcript.</span>
          </div>
        )}
      </div>
      {readinessState !== "ready" ? (
        <div className="row" style={{ marginTop: 8 }}>
          <span className="muted">{readinessMessage}</span>
          <button className="btn" onClick={onOpenAiTab}>Open AI Settings</button>
        </div>
      ) : null}
    </article>
  );
}
