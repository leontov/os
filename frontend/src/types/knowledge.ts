export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  snippet: string;
  score: number;
  source?: string;
}

export interface KnowledgeSearchResponse {
  query: string;
  documents: KnowledgeDocument[];
}
