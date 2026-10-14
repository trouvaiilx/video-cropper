export interface AspectRatio {
  label: string;
  num?: number;
  den?: number;
}

export interface CropConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  bound_w: number;
  bound_h: number;
}

export interface VideoMetadata {
  path: string;
  display_width: number;
  display_height: number;
  stored_width: number;
  stored_height: number;
  rotation: number;
  duration: number;
  fps: number;
  video_codec: string;
  pixel_format: string;
  bit_depth: number;
  has_audio: boolean;
  audio_codec: string;
  file_size: number;
  container: string;
}

export type JobState =
  | 'idle'
  | 'validating'
  | 'running'
  | 'cancelling'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface ProcessingJob {
  input_path: string;
  output_path: string;
  crop: CropConfig;
  output_width: number;
  output_height: number;
  encoder: string;
  has_audio: boolean;
  duration: number;
  rotation: number;
  user_rotation?: number;
  state?: JobState;
}

export interface EncoderInfo {
  id: string;
  label: string;
  available: boolean;
}

export interface ToolPaths {
  ffmpeg: string;
  ffprobe: string;
}

export interface ProgressUpdate {
  out_time_ms: number;
  duration_ms: number;
  percent: number;
  speed?: number;
  frame: number;
  eta_seconds?: number;
  elapsed_seconds: number;
  done: boolean;
}

export interface AppSettings {
  last_dir: string;
  last_output_dir: string;
  encoder: string;
  ratio: string;
  resolution_preset: string;
  ffmpeg_path: string;
  ffprobe_path: string;
  show_thirds: boolean;
}
