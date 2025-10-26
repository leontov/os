export type StreamTransport = "sse" | "websocket" | "webrtc" | "fallback";

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
  emphasis?: "soft" | "strong";
}

export interface EmojiCue {
  timestamp: number;
  emoji: string;
}

export interface AvatarDescriptor {
  type: "lottie" | "canvas";
  src: string;
  loop?: boolean;
}

export interface BaseStreamChunk {
  id?: string;
  timestamp: number;
  transport: StreamTransport;
}

export interface TextStreamChunk extends BaseStreamChunk {
  type: "text";
  text: string;
  subtitles?: SubtitleCue[];
  emojis?: EmojiCue[];
  highlights?: string[];
  done?: boolean;
}

export interface AudioStreamChunk extends BaseStreamChunk {
  type: "audio";
  mimeType: string;
  data: ArrayBuffer;
  spectrum?: number[];
  waveform?: number[];
  isFinal?: boolean;
}

export interface VisualStreamChunk extends BaseStreamChunk {
  type: "visual";
  descriptor: AvatarDescriptor;
}

export type StreamChunk = TextStreamChunk | AudioStreamChunk | VisualStreamChunk;

export interface StreamSnapshot {
  text: string;
  subtitles: SubtitleCue[];
  emojis: EmojiCue[];
  highlights: string[];
  audio: {
    mimeType: string;
    buffer: ArrayBuffer;
    spectrum: number[];
    waveform: number[];
  } | null;
  avatar?: AvatarDescriptor;
  transport: StreamTransport;
  createdAt: number;
}
