export type ChatRole = "user" | "assistant";

export interface ChatAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  text: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  attachments?: ChatAttachment[];
}
