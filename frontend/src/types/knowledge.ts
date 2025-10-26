export type KnowledgeSourceType = "google-drive" | "notion" | "local-pdf" | "local" | "remote" | "unknown";

export type KnowledgeConfidence = "high" | "medium" | "low";

export interface KnowledgeSnippet {
  id: string;
  title: string;
  content: string;
  score: number;
  source?: string;
  url?: string;
  citation?: string;
  citations?: string[];
  highlights?: string[];
  connectorId?: string;
  sourceType?: KnowledgeSourceType;
  confidence?: KnowledgeConfidence;
}

export interface KnowledgeSearchResponse {
  snippets: KnowledgeSnippet[];
}
