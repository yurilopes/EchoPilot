import type { AiReadinessState } from "../types";

type Props = {
  analysisText: string;
  readinessState: AiReadinessState;
  readinessMessage: string;
  updatedLabel: string;
  onOpenAiTab: () => void;
};

export function AnalysisPane({ analysisText, readinessState, readinessMessage, updatedLabel, onOpenAiTab }: Props) {
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
      <pre className="analysis-pre">{analysisText || "No analysis yet."}</pre>
      <div className="microcopy">{updatedLabel}</div>
      {readinessState !== "ready" ? (
        <div className="row" style={{ marginTop: 8 }}>
          <span className="muted">{readinessMessage}</span>
          <button className="btn" onClick={onOpenAiTab}>Open AI Settings</button>
        </div>
      ) : null}
    </article>
  );
}
