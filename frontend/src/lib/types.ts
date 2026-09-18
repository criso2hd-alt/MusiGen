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
}

export type JobStatus =
  | "queued"
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
}

export interface Track {
  id: string;
  title: string;
  style: string;
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
