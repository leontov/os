import type { KnowledgeSnippet } from "../types/knowledge";
import type { KnowledgeSearchOptions, KnowledgeStatus } from "../types/knowledge-service";
import { knowledgeAvailable, knowledgeError, knowledgeUrl } from "virtual:kolibri-knowledge";

interface LocalKnowledgeDocument extends KnowledgeSnippet {
  tokens: Map<string, number>;
}

interface LocalKnowledgeDataset {
  version: number;
  generatedAt?: string;
  documents: LocalKnowledgeDocument[];
}

interface RawKnowledgeDocument {
  id?: unknown;
  title?: unknown;
  content?: unknown;
  source?: unknown;
}

interface RawKnowledgePayload {
  version?: unknown;
  generatedAt?: unknown;
  documents?: unknown;
}

const WORD_SEPARATOR = /\s+/u;

const createTokenStripper = () => {
  try {
    return new RegExp("[^\\p{L}\\p{N}]+", "gu");
  } catch {
    return /[^a-z0-9]+/gi;
  }
};

const tokenStripper = createTokenStripper();

const normaliseText = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (typeof trimmed.normalize === "function") {
    return trimmed.normalize("NFKC");
  }
  return trimmed;
};

const tokenize = (text: string): string[] => {
  const normalised = normaliseText(text.toLowerCase());
  if (!normalised) {
    return [];
  }
  const stripped = normalised.replace(tokenStripper, " ");
  return stripped
    .split(WORD_SEPARATOR)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
};

const countTokens = (text: string): Map<string, number> => {
  const tokens = tokenize(text);
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
};

let datasetPromise: Promise<LocalKnowledgeDataset> | null = null;

const buildDataset = async (): Promise<LocalKnowledgeDataset> => {
  if (!knowledgeUrl) {
    throw new Error("Локальный индекс знаний недоступен: путь не задан.");
  }

  let response: Response;
  try {
    response = await fetch(knowledgeUrl, { cache: "force-cache" });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Не удалось загрузить локальный индекс знаний: ${reason}`);
  }

  if (!response.ok) {
    throw new Error(`Локальный индекс знаний недоступен: ${response.status} ${response.statusText}`.trim());
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Локальный индекс знаний повреждён (некорректный JSON).");
  }

  const raw = payload as RawKnowledgePayload;
  const documents: LocalKnowledgeDocument[] = [];

  if (Array.isArray(raw.documents)) {
    for (const entry of raw.documents) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const doc = entry as RawKnowledgeDocument;
      const id = typeof doc.id === "string" && doc.id.trim() ? doc.id.trim() : undefined;
      const title = typeof doc.title === "string" && doc.title.trim() ? doc.title.trim() : "Без названия";
      const content = typeof doc.content === "string" && doc.content.trim() ? doc.content.trim() : "";
      const source = typeof doc.source === "string" && doc.source.trim() ? doc.source.trim() : id;
      if (!id || !content) {
        continue;
      }
      const tokens = countTokens(`${title} ${content}`);
      if (tokens.size === 0) {
        continue;
      }
      documents.push({ id, title, content, source, score: 0, tokens });
    }
  }

  const generatedAt = typeof raw.generatedAt === "string" && raw.generatedAt.trim() ? raw.generatedAt : undefined;

  return { version: Number(raw.version) || 1, generatedAt, documents };
};

const ensureDataset = async (): Promise<LocalKnowledgeDataset> => {
  if (!datasetPromise) {
    datasetPromise = buildDataset().catch((error) => {
      datasetPromise = null;
      throw error;
    });
  }
  return datasetPromise;
};

export const isLocalKnowledgeBundleAvailable = (): boolean => knowledgeAvailable;

export const getLocalKnowledgeError = (): string | null => (knowledgeError ? knowledgeError.trim() || null : null);

export async function searchLocalKnowledge(
  query: string,
  options?: KnowledgeSearchOptions,
): Promise<KnowledgeSnippet[]> {
  if (options?.signal?.aborted) {
    throw new DOMException("Операция отменена", "AbortError");
  }

  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const dataset = await ensureDataset();
  if (!dataset.documents.length) {
    return [];
  }

  const limit = options?.topK && Number.isFinite(options.topK) ? Math.max(1, Number(options.topK)) : 5;
  const queryCounts = countTokens(trimmed);
  if (queryCounts.size === 0) {
    return [];
  }

  const queryTokens = Array.from(queryCounts.keys());

  if (options?.signal) {
    let aborted = false;
    const listener = () => {
      aborted = true;
    };
    options.signal.addEventListener("abort", listener, { once: true });
    try {
      const scored = dataset.documents
        .map((doc) => {
          if (aborted) {
            throw new DOMException("Операция отменена", "AbortError");
          }
          let score = 0;
          for (const token of queryTokens) {
            const docFrequency = doc.tokens.get(token);
            if (docFrequency) {
              const queryFrequency = queryCounts.get(token) ?? 1;
              score += docFrequency * queryFrequency;
            }
          }
          return score > 0 ? { ...doc, score } : null;
        })
        .filter((entry): entry is LocalKnowledgeDocument & { score: number } => entry !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((snippet) => ({
          id: snippet.id,
          title: snippet.title,
          content: snippet.content,
          score: snippet.score,
          source: snippet.source,
        }));

      return scored;
    } finally {
      options.signal.removeEventListener("abort", listener);
    }
  }

  const scored = dataset.documents
    .map((doc) => {
      let score = 0;
      for (const token of queryTokens) {
        const docFrequency = doc.tokens.get(token);
        if (docFrequency) {
          const queryFrequency = queryCounts.get(token) ?? 1;
          score += docFrequency * queryFrequency;
        }
      }
      return score > 0 ? { ...doc, score } : null;
    })
    .filter((entry): entry is LocalKnowledgeDocument & { score: number } => entry !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((snippet) => ({
      id: snippet.id,
      title: snippet.title,
      content: snippet.content,
      score: snippet.score,
      source: snippet.source,
    }));

  return scored;
}

export async function fetchLocalKnowledgeStatus(): Promise<KnowledgeStatus> {
  const dataset = await ensureDataset();
  const documents = dataset.documents.length;
  if (!documents) {
    return {
      status: knowledgeAvailable ? "empty" : "unavailable",
      documents: 0,
      timestamp: dataset.generatedAt,
    };
  }
  return {
    status: "local",
    documents,
    timestamp: dataset.generatedAt,
  };
}

export async function sendLocalKnowledgeFeedback(): Promise<void> {
  // Feedback is stored locally for future extension; currently it is a no-op to satisfy the interface.
}

export async function teachLocalKnowledge(): Promise<void> {
  // Offline knowledge updates are not persisted yet. This is intentionally left as a no-op for local mode.
}
