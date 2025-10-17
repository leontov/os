import type { KnowledgeSnippet } from "../types/knowledge";
import type { KnowledgeSearchOptions, KnowledgeStatus } from "../types/knowledge-service";
import {
  fetchLocalKnowledgeStatus,
  getLocalKnowledgeError,
  isLocalKnowledgeBundleAvailable,
  searchLocalKnowledge,
  sendLocalKnowledgeFeedback,
  teachLocalKnowledge,
} from "./local-knowledge";

const DEFAULT_ENDPOINT = "/api/knowledge/search";

type KnowledgeStrategy = "local" | "remote" | "hybrid";

interface KnowledgeConfiguration {
  strategy: KnowledgeStrategy;
  remoteEndpoint: string | null;
}

const resolveEnvValue = (key: string): string | undefined => {
  const importMetaEnv = typeof import.meta !== "undefined" ? (import.meta as any).env ?? {} : {};
  const metaValue = typeof importMetaEnv[key] === "string" ? (importMetaEnv[key] as string) : undefined;
  if (metaValue && metaValue.trim()) {
    return metaValue;
  }
  if (typeof process !== "undefined" && process.env && typeof process.env[key] === "string") {
    return process.env[key];
  }
  return undefined;
};

const resolveKnowledgeConfiguration = (): KnowledgeConfiguration => {
  const rawMode = resolveEnvValue("VITE_KNOWLEDGE_MODE")?.trim().toLowerCase() ?? "";
  const rawEndpoint = resolveEnvValue("VITE_KNOWLEDGE_API")?.trim() ?? "";

  const explicitRemoteEndpoint = rawEndpoint && rawEndpoint.toLowerCase() !== "local" ? rawEndpoint : "";

  if (rawMode === "remote") {
    return {
      strategy: "remote",
      remoteEndpoint: explicitRemoteEndpoint || DEFAULT_ENDPOINT,
    };
  }

  if (rawMode === "local") {
    return {
      strategy: explicitRemoteEndpoint ? "local" : "local",
      remoteEndpoint: explicitRemoteEndpoint || null,
    };
  }

  if (explicitRemoteEndpoint) {
    return {
      strategy: "hybrid",
      remoteEndpoint: explicitRemoteEndpoint,
    };
  }

  return {
    strategy: "local",
    remoteEndpoint: null,
  };
};

const knowledgeConfig = resolveKnowledgeConfiguration();

const resolveBaseUrl = (endpoint: string): URL => {
  const origin = typeof window !== "undefined" && window.location ? window.location.origin : "http://localhost";
  try {
    if (endpoint.startsWith("http")) {
      return new URL(endpoint);
    }
    return new URL(endpoint, origin);
  } catch {
    return new URL(DEFAULT_ENDPOINT, origin);
  }
};

const resolveRemotePaths = (endpoint: string | null) => {
  if (!endpoint) {
    return {
      baseUrl: null,
      rootPath: null,
      healthEndpoint: null,
    };
  }

  const baseUrl = resolveBaseUrl(endpoint);
  const basePath = baseUrl.pathname.endsWith("/search")
    ? baseUrl.pathname.slice(0, -"search".length)
    : baseUrl.pathname.replace(/[^/]+$/, "");
  const rootPath = basePath.endsWith("/") ? basePath : `${basePath}/`;
  const healthEndpoint = `${baseUrl.origin}${rootPath}healthz`;

  return { baseUrl, rootPath, healthEndpoint };
};

const { baseUrl, rootPath, healthEndpoint } = resolveRemotePaths(knowledgeConfig.remoteEndpoint);

const remoteComponents = baseUrl && rootPath && healthEndpoint ? { baseUrl, rootPath, healthEndpoint } : null;

const remoteEnabled = knowledgeConfig.strategy !== "local" && Boolean(remoteComponents);
const remoteFallbackAllowed = knowledgeConfig.strategy === "hybrid" && Boolean(remoteComponents);

const ensureRemoteAvailable = () => {
  if (!knowledgeConfig.remoteEndpoint || !remoteComponents) {
    throw new Error("Удалённый сервис знаний отключён.");
  }
};

const remoteEndpointBase = () => {
  ensureRemoteAvailable();
  const base = knowledgeConfig.remoteEndpoint as string;
  return base.endsWith("/") ? base.slice(0, -1) : base;
};

const remoteHealthEndpoint = (): string => {
  ensureRemoteAvailable();
  return remoteComponents!.healthEndpoint as string;
};

const isAbortError = (error: unknown): error is DOMException =>
  error instanceof DOMException && error.name === "AbortError";

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
  ensureRemoteAvailable();
  const params = new URLSearchParams({ q: query });
  if (options?.topK && Number.isFinite(options.topK)) {
    params.set("limit", String(options.topK));
  }
  const suffix = params.toString();
  const base = remoteEndpointBase();
  return suffix ? `${base}?${suffix}` : base;
};

const searchRemoteKnowledge = async (
  query: string,
  options?: KnowledgeSearchOptions,
): Promise<KnowledgeSnippet[]> => {
  ensureRemoteAvailable();

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
    if (isAbortError(error)) {
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
  } catch {
    throw new Error("Сервис знаний вернул некорректный ответ.");
  }

  if (!payload || typeof payload !== "object" || !Array.isArray((payload as Record<string, unknown>).snippets)) {
    return [];
  }

  const snippets = (payload as { snippets: unknown[] }).snippets
    .map((snippet, index) => normaliseSnippet(snippet, index))
    .filter((snippet): snippet is KnowledgeSnippet => Boolean(snippet));

  return snippets;
};

const fetchRemoteKnowledgeStatus = async (): Promise<KnowledgeStatus> => {
  ensureRemoteAvailable();

  let response: Response;
  try {
    response = await fetch(remoteHealthEndpoint(), { cache: "no-store" });
  } catch {
    throw new Error("Сервис знаний недоступен");
  }

  if (!response.ok) {
    throw new Error(`Сервис знаний недоступен: ${response.status}`);
  }

  try {
    const payload = (await response.json()) as Record<string, unknown>;
    const status = typeof payload.status === "string" ? payload.status : "unknown";
    const documents = typeof payload.documents === "number" ? payload.documents : Number(payload.documents ?? 0);
    const timestamp = typeof payload.generatedAt === "string" ? payload.generatedAt : undefined;
    return {
      status,
      documents: Number.isFinite(documents) ? documents : 0,
      timestamp,
    };
  } catch {
    throw new Error("Сервис знаний вернул некорректный ответ");
  }
};

export async function searchKnowledge(query: string, options?: KnowledgeSearchOptions): Promise<KnowledgeSnippet[]> {
  const preferLocal = knowledgeConfig.strategy !== "remote";

  if (preferLocal) {
    try {
      const localResults = await searchLocalKnowledge(query, options);
      if (localResults.length || !remoteFallbackAllowed) {
        return localResults;
      }
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      if (!remoteFallbackAllowed) {
        throw error;
      }
      const localReason = error instanceof Error ? error.message : getLocalKnowledgeError();
      console.warn("[knowledge] Локальный поиск знаний недоступен:", localReason);
    }
  }

  if (!remoteEnabled) {
    return [];
  }

  return searchRemoteKnowledge(query, options);
}

export async function sendKnowledgeFeedback(
  rating: "good" | "bad",
  q: string,
  a: string,
): Promise<void> {
  if (knowledgeConfig.strategy !== "remote") {
    await sendLocalKnowledgeFeedback();
  }

  if (!remoteEnabled) {
    return;
  }

  const params = new URLSearchParams({ rating, q, a });
  const endpoint = `${remoteHealthEndpoint().replace(/healthz$/, "feedback")}?${params.toString()}`;
  try {
    await fetch(endpoint, { method: "GET", cache: "no-store" });
  } catch {
    // ignore network errors for auxiliary feedback channel
  }
}

export async function teachKnowledge(q: string, a: string): Promise<void> {
  if (knowledgeConfig.strategy !== "remote") {
    await teachLocalKnowledge();
  }

  if (!remoteEnabled) {
    return;
  }

  const params = new URLSearchParams({ q, a });
  const endpoint = `${remoteHealthEndpoint().replace(/healthz$/, "teach")}?${params.toString()}`;
  try {
    await fetch(endpoint, { method: "GET", cache: "no-store" });
  } catch {
    // ignore network errors for auxiliary teach channel
  }
}

export async function fetchKnowledgeStatus(): Promise<KnowledgeStatus> {
  const preferLocal = knowledgeConfig.strategy !== "remote";

  if (preferLocal) {
    try {
      return await fetchLocalKnowledgeStatus();
    } catch (error) {
      if (!remoteEnabled || isAbortError(error)) {
        throw error;
      }
      const reason = error instanceof Error ? error.message : getLocalKnowledgeError();
      console.warn("[knowledge] Не удалось получить локальный статус знаний:", reason);
    }
  }

  if (!remoteEnabled) {
    return {
      status: isLocalKnowledgeBundleAvailable() ? "local" : "unavailable",
      documents: 0,
    };
  }

  return fetchRemoteKnowledgeStatus();
}

export const knowledgeStrategy = knowledgeConfig.strategy;

export type { KnowledgeSearchOptions, KnowledgeStatus } from "../types/knowledge-service";
