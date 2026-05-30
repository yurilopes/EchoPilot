export type TabKey = "live" | "ai" | "models" | "settings";
export type SessionUiState = "idle" | "starting" | "running" | "stopping" | "error";
export type AiReadinessState = "ready" | "missing_key" | "invalid_config" | "disabled";
export type TranscriptFollowState = "following" | "paused";

export type RuntimeStatus = {
  running: boolean;
  backend_asr: string;
  capture_device: string;
  model: string;
  language: string;
  avg_chunk_latency_ms: number;
  cuda_available: boolean;
  cuda_active: boolean;
  fallback_reason: string | null;
  llm_connection_status: string;
  transcript_chars: number;
};

export type RuntimeSettings = {
  language: string;
  asr_engine: "whisper" | "parakeet";
  model_id: string;
  ai_enabled: boolean;
  chunk_seconds: number;
  analysis_interval_seconds: number;
  base_url: string;
  llm_model: string;
  prompt: string;
};

export type DownloadProgress = {
  percent: number;
  bytes_downloaded: number;
  bytes_total: number | null;
  eta_seconds: number | null;
  speed_bytes_per_sec: number | null;
  indeterminate: boolean;
  message: string;
};

export type DownloadTask = {
  task_id: string;
  engine: string;
  model_id: string;
  status: "queued" | "downloading" | "done" | "error" | "canceled";
  progress: DownloadProgress;
  error: string | null;
  started_at?: number | null;
  last_progress_at?: number | null;
};

export type DownloadStateResponse = {
  active_task_id: string | null;
  queued_count: number;
  completed_count: number;
  failed_count: number;
  aggregate_percent: number;
  tasks: DownloadTask[];
};

export type AsrModelRow = {
  id: string;
  downloads: number | null;
  last_modified: string;
  installed: boolean;
  is_selected: boolean;
  availability: "ready" | "needs_download" | "downloading" | "error";
  download_state: "idle" | "queued" | "downloading" | "done" | "error" | "canceled";
  download_progress: DownloadProgress | null;
  task_id: string | null;
  task_timestamps: {
    created_at: number | null;
    started_at: number | null;
    updated_at: number | null;
    last_progress_at: number | null;
  } | null;
  download_error: string | null;
  profile: {
    speed: string;
    quality: string;
    live_suitability: string;
    footprint: string;
    recommendation: string;
  };
};

export type CatalogResponse = {
  engines: Array<{ id: "whisper" | "parakeet"; label: string }>;
  models: { whisper: AsrModelRow[]; parakeet: AsrModelRow[] };
};
