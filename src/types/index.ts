export interface GenerationResult {
  lyrics: string;
  imageUrl: string;
  audioUrl: string;
  title: string;
  theme: string;
  createdAt: string;
}

export interface LyricsResponse {
  lyrics: string;
  title: string;
}

export interface ImageResponse {
  imageUrl: string;
}

export interface MusicResponse {
  audioUrl: string;
}

export interface ExportData {
  title: string;
  theme: string;
  lyrics: string;
  imageUrl: string;
  audioUrl: string;
  createdAt: string;
  version: string;
}

export type GenerationStep = "idle" | "lyrics" | "image" | "music" | "done" | "error";
