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
  model_size: "tiny" | "base" | "small";
  chunk_seconds: number;
  analysis_interval_seconds: number;
  base_url: string;
  llm_model: string;
  prompt: string;
};
