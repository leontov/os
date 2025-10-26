import type { KnowledgeSnippet } from "../types/knowledge";

export type KnowledgeConnectorProvider = "google-drive" | "notion" | "local-pdf";

export type KnowledgeConnectorStatus = "connected" | "disconnected" | "syncing";

export interface KnowledgeConnector {
  id: string;
  name: string;
  provider: KnowledgeConnectorProvider;
  status: KnowledgeConnectorStatus;
  lastSyncedIso?: string;
  offlineEnabled: boolean;
  offlineEntries: number;
  offlineBytes: number;
  supportsOffline: boolean;
  supportsSearch: boolean;
  error?: string | null;
}

export interface OfflineSearchOptions {
  limit?: number;
  excludeIds?: Iterable<string>;
}

interface UnifiedConnectorSDK {
  list(): Promise<KnowledgeConnector[]>;
  connect(provider: KnowledgeConnectorProvider): Promise<KnowledgeConnector>;
  disconnect(id: string): Promise<void>;
  sync(id: string): Promise<KnowledgeConnector>;
  enableOffline(id: string): Promise<KnowledgeConnector>;
  disableOffline(id: string): Promise<KnowledgeConnector>;
  searchOffline?(query: string, options?: OfflineSearchOptions): Promise<KnowledgeSnippet[]>;
}

interface ConnectorState extends KnowledgeConnector {
  cache: KnowledgeSnippet[];
}

const CONNECTOR_STORAGE_KEY = "kolibri:knowledge-connectors";

const connectorEventTarget = new EventTarget();

const SAMPLE_CACHES: Record<KnowledgeConnectorProvider, KnowledgeSnippet[]> = {
  "google-drive": [
    {
      id: "gd-policy",
      title: "Политика безопасности данных",
      content:
        "Документ описывает уровни доступа к корпоративным папкам Google Drive и процедуры запроса прав.",
      score: 0.78,
      source: "Google Drive",
      sourceType: "google-drive",
      connectorId: "google-drive",
      confidence: "medium",
      citation: "Google Drive / Security / Access Policy",
      highlights: [
        "Все запросы на доступ проходят через форму security-access@company.com.",
        "Права уровня editor выдаются только на время проекта и требуют продления каждые 30 дней.",
      ],
    },
  ],
  notion: [
    {
      id: "notion-onboarding",
      title: "Памятка по онбордингу",
      content:
        "Страница Notion содержит последовательность шагов, чек-лист оборудования и ссылки на инструкции.",
      score: 0.82,
      source: "Notion",
      sourceType: "notion",
      connectorId: "notion",
      confidence: "high",
      citation: "Notion / HR / Онбординг",
      highlights: [
        "На второй неделе запланирована встреча с ментором и ревью задач.",
      ],
    },
  ],
  "local-pdf": [
    {
      id: "pdf-guideline",
      title: "Инструкция по эксплуатации оборудования",
      content:
        "PDF содержит пошаговое описание запуска производственной линии и требования по технике безопасности.",
      score: 0.74,
      source: "Локальный PDF",
      sourceType: "local-pdf",
      connectorId: "local-pdf",
      confidence: "medium",
      citation: "Manuals/equipment_startup.pdf",
      highlights: [
        "Перед запуском необходимо пройти чек-лист из 12 пунктов и подтвердить выполнение подписью инженера.",
      ],
    },
  ],
};

const DEFAULT_CONNECTORS: ConnectorState[] = [
  {
    id: "google-drive",
    name: "Google Drive",
    provider: "google-drive",
    status: "disconnected",
    lastSyncedIso: undefined,
    offlineEnabled: false,
    offlineEntries: 0,
    offlineBytes: 0,
    supportsOffline: true,
    supportsSearch: true,
    error: null,
    cache: [],
  },
  {
    id: "notion",
    name: "Notion",
    provider: "notion",
    status: "disconnected",
    lastSyncedIso: undefined,
    offlineEnabled: false,
    offlineEntries: 0,
    offlineBytes: 0,
    supportsOffline: true,
    supportsSearch: true,
    error: null,
    cache: [],
  },
  {
    id: "local-pdf",
    name: "Локальные PDF",
    provider: "local-pdf",
    status: "disconnected",
    lastSyncedIso: undefined,
    offlineEnabled: false,
    offlineEntries: 0,
    offlineBytes: 0,
    supportsOffline: true,
    supportsSearch: true,
    error: null,
    cache: [],
  },
];

const resolveConnectorSDK = (): UnifiedConnectorSDK | null => {
  const candidate = (globalThis as typeof globalThis & {
    kolibriConnector?: Partial<UnifiedConnectorSDK>;
  }).kolibriConnector;

  if (!candidate) {
    return null;
  }

  const hasMethods =
    typeof candidate.list === "function" &&
    typeof candidate.connect === "function" &&
    typeof candidate.disconnect === "function" &&
    typeof candidate.sync === "function" &&
    typeof candidate.enableOffline === "function" &&
    typeof candidate.disableOffline === "function";

  if (!hasMethods) {
    return null;
  }

  return candidate as UnifiedConnectorSDK;
};

const sdk = resolveConnectorSDK();

type ConnectorStateSnapshot = Omit<ConnectorState, "cache"> & {
  cache?: KnowledgeSnippet[];
};

const readFallbackState = (): ConnectorState[] => {
  if (typeof window === "undefined" || !("localStorage" in window)) {
    return DEFAULT_CONNECTORS.map((connector) => ({ ...connector, cache: [...connector.cache] }));
  }

  try {
    const raw = window.localStorage.getItem(CONNECTOR_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_CONNECTORS.map((connector) => ({ ...connector, cache: [...connector.cache] }));
    }
    const parsed = JSON.parse(raw) as ConnectorStateSnapshot[];
    if (!Array.isArray(parsed)) {
      return DEFAULT_CONNECTORS.map((connector) => ({ ...connector, cache: [...connector.cache] }));
    }
    return parsed.map((entry) => ({
      ...DEFAULT_CONNECTORS.find((item) => item.id === entry.id)!,
      ...entry,
      cache: Array.isArray(entry.cache) ? entry.cache : [],
    }));
  } catch (error) {
    console.warn("[knowledge-connectors] Не удалось прочитать состояние коннекторов", error);
    return DEFAULT_CONNECTORS.map((connector) => ({ ...connector, cache: [...connector.cache] }));
  }
};

const writeFallbackState = (state: ConnectorState[]) => {
  if (typeof window === "undefined" || !("localStorage" in window)) {
    connectorEventTarget.dispatchEvent(new Event("change"));
    return;
  }

  try {
    const snapshot: ConnectorStateSnapshot[] = state.map((entry) => ({ ...entry }));
    window.localStorage.setItem(CONNECTOR_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn("[knowledge-connectors] Не удалось сохранить состояние", error);
  }

  connectorEventTarget.dispatchEvent(new Event("change"));
};

const calculateOfflineBytes = (snippets: KnowledgeSnippet[]): number => {
  return snippets.reduce((total, snippet) => total + snippet.content.length + snippet.title.length, 0);
};

const ensureFallbackState = (): ConnectorState[] => {
  const state = readFallbackState();
  if (!state.length) {
    return DEFAULT_CONNECTORS.map((connector) => ({ ...connector, cache: [...connector.cache] }));
  }
  return state;
};

const updateConnector = (
  state: ConnectorState[],
  id: string,
  updater: (connector: ConnectorState) => ConnectorState,
): ConnectorState[] => {
  return state.map((connector) => {
    if (connector.id !== id) {
      return connector;
    }
    return updater(connector);
  });
};

const mapPublicConnector = (connector: ConnectorState): KnowledgeConnector => ({
  id: connector.id,
  name: connector.name,
  provider: connector.provider,
  status: connector.status,
  lastSyncedIso: connector.lastSyncedIso,
  offlineEnabled: connector.offlineEnabled,
  offlineEntries: connector.offlineEntries,
  offlineBytes: connector.offlineBytes,
  supportsOffline: connector.supportsOffline,
  supportsSearch: connector.supportsSearch,
  error: connector.error ?? null,
});

export const subscribeToConnectorChanges = (listener: () => void): (() => void) => {
  connectorEventTarget.addEventListener("change", listener);
  return () => {
    connectorEventTarget.removeEventListener("change", listener);
  };
};

export const listKnowledgeConnectors = async (): Promise<KnowledgeConnector[]> => {
  if (sdk) {
    return sdk.list();
  }

  const state = ensureFallbackState();
  return state.map(mapPublicConnector);
};

export const connectKnowledgeConnector = async (
  provider: KnowledgeConnectorProvider,
): Promise<KnowledgeConnector> => {
  if (sdk) {
    return sdk.connect(provider);
  }

  const state = ensureFallbackState();
  const connector = state.find((entry) => entry.provider === provider);
  if (!connector) {
    throw new Error("Неизвестный источник знаний");
  }

  const cache = SAMPLE_CACHES[provider] ?? [];

  const nextState = updateConnector(state, connector.id, (current) => ({
    ...current,
    status: "connected",
    lastSyncedIso: new Date().toISOString(),
    offlineEnabled: cache.length > 0,
    offlineEntries: cache.length,
    offlineBytes: calculateOfflineBytes(cache),
    cache: cache.length ? cache.map((item) => ({ ...item })) : [],
    error: null,
  }));

  writeFallbackState(nextState);

  return mapPublicConnector(nextState.find((entry) => entry.id === connector.id)!);
};

export const disconnectKnowledgeConnector = async (id: string): Promise<void> => {
  if (sdk) {
    await sdk.disconnect(id);
    return;
  }

  const state = ensureFallbackState();
  const nextState = updateConnector(state, id, (current) => ({
    ...current,
    status: "disconnected",
    offlineEnabled: false,
    offlineEntries: 0,
    offlineBytes: 0,
    cache: [],
  }));

  writeFallbackState(nextState);
};

export const syncKnowledgeConnector = async (id: string): Promise<KnowledgeConnector> => {
  if (sdk) {
    return sdk.sync(id);
  }

  const state = ensureFallbackState();
  const connector = state.find((entry) => entry.id === id);
  if (!connector) {
    throw new Error("Неизвестный источник знаний");
  }

  const cache = connector.offlineEnabled ? connector.cache : [];
  const refreshedCache = cache.length ? cache.map((item) => ({ ...item, score: Math.min(0.95, item.score + 0.02) })) : [];

  const nextState = updateConnector(state, id, (current) => ({
    ...current,
    status: "connected",
    lastSyncedIso: new Date().toISOString(),
    offlineEntries: refreshedCache.length,
    offlineBytes: calculateOfflineBytes(refreshedCache),
    cache: refreshedCache,
    error: null,
  }));

  writeFallbackState(nextState);

  return mapPublicConnector(nextState.find((entry) => entry.id === id)!);
};

export const toggleKnowledgeConnectorOffline = async (id: string): Promise<KnowledgeConnector> => {
  if (sdk) {
    const connector = await listKnowledgeConnectors();
    const target = connector.find((entry) => entry.id === id);
    if (!target) {
      throw new Error("Неизвестный источник знаний");
    }
    if (target.offlineEnabled) {
      return sdk.disableOffline(id);
    }
    return sdk.enableOffline(id);
  }

  const state = ensureFallbackState();
  const connector = state.find((entry) => entry.id === id);
  if (!connector) {
    throw new Error("Неизвестный источник знаний");
  }

  const nextState = updateConnector(state, id, (current) => {
    if (current.offlineEnabled) {
      return {
        ...current,
        offlineEnabled: false,
        offlineEntries: 0,
        offlineBytes: 0,
        cache: [],
      };
    }

    const cache = SAMPLE_CACHES[current.provider] ?? [];
    return {
      ...current,
      offlineEnabled: true,
      cache: cache.map((item) => ({ ...item })),
      offlineEntries: cache.length,
      offlineBytes: calculateOfflineBytes(cache),
    };
  });

  writeFallbackState(nextState);

  return mapPublicConnector(nextState.find((entry) => entry.id === id)!);
};

export const searchOfflineCaches = async (
  query: string,
  options?: OfflineSearchOptions,
): Promise<KnowledgeSnippet[]> => {
  if (sdk && typeof sdk.searchOffline === "function") {
    return sdk.searchOffline(query, options);
  }

  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const limit = options?.limit && Number.isFinite(options.limit) ? Math.max(1, Number(options.limit)) : 5;
  const excludeIds = options?.excludeIds ? new Set(options.excludeIds) : new Set<string>();
  const state = ensureFallbackState();

  const lowerQuery = trimmed.toLowerCase();
  const results: KnowledgeSnippet[] = [];

  for (const connector of state) {
    if (!connector.offlineEnabled || !connector.cache.length) {
      continue;
    }

    for (const snippet of connector.cache) {
      if (excludeIds.has(snippet.id)) {
        continue;
      }
      const haystack = `${snippet.title} ${snippet.content}`.toLowerCase();
      if (!haystack.includes(lowerQuery)) {
        continue;
      }
      results.push({
        ...snippet,
        connectorId: connector.id,
        sourceType: connector.provider,
        score: Math.max(snippet.score, 0.6),
      });
      if (results.length >= limit) {
        return results;
      }
    }
  }

  return results;
};

export const formatConnectorStatus = (status: KnowledgeConnectorStatus): string => {
  switch (status) {
    case "connected":
      return "Подключен";
    case "syncing":
      return "Синхронизация";
    default:
      return "Отключен";
  }
};

export const formatProviderLabel = (provider: KnowledgeConnectorProvider): string => {
  switch (provider) {
    case "google-drive":
      return "Google Drive";
    case "notion":
      return "Notion";
    case "local-pdf":
      return "Локальные PDF";
    default:
      return provider;
  }
};

export const getAvailableConnectorPresets = (): KnowledgeConnectorProvider[] => [
  "google-drive",
  "notion",
  "local-pdf",
];

