export type ChatRole = "user" | "assistant";

import type { SerializedAttachment } from "./attachments";
import type { KnowledgeSnippet } from "./knowledge";

export interface ChatAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  isoTimestamp?: string;
  modeLabel?: string;
  modeValue?: string;

  attachments?: ChatAttachment[];

  context?: KnowledgeSnippet[];
  contextError?: string;
  attachments?: SerializedAttachment[];
}
