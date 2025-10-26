export const KNOWLEDGE_SNIPPET_MIME = "application/x-kolibri-snippet";

export interface DraggedKnowledgeSnippet {
  type: "knowledge-snippet";
  snippet: {
    id: string;
    title: string;
    content: string;
    source?: string;
    citation?: string;
  };
}

