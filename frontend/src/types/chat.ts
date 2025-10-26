import type { SerializedAttachment } from "./attachments";
import type { KnowledgeSnippet } from "./knowledge";

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
  status?: "streaming" | "done" | "error";
  provider?: string;
  latencyMs?: number;
  tokenCount?: number;
}
