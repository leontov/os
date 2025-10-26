import type { SerializedAttachment } from "./attachments";
import type { KnowledgeSnippet } from "./knowledge";
import type { AvatarDescriptor, EmojiCue, SubtitleCue } from "./stream";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  isoTimestamp?: string;
  modeLabel?: string;
  modeValue?: string;
  attachments?: SerializedAttachment[];
  context?: KnowledgeSnippet[];
  contextError?: string;
  subtitles?: SubtitleCue[];
  emojiTimeline?: EmojiCue[];
  audioStreamId?: string;
  audioMimeType?: string;
  audioSpectrum?: number[];
  audioWaveform?: number[];
  avatar?: AvatarDescriptor;
  highlights?: string[];
  isStreaming?: boolean;
}
