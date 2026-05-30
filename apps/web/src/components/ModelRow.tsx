import { ChevronDown, ChevronUp, Download, RotateCcw, XCircle } from "lucide-react";
import type { AsrModelRow } from "../types";

type Props = {
  model: AsrModelRow;
  isSelected: boolean;
  isRuntimeModel: boolean;
  isExpanded: boolean;
  elapsedSeconds: number;
  canUse: boolean;
  bytes: (value: number | null) => string;
  onUse: (modelId: string) => void;
  onDownload: (modelId: string) => void;
  onCancel: (taskId: string) => void;
  onRetry: (taskId: string) => void;
  onToggleExpanded: () => void;
};

export function ModelRow({
  model,
  isSelected,
  isRuntimeModel,
  isExpanded,
  elapsedSeconds,
  canUse,
  bytes,
  onUse,
  onDownload,
  onCancel,
  onRetry,
  onToggleExpanded,
}: Props) {
  const progress = model.download_progress;
  const noProgressHint =
    model.download_state === "downloading" &&
    (progress?.bytes_downloaded ?? 0) === 0 &&
    elapsedSeconds > 20;

  const primaryAction =
    model.availability === "needs_download"
      ? { label: "Download", kind: "download" as const }
      : canUse
        ? { label: "Use now", kind: "use" as const }
        : null;

  return (
    <div className={`model-row ${isSelected ? "model-row-selected" : ""}`}>
      <div className="model-summary">
        <div className="model-header">
          <strong>{model.id}</strong>
          {isSelected ? <span className="badge badge-selected">Selected</span> : null}
          {isRuntimeModel ? <span className="badge badge-primary">Runtime</span> : null}
        </div>

        <div className="model-meta-line muted">
          downloads {model.downloads ?? "-"} | installed {model.installed ? "yes" : "no"} | {model.id.includes("/") ? "hub model" : "alias model"}
        </div>

        <div className="profile-badges">
          <span className="badge badge-primary">state: {model.availability}</span>
          <span className="badge badge-soft">speed: {model.profile.speed}</span>
          <span className="badge badge-soft">quality: {model.profile.quality}</span>
          <span className="badge badge-soft">live: {model.profile.live_suitability}</span>
        </div>
      </div>

      <div className="model-actions">
        <div className="row">
          {primaryAction?.kind === "download" ? (
            <button className="btn accent" onClick={() => onDownload(model.id)}>
              <Download size={14} /> {primaryAction.label}
            </button>
          ) : null}
          {primaryAction?.kind === "use" ? (
            <button className="btn primary" onClick={() => onUse(model.id)}>Use now</button>
          ) : null}

          {(model.download_state === "queued" || model.download_state === "downloading") && model.task_id ? (
            <button className="btn" onClick={() => onCancel(model.task_id!)}>
              <XCircle size={14} /> Cancel
            </button>
          ) : null}
          {model.download_state === "error" && model.task_id ? (
            <button className="btn" onClick={() => onRetry(model.task_id!)}>
              <RotateCcw size={14} /> Retry
            </button>
          ) : null}
          <button className="btn btn-quiet" onClick={onToggleExpanded}>
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Details
          </button>
        </div>
      </div>

      {isExpanded ? (
        <div className="model-details">
          <div className="muted">{model.profile.recommendation}</div>
          {progress ? (
            <div className="download-progress">
              <div className="progress-row">
                <span>{model.download_state}</span>
                <span>{progress.indeterminate ? "indeterminate" : `${progress.percent.toFixed(1)}%`}</span>
              </div>
              <div className="progress-bar"><div style={{ width: `${Math.max(2, progress.percent)}%` }} /></div>
              <div className="muted">
                {bytes(progress.bytes_downloaded)} / {bytes(progress.bytes_total)} | speed {progress.speed_bytes_per_sec ? `${bytes(progress.speed_bytes_per_sec)}/s` : "-"} | eta {progress.eta_seconds ?? "-"}s | elapsed {elapsedSeconds}s
              </div>
              {noProgressHint ? <div className="warning" style={{ marginTop: 6 }}>No progress yet. If this persists, cancel and retry.</div> : null}
              {model.download_state === "error" && model.download_error ? <div className="error" style={{ marginTop: 6 }}>Error: {model.download_error}</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
