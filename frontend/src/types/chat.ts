export type ChatRole = "user" | "assistant";

export type PatchMode = "explain" | "refactor";

export interface FileContext {
  path: string;
  content: string;
  language?: string;
  repository?: string;
}

export interface CodePatch {
  id: string;
  filePath: string;
  diff: string;
  mode: PatchMode;
  summary?: string;
  description?: string;
  createdAt?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  mode?: string;
  fileContext?: FileContext;
  patches?: CodePatch[];
  references?: string[];
}
