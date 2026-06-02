import type { AiReadinessState } from "../types";

type Props = {
  readinessState: AiReadinessState;
  readinessMessage: string;
  statusLabel: string;
};

export function AiReadinessCard({ readinessState, readinessMessage, statusLabel }: Props) {
  return (
    <div className="ai-readiness-card" style={{ marginTop: 10 }}>
      <span className={`badge ${readinessState === "ready" ? "badge-selected" : ""}`}>{statusLabel}</span>
      <span className="muted">{readinessMessage}</span>
    </div>
  );
}
