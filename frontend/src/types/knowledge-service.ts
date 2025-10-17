export interface KnowledgeSearchOptions {
  signal?: AbortSignal;
  topK?: number;
}

export interface KnowledgeStatus {
  status: string;
  documents: number;
  timestamp?: string;
}
