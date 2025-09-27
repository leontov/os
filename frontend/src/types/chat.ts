export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
}

export interface PromptScenario {
  title: string;
  description: string;
  prompt: string;
}
