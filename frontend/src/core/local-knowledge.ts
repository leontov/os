import type { KnowledgeSnippet } from "../types/knowledge";
import type { KnowledgeSearchOptions, KnowledgeStatus } from "../types/knowledge-service";
import { knowledgeAvailable, knowledgeError, knowledgeUrl } from "virtual:kolibri-knowledge";

interface LocalKnowledgeDocument extends KnowledgeSnippet {
  tokens: Map<string, number>;
  createdAt?: string;
  prompt?: string;
  answer?: string;
  weight?: number;
}

interface LearnedKnowledgeDocument extends LocalKnowledgeDocument {
  prompt: string;
  answer: string;
  createdAt: string;
  weight: number;
  source: string;
  sourceType: "local";
  confidence: "high";
}

interface LocalKnowledgeDataset {
  version: number;
  generatedAt?: string;
  documents: LocalKnowledgeDocument[];
}

interface PersistedLearnedDocument {
  id?: unknown;
  prompt?: unknown;
  answer?: unknown;
  createdAt?: unknown;
  title?: unknown;
  content?: unknown;
  source?: unknown;
  weight?: unknown;
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

const LEARNED_STORAGE_KEY = "kolibri:learned-knowledge";
const LEARNED_MAX_DOCUMENTS = 64;
const LEARNED_MAX_CONTENT_LENGTH = 3000;
const LEARNED_SOURCE_LABEL = "Личная память";
const LEARNED_MIN_WEIGHT = 0.25;

const createTokenStripper = () => {
  try {
    return new RegExp("[^\\p{L}\\p{N}]+", "gu");
  } catch {
    return /[^a-z0-9]+/gi;
  }
};

const tokenStripper = createTokenStripper();

const normaliseForComparison = (value: string): string =>
  normaliseText(value)
    .replace(/\s+/g, " ")
    .toLowerCase();

const clipContent = (value: string): string => {
  if (!value) {
    return "";
  }
  if (value.length <= LEARNED_MAX_CONTENT_LENGTH) {
    return value;
  }
  return `${value.slice(0, LEARNED_MAX_CONTENT_LENGTH - 1)}…`;
};

const summarisePromptForTitle = (prompt: string): string => {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return "Сохранённая заметка";
  }
  if (trimmed.length <= 96) {
    return trimmed;
  }
  return `${trimmed.slice(0, 93)}…`;
};

const buildLearnedContent = (prompt: string, answer: string): string => {
  const trimmedAnswer = answer.trim();
  const trimmedPrompt = prompt.trim();
  if (!trimmedAnswer && !trimmedPrompt) {
    return "";
  }
  if (!trimmedPrompt) {
    return clipContent(trimmedAnswer);
  }
  if (!trimmedAnswer) {
    return clipContent(`Вопрос: ${trimmedPrompt}`);
  }
  return clipContent(`${trimmedAnswer}\n\nВопрос: ${trimmedPrompt}`);
};

const generateStableId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const resolveStorage = (): Storage | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    if (!("localStorage" in window)) {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
};

const learnedDocumentsCache: LearnedKnowledgeDocument[] = [];
let learnedCacheInitialised = false;

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
    .filter((token) => token.length >= 2 || /\d/.test(token));
};

const countTokens = (text: string): Map<string, number> => {
  const tokens = tokenize(text);
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
};

const readPersistedLearnedDocuments = (): LearnedKnowledgeDocument[] => {
  const storage = resolveStorage();
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(LEARNED_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as PersistedLearnedDocument[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    const restored: LearnedKnowledgeDocument[] = [];

    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const prompt = typeof entry.prompt === "string" ? normaliseText(entry.prompt) : "";
      const answer = typeof entry.answer === "string" ? normaliseText(entry.answer) : "";
      if (!prompt || !answer) {
        continue;
      }

      const tokens = countTokens(`${prompt} ${answer}`);
      if (!tokens.size) {
        continue;
      }

      const id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : `memory-${generateStableId()}`;
      const createdAt =
        typeof entry.createdAt === "string" && entry.createdAt.trim() ? entry.createdAt.trim() : new Date().toISOString();
      const weightValue =
        typeof entry.weight === "number" && Number.isFinite(entry.weight)
          ? Math.max(LEARNED_MIN_WEIGHT, entry.weight)
          : 1;

      const title =
        typeof entry.title === "string" && entry.title.trim()
          ? entry.title.trim()
          : summarisePromptForTitle(prompt);
      const content =
        typeof entry.content === "string" && entry.content.trim()
          ? clipContent(entry.content.trim())
          : buildLearnedContent(prompt, answer);
      const source =
        typeof entry.source === "string" && entry.source.trim() ? entry.source.trim() : LEARNED_SOURCE_LABEL;

      restored.push({
        id,
        title,
        content,
        source,
        sourceType: "local",
        confidence: "high",
        score: 1,
        tokens,
        prompt,
        answer,
        createdAt,
        weight: weightValue,
      });
    }

    restored.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
    if (restored.length > LEARNED_MAX_DOCUMENTS) {
      restored.splice(LEARNED_MAX_DOCUMENTS);
    }
    return restored;
  } catch (error) {
    console.warn("[local-knowledge] Не удалось прочитать личную память Kolibri", error);
    return [];
  }
};

const setLearnedDocuments = (docs: LearnedKnowledgeDocument[]) => {
  learnedDocumentsCache.splice(0, learnedDocumentsCache.length, ...docs);
  learnedCacheInitialised = true;
};

const getLearnedDocumentsMutable = (): LearnedKnowledgeDocument[] => {
  if (!learnedCacheInitialised) {
    setLearnedDocuments(readPersistedLearnedDocuments());
  }
  return learnedDocumentsCache;
};

const getLearnedDocumentsSnapshot = (): LearnedKnowledgeDocument[] => {
  const docs = getLearnedDocumentsMutable();
  return docs.slice();
};

const persistLearnedDocuments = (docs: LearnedKnowledgeDocument[]): void => {
  docs.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  while (docs.length > LEARNED_MAX_DOCUMENTS) {
    docs.pop();
  }

  setLearnedDocuments(docs);

  const storage = resolveStorage();
  if (!storage) {
    return;
  }

  try {
    const payload = docs.map((doc) => ({
      id: doc.id,
      prompt: doc.prompt,
      answer: doc.answer,
      createdAt: doc.createdAt,
      title: doc.title,
      content: clipContent(doc.content),
      source: doc.source,
      weight: doc.weight,
    }));
    storage.setItem(LEARNED_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("[local-knowledge] Не удалось сохранить личную память Kolibri", error);
  }
};

const getLatestLearnedTimestamp = (docs: LearnedKnowledgeDocument[]): string | undefined => {
  let latest: string | undefined;
  for (const doc of docs) {
    if (!doc.createdAt) {
      continue;
    }
    const time = Date.parse(doc.createdAt);
    if (!Number.isFinite(time)) {
      continue;
    }
    if (!latest || time > Date.parse(latest)) {
      latest = doc.createdAt;
    }
  }
  return latest;
};

let datasetPromise: Promise<LocalKnowledgeDataset> | null = null;

const buildDataset = async (): Promise<LocalKnowledgeDataset> => {
  if (!knowledgeUrl) {
    return { version: 1, generatedAt: undefined, documents: [] };
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
  const learnedDocs = getLearnedDocumentsSnapshot();
  const combinedDocuments = [...learnedDocs, ...dataset.documents];

  if (!combinedDocuments.length) {
    return [];
  }

  const limit = options?.topK && Number.isFinite(options.topK) ? Math.max(1, Number(options.topK)) : 5;
  const queryCounts = countTokens(trimmed);
  if (queryCounts.size === 0) {
    return [];
  }

  const queryTokens = Array.from(queryCounts.keys());
  const normalisedQuery = normaliseForComparison(trimmed);

  const scoreDocument = (
    doc: LocalKnowledgeDocument,
  ): { doc: LocalKnowledgeDocument; score: number } | null => {
    let score = 0;
    for (const token of queryTokens) {
      const docFrequency = doc.tokens.get(token);
      if (!docFrequency) {
        continue;
      }
      const queryFrequency = queryCounts.get(token) ?? 1;
      score += docFrequency * queryFrequency;
    }

    if (score <= 0) {
      return null;
    }

    const weight = doc.weight && Number.isFinite(doc.weight) ? Math.max(LEARNED_MIN_WEIGHT, doc.weight) : 1;
    if (weight !== 1) {
      score *= weight;
    }

    if (doc.prompt) {
      const promptKey = normaliseForComparison(doc.prompt);
      if (promptKey.includes(normalisedQuery)) {
        score *= 1.2;
      }
    }

    if (doc.createdAt) {
      const createdAtTime = Date.parse(doc.createdAt);
      if (Number.isFinite(createdAtTime)) {
        const ageDays = Math.max(0, (Date.now() - createdAtTime) / (1000 * 60 * 60 * 24));
        if (ageDays < 7) {
          score *= 1.15;
        } else if (ageDays < 30) {
          score *= 1.05;
        }
      }
    }

    return { doc, score };
  };

  const projectSnippet = (entry: { doc: LocalKnowledgeDocument; score: number }): KnowledgeSnippet => {
    const { doc, score } = entry;
    return {
      id: doc.id,
      title: doc.title,
      content: doc.content,
      score,
      source: doc.source,
      url: doc.url,
      citation: doc.citation,
      citations: doc.citations,
      highlights: doc.highlights,
      connectorId: doc.connectorId,
      sourceType: doc.sourceType ?? "local",
      confidence: doc.confidence ?? "high",
    };
  };

  const rankDocuments = (docs: LocalKnowledgeDocument[], signal?: AbortSignal): KnowledgeSnippet[] => {
    const scored: Array<{ doc: LocalKnowledgeDocument; score: number }> = [];

    if (signal) {
      let aborted = false;
      const listener = () => {
        aborted = true;
      };
      signal.addEventListener("abort", listener, { once: true });
      try {
        for (const doc of docs) {
          if (aborted) {
            throw new DOMException("Операция отменена", "AbortError");
          }
          const entry = scoreDocument(doc);
          if (entry) {
            scored.push(entry);
          }
        }
      } finally {
        signal.removeEventListener("abort", listener);
      }
    } else {
      for (const doc of docs) {
        const entry = scoreDocument(doc);
        if (entry) {
          scored.push(entry);
        }
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(projectSnippet);
  };

  return rankDocuments(combinedDocuments, options?.signal);
}

export async function fetchLocalKnowledgeStatus(): Promise<KnowledgeStatus> {
  const dataset = await ensureDataset();
  const learned = getLearnedDocumentsSnapshot();
  const staticDocuments = dataset.documents.length;
  const learnedDocuments = learned.length;

  if (!staticDocuments && !learnedDocuments) {
    return {
      status: knowledgeAvailable ? "empty" : "unavailable",
      documents: 0,
      timestamp: dataset.generatedAt,
    };
  }

  if (!staticDocuments && learnedDocuments) {
    return {
      status: "memory",
      documents: learnedDocuments,
      timestamp: getLatestLearnedTimestamp(learned),
    };
  }

  const totalDocuments = staticDocuments + learnedDocuments;
  const timestamp = dataset.generatedAt ?? getLatestLearnedTimestamp(learned);

  return {
    status: learnedDocuments ? "local+memory" : "local",
    documents: totalDocuments,
    timestamp,
  };
}

export async function sendLocalKnowledgeFeedback(
  rating: "good" | "bad",
  prompt: string,
  answer: string,
): Promise<void> {
  const normalisedPrompt = normaliseText(prompt);
  const normalisedAnswer = normaliseText(answer);
  if (!normalisedPrompt || !normalisedAnswer) {
    return;
  }

  const docs = getLearnedDocumentsMutable();
  const promptKey = normaliseForComparison(normalisedPrompt);
  const answerKey = normaliseForComparison(normalisedAnswer);

  const index = docs.findIndex(
    (entry) => normaliseForComparison(entry.prompt) === promptKey && normaliseForComparison(entry.answer) === answerKey,
  );

  if (index === -1) {
    return;
  }

  const doc = docs[index];
  const nowIso = new Date().toISOString();

  if (rating === "good") {
    doc.weight = Math.min(4, (doc.weight ?? 1) + 0.5);
    doc.createdAt = nowIso;
    docs.splice(index, 1);
    docs.unshift(doc);
    persistLearnedDocuments(docs);
    return;
  }

  const nextWeight = (doc.weight ?? 1) - 0.75;
  if (nextWeight <= LEARNED_MIN_WEIGHT) {
    docs.splice(index, 1);
  } else {
    doc.weight = Math.max(LEARNED_MIN_WEIGHT, nextWeight);
    doc.createdAt = nowIso;
    docs.splice(index, 1);
    docs.unshift(doc);
  }
  persistLearnedDocuments(docs);
}

export async function teachLocalKnowledge(prompt: string, answer: string): Promise<void> {
  const normalisedPrompt = normaliseText(prompt);
  const normalisedAnswer = normaliseText(answer);
  if (!normalisedPrompt || !normalisedAnswer) {
    return;
  }

  const combinedTokens = countTokens(`${normalisedPrompt} ${normalisedAnswer}`);
  if (!combinedTokens.size) {
    return;
  }

  const docs = getLearnedDocumentsMutable();
  const promptKey = normaliseForComparison(normalisedPrompt);
  const answerKey = normaliseForComparison(normalisedAnswer);
  const nowIso = new Date().toISOString();

  const existingIndex = docs.findIndex(
    (entry) => normaliseForComparison(entry.prompt) === promptKey && normaliseForComparison(entry.answer) === answerKey,
  );

  if (existingIndex !== -1) {
    const existing = docs.splice(existingIndex, 1)[0];
    existing.tokens = combinedTokens;
    existing.title = summarisePromptForTitle(normalisedPrompt);
    existing.content = buildLearnedContent(normalisedPrompt, normalisedAnswer);
    existing.prompt = normalisedPrompt;
    existing.answer = normalisedAnswer;
    existing.createdAt = nowIso;
    existing.weight = Math.min(4, (existing.weight ?? 1) + 0.25);
    docs.unshift(existing);
    persistLearnedDocuments(docs);
    return;
  }

  const id = `memory-${generateStableId()}`;
  const title = summarisePromptForTitle(normalisedPrompt);
  const content = buildLearnedContent(normalisedPrompt, normalisedAnswer);

  const learnedEntry: LearnedKnowledgeDocument = {
    id,
    title,
    content,
    source: LEARNED_SOURCE_LABEL,
    sourceType: "local",
    confidence: "high",
    score: 1,
    tokens: combinedTokens,
    prompt: normalisedPrompt,
    answer: normalisedAnswer,
    createdAt: nowIso,
    weight: 1,
  };

  docs.unshift(learnedEntry);
  persistLearnedDocuments(docs);
}
