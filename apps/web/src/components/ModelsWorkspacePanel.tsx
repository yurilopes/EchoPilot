import { ModelRow } from "./ModelRow";
import type { Dispatch, SetStateAction } from "react";
import type { AsrModelRow, DownloadStateResponse, ModelFilterCriteria, RuntimeSettings, RuntimeStatus, SortBy, SortDir } from "../types";

type Props = {
  liveStatus: RuntimeStatus | null;
  runtimeSettings: RuntimeSettings;
  modelFilter: string;
  setModelFilter: Dispatch<SetStateAction<string>>;
  sortBy: SortBy;
  setSortBy: Dispatch<SetStateAction<SortBy>>;
  sortDir: SortDir;
  setSortDir: Dispatch<SetStateAction<SortDir>>;
  modelFilters: ModelFilterCriteria;
  filterOptions: {
    live: string[];
    quality: string[];
    speed: string[];
    size: string[];
    state: string[];
  };
  activeModels: AsrModelRow[];
  downloadState: DownloadStateResponse | null;
  warmupInfo: string;
  elapsedSeconds: (startedAt: number | null | undefined) => number;
  autoApplyAfterDownload: boolean;
  setAutoApplyAfterDownload: Dispatch<SetStateAction<boolean>>;
  onEngineChange: (engine: "whisper" | "parakeet") => void;
  onSelectModel: () => void;
  onApplyToRuntime: () => void;
  onUseModel: (modelId: string) => void;
  onDownload: (modelId: string) => void;
  onCancel: (taskId: string) => void;
  onRetry: (taskId: string) => void;
  onWarmup: () => void;
  toggleFilter: <K extends keyof ModelFilterCriteria>(key: K, value: ModelFilterCriteria[K][number]) => void;
  clearFilters: () => void;
};

function bytes(value: number | null): string {
  if (!value) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let n = value;
  let idx = 0;
  while (n >= 1024 && idx < units.length - 1) {
    n /= 1024;
    idx += 1;
  }
  return `${n.toFixed(1)} ${units[idx]}`;
}

export function ModelsWorkspacePanel({
  liveStatus,
  runtimeSettings,
  modelFilter,
  setModelFilter,
  sortBy,
  setSortBy,
  sortDir,
  setSortDir,
  modelFilters,
  filterOptions,
  activeModels,
  downloadState,
  warmupInfo,
  elapsedSeconds,
  autoApplyAfterDownload,
  setAutoApplyAfterDownload,
  onEngineChange,
  onSelectModel,
  onApplyToRuntime,
  onUseModel,
  onDownload,
  onCancel,
  onRetry,
  onWarmup,
  toggleFilter,
  clearFilters,
}: Props) {
  return (
    <section className="panel tab-panel models-tab-panel">
      <div className="models-inline-status">
        <span className="muted">Runtime:</span>
        <strong>{liveStatus?.model ?? "unknown"}</strong>
        <span className="muted">({liveStatus?.backend_asr ?? "-"})</span>
        <span className="models-sep">|</span>
        <span className="muted">Selected:</span>
        <strong>{runtimeSettings.model_id || "none"}</strong>
        <span className="muted">({runtimeSettings.asr_engine})</span>
      </div>
      <div className="queue-summary">
        <span className="badge badge-soft">active: {downloadState?.active_task_id ?? "none"}</span>
        <span className="badge badge-soft">queued: {downloadState?.queued_count ?? 0}</span>
        <span className="badge badge-soft">done: {downloadState?.completed_count ?? 0}</span>
        <span className={`badge ${(downloadState?.failed_count ?? 0) > 0 ? "badge-primary" : "badge-soft"}`}>failed: {downloadState?.failed_count ?? 0}</span>
        <span className="badge badge-soft">global: {downloadState?.aggregate_percent?.toFixed(1) ?? "0.0"}%</span>
      </div>
      <div className="models-toolbar">
        <div className="models-toolbar-main row">
          <select
            value={runtimeSettings.asr_engine}
            onChange={(e) => void onEngineChange(e.target.value as "whisper" | "parakeet")}
          >
            <option value="whisper">Whisper</option>
            <option value="parakeet">Parakeet</option>
          </select>
          <input value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} placeholder="Filter model id..." />
        </div>
        <div className="models-filter-dropdowns row">
          <details className="filter-dropdown">
            <summary>Live suitability ({modelFilters.live.length})</summary>
            <div className="models-filter-options">
              {filterOptions.live.map((v) => (
                <label key={`live-${v}`} className="inline-check">
                  <input type="checkbox" checked={modelFilters.live.includes(v)} onChange={() => toggleFilter("live", v)} />
                  {v}
                </label>
              ))}
            </div>
          </details>
          <details className="filter-dropdown">
            <summary>Quality ({modelFilters.quality.length})</summary>
            <div className="models-filter-options">
              {filterOptions.quality.map((v) => (
                <label key={`quality-${v}`} className="inline-check">
                  <input type="checkbox" checked={modelFilters.quality.includes(v)} onChange={() => toggleFilter("quality", v)} />
                  {v}
                </label>
              ))}
            </div>
          </details>
          <details className="filter-dropdown">
            <summary>Speed ({modelFilters.speed.length})</summary>
            <div className="models-filter-options">
              {filterOptions.speed.map((v) => (
                <label key={`speed-${v}`} className="inline-check">
                  <input type="checkbox" checked={modelFilters.speed.includes(v)} onChange={() => toggleFilter("speed", v)} />
                  {v}
                </label>
              ))}
            </div>
          </details>
          <details className="filter-dropdown">
            <summary>Size ({modelFilters.size.length})</summary>
            <div className="models-filter-options">
              {filterOptions.size.map((v) => (
                <label key={`size-${v}`} className="inline-check">
                  <input type="checkbox" checked={modelFilters.size.includes(v)} onChange={() => toggleFilter("size", v)} />
                  {v}
                </label>
              ))}
            </div>
          </details>
          <details className="filter-dropdown">
            <summary>State ({modelFilters.state.length})</summary>
            <div className="models-filter-options">
              {filterOptions.state.map((v) => (
                <label key={`state-${v}`} className="inline-check">
                  <input type="checkbox" checked={modelFilters.state.includes(v)} onChange={() => toggleFilter("state", v)} />
                  {v}
                </label>
              ))}
            </div>
          </details>
          <details className="filter-dropdown">
            <summary>Installed ({modelFilters.installed.length})</summary>
            <div className="models-filter-options">
              {(["yes", "no"] as const).map((v) => (
                <label key={`installed-${v}`} className="inline-check">
                  <input type="checkbox" checked={modelFilters.installed.includes(v)} onChange={() => toggleFilter("installed", v)} />
                  {v}
                </label>
              ))}
            </div>
          </details>
          <details className="filter-dropdown advanced-sort">
            <summary>Advanced sort</summary>
            <div className="models-filter-options">
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}><option value="downloads">downloads</option><option value="speed">speed</option><option value="quality">quality</option><option value="live">live suitability</option><option value="size">model size</option><option value="installed">installed</option><option value="name">name</option></select>
              <select value={sortDir} onChange={(e) => setSortDir(e.target.value as SortDir)}><option value="desc">desc</option><option value="asc">asc</option></select>
            </div>
          </details>
        </div>
        <div className="models-toolbar-actions row">
          <button className="btn" onClick={() => void onSelectModel()}>Select Model</button>
          <button className="btn primary" onClick={() => void onApplyToRuntime()}>Apply to Runtime</button>
          <label className="inline-check">
            <input type="checkbox" checked={autoApplyAfterDownload} onChange={(e) => setAutoApplyAfterDownload(e.target.checked)} />
            Auto-apply after download
          </label>
          <button className="btn btn-quiet" onClick={() => void onWarmup()}>Warmup</button>
          <button className="btn btn-quiet" onClick={clearFilters}>Clear filters</button>
        </div>
      </div>
      {warmupInfo ? <div className="muted" style={{ marginBottom: 10 }}>{warmupInfo}</div> : null}
      <div className="model-list">
        {activeModels.length === 0 ? (
          <div className="model-empty">
            <strong>No models match current filters.</strong>
            <span className="muted">Try clearing filters or switching engine.</span>
            <button className="btn btn-quiet" onClick={clearFilters}>Clear filters</button>
          </div>
        ) : null}
        {activeModels.slice(0, 200).map((model) => {
          const isSelected = model.id === runtimeSettings.model_id || model.is_selected;
          const isRuntimeModel = (liveStatus?.model ?? "") === model.id;
          return (
            <ModelRow
              key={model.id}
              model={model}
              isSelected={isSelected}
              isRuntimeModel={isRuntimeModel}
              elapsedSeconds={elapsedSeconds(model.task_timestamps?.started_at)}
              canUse={model.availability === "ready" && !isSelected}
              bytes={bytes}
              onUse={(modelId) => void onUseModel(modelId)}
              onDownload={(modelId) => void onDownload(modelId)}
              onCancel={(taskId) => void onCancel(taskId)}
              onRetry={(taskId) => void onRetry(taskId)}
            />
          );
        })}
      </div>
    </section>
  );
}
