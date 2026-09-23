export type PillCategory =
  | "genre"
  | "mood"
  | "feeling"
  | "instrument"
  | "vocal"
  | "pacing"
  | "era"
  | "keyword";

export interface Pill {
  id: string;
  category: PillCategory;
  label: string;
  weight: number;
}

export interface SamplingParams {
  temperature: number;
  top_p: number;
  top_k: number;
  repetition_penalty: number;
}

export interface GenerationOptions {
  cot: "full" | "melody" | "off";
  seed: number;
  cfg_scale: number | null;
  max_duration: number;
  sampling: SamplingParams;
  bpm?: number | null;
  reference_mode?: "original" | "sing" | "backing";
  reference_fit_duration?: boolean;
  memory_mode?: "balanced" | "low";
}

export type JobStatus =
  | "queued"
  | "waiting"
  | "paused"
  | "downloading"
  | "planning"
  | "generating"
  | "synthesizing"
  | "decoding"
  | "done"
  | "error"
  | "cancelled";

export interface Job {
  id: string;
  status: JobStatus;
  progress: number;
  stage: string;
  message: string;
  created_at: number;
  updated_at: number;
  title: string;
  style: string;
  engine: string;
  track_id: string | null;
  error: string | null;
  eta_seconds: number | null;
  started_at?: number | null;
  run_started_at?: number | null;
  finished_at?: number | null;
  elapsed_seconds?: number;
  completed_units?: number | null;
  total_units?: number | null;
  progress_unit?: string | null;
  pause_requested?: boolean;
  cancel_requested?: boolean;
}

export interface LyricFit {
  word_count: number;
  target_words: number;
  estimated_min_seconds: number;
  estimated_max_seconds: number;
  suggested_duration: number;
  exceeds_duration_limit: boolean;
  bpm: number;
  explicit_bpm: boolean;
  warning: string | null;
  note: string;
}

export interface SystemStatus {
  sampled_at: number | null;
  cpu_percent: number | null;
  ram: { total_bytes: number; available_bytes: number; used_bytes: number; percent: number } | null;
  gpus: { index: string; name: string; total_bytes: number | null; used_bytes: number | null;
    free_bytes: number | null; utilization_percent: number | null; temperature_c: number | null }[];
  gpu_error: string | null;
  system_error: string | null;
  model_activity: { name: string; started_at: number } | null;
}

export interface ReferenceMelody { id: string; name: string; duration: number; sha256: string; abc?: string; model: string }
export interface WordCue { text: string; start: number; end: number }
export interface LyricTiming { source: string; text: string; language: string; words: WordCue[] }
export interface MediaTask { id: string; kind: "reference" | "alignment"; status: string; message: string; created_at: number; result: ReferenceMelody | LyricTiming | null }
export interface MediaCapabilities { reference_missing: string[]; alignment_missing: string[]; midi_missing: string[]; extensions: string[] }

export interface Track {
  rating?: number;
  id: string;
  title: string;
  style: string;
  extra?: string | null;
  options?: GenerationOptions | null;
  abc?: string | null;
  generation_meta?: { truncated?: boolean; abc?: string; [key: string]: unknown };
  reference?: ReferenceMelody | null;
  lyric_timing?: LyricTiming | null;
  lyrics: string;
  pills: Pill[];
  audio_url: string;
  cover_url: string | null;
  duration: number;
  sample_rate: number;
  seed: number;
  engine: string;
  created_at: number;
}

export interface Playlist {
  id: string;
  name: string;
  track_ids: string[];
  order: number;
  created_at: number;
}

export type PillCatalog = Record<PillCategory, string[]>;

export type Skin =
  | "bars"
  | "wave"
  | "aurora"
  | "radial"
  | "mirror"
  | "ripple";

export interface VizConfig {
  skin: Skin;
  colors: [string, string, string];
  intensity: number; // 0.5..1.6 height/motion scale
  density: number; // 0.5..1.6 bar/point count scale
  glow: number; // 0..24 shadow blur
  spin: boolean; // rotate radial-type skins
}

export interface VizPreset {
  id: string;
  name: string;
  config: VizConfig;
}

export type PillSort = "category" | "color" | "theme" | "az" | "scramble";

export interface EngineInfo {
  id: string;
  label: string;
  ready: boolean;
  note: string;
  desc: string;
}

export interface LlmOption {
  key: string;
  repo: string;
  label: string;
  size: string;
  note: string;
  ready: boolean;
}

export interface LlmOptions {
  selected: string;
  options: LlmOption[];
}

export interface ModelStatus {
  engine: string;
  ready: boolean;
  downloading: boolean;
  percent: number;
  speed_mbps: number;
  eta_sec: number;
  message: string;
  error: string;
}
