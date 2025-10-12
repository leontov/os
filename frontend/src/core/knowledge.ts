import type { KnowledgeSnippet } from "../types/knowledge";

export interface KnowledgeSearchOptions {
  signal?: AbortSignal;
  topK?: number;
}

const DEFAULT_ENDPOINT = "/api/knowledge/search";
const KNOWLEDGE_API_BASE = (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_KNOWLEDGE_API) || DEFAULT_ENDPOINT;

const normaliseSnippet = (value: unknown, index: number): KnowledgeSnippet | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" && raw.id.trim().length > 0 ? raw.id : `snippet-${index}`;
  const title = typeof raw.title === "string" && raw.title.trim().length > 0 ? raw.title : "Без названия";
  const content = typeof raw.content === "string" ? raw.content.trim() : "";
  const source = typeof raw.source === "string" && raw.source.trim().length > 0 ? raw.source : undefined;
  const scoreValue = typeof raw.score === "number" ? raw.score : Number(raw.score);
  const score = Number.isFinite(scoreValue) ? scoreValue : 0;

  if (!content) {
    return null;
  }

  return { id, title, content, source, score };
};

export const buildSearchUrl = (query: string, options?: KnowledgeSearchOptions): string => {
  const params = new URLSearchParams({ q: query });
  if (options?.topK && Number.isFinite(options.topK)) {
    params.set("limit", String(options.topK));
  }
  const suffix = params.toString();
  const base = KNOWLEDGE_API_BASE.endsWith("/") ? KNOWLEDGE_API_BASE.slice(0, -1) : KNOWLEDGE_API_BASE;
  return suffix ? `${base}?${suffix}` : base;
};

export async function searchKnowledge(query: string, options?: KnowledgeSearchOptions): Promise<KnowledgeSnippet[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const requestUrl = buildSearchUrl(trimmed, options);

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      signal: options?.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new Error("Не удалось выполнить поиск знаний: сеть недоступна.");
  }

  if (!response.ok) {
    throw new Error(`Поиск знаний недоступен: ${response.status} ${response.statusText}`.trim());
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error("Сервис знаний вернул некорректный ответ.");
  }

  if (!payload || typeof payload !== "object" || !Array.isArray((payload as Record<string, unknown>).snippets)) {
    return [];
  }

  const snippets = (payload as { snippets: unknown[] }).snippets
    .map((snippet, index) => normaliseSnippet(snippet, index))
    .filter((snippet): snippet is KnowledgeSnippet => Boolean(snippet));

  return snippets;
}
