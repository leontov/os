import type { PopularGptRecommendation, WhatsNewHighlight } from "../types/recommendations";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

const POPULAR_GPTS_ENDPOINT = "/api/recommendations/popular-gpts";
const WHATS_NEW_ENDPOINT = "/api/recommendations/whats-new";

const buildUrl = (endpoint: string) => `${API_BASE_URL}${endpoint}`;

const parseString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  return undefined;
};

const normalisePopularGpt = (
  value: unknown,
  index: number,
): PopularGptRecommendation | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const title = parseString(raw.title) ?? `GPT #${index + 1}`;
  const description = parseString(raw.description) ?? "";
  const prompt = parseString(raw.prompt) ?? "";
  const id = parseString(raw.id) ?? `popular-${index + 1}`;

  if (!prompt) {
    return null;
  }

  return {
    id,
    title,
    description,
    prompt,
    badge: parseString(raw.badge),
    author: parseString(raw.author),
  } satisfies PopularGptRecommendation;
};

const normaliseWhatsNew = (
  value: unknown,
  index: number,
): WhatsNewHighlight | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const title = parseString(raw.title) ?? `Новое ${index + 1}`;
  const summary = parseString(raw.summary) ?? "";
  const prompt = parseString(raw.prompt);
  const link = parseString(raw.link);
  const id = parseString(raw.id) ?? `update-${index + 1}`;

  if (!summary) {
    return null;
  }

  return {
    id,
    title,
    summary,
    prompt,
    link,
    publishedAtIso: parseString(raw.publishedAtIso),
  } satisfies WhatsNewHighlight;
};

const safeJson = async (response: Response): Promise<unknown> => {
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    console.warn("[recommendations] Failed to parse JSON", error);
    return null;
  }
};

export const fetchPopularGpts = async (): Promise<PopularGptRecommendation[]> => {
  try {
    const response = await fetch(buildUrl(POPULAR_GPTS_ENDPOINT), { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Unexpected status ${response.status}`);
    }

    const payload = await safeJson(response);
    if (!Array.isArray(payload)) {
      console.warn("[recommendations] Unexpected payload for popular GPTs", payload);
      return [];
    }

    return payload
      .map((item, index) => normalisePopularGpt(item, index))
      .filter((item): item is PopularGptRecommendation => Boolean(item));
  } catch (error) {
    console.warn("[recommendations] Unable to fetch popular GPTs", error);
    return [];
  }
};

export const fetchWhatsNewHighlights = async (): Promise<WhatsNewHighlight[]> => {
  try {
    const response = await fetch(buildUrl(WHATS_NEW_ENDPOINT), { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Unexpected status ${response.status}`);
    }

    const payload = await safeJson(response);
    if (!Array.isArray(payload)) {
      console.warn("[recommendations] Unexpected payload for what's new", payload);
      return [];
    }

    return payload
      .map((item, index) => normaliseWhatsNew(item, index))
      .filter((item): item is WhatsNewHighlight => Boolean(item));
  } catch (error) {
    console.warn("[recommendations] Unable to fetch what's new feed", error);
    return [];
  }
};
