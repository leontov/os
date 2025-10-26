import {
  AlertCircle,
  AlertTriangle,
  BookOpenCheck,
  Bookmark,
  BookmarkCheck,
  BookmarkPlus,
  Clock3,
  Cloud,
  CloudOff,
  Database,
  ExternalLink,
  FileText,
  Globe,
  GripVertical,
  Loader2,
  Quote,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KnowledgeUsageOverview } from "../core/useKolibriChat";
import { searchKnowledge, type KnowledgeStatus } from "../core/knowledge";
import type { KnowledgeSnippet, KnowledgeConfidence, KnowledgeSourceType } from "../types/knowledge";
import StatusBar from "./StatusBar";
import useKnowledgeConnectors from "../core/useKnowledgeConnectors";
import type { KnowledgeConnectorProvider } from "../core/connectors";
import { KNOWLEDGE_SNIPPET_MIME } from "../core/drag";

interface KnowledgeViewProps {
  status: KnowledgeStatus | null;
  error?: string;
  isLoading?: boolean;
  onRefresh?: () => void;
  usage: KnowledgeUsageOverview;
}

interface SnippetCardProps {
  snippet: KnowledgeSnippet;
  isBookmarked: boolean;
  isExpanded: boolean;
  onToggleBookmark: (snippet: KnowledgeSnippet) => void;
  onToggleExpand: (id: string) => void;
}

const BOOKMARK_STORAGE_KEY = "kolibri:knowledge-bookmarks";
const MAX_BOOKMARKS = 20;

const DEFAULT_QUICK_QUERIES = [
  "Регламент безопасности",
  "Онбординг сотрудников",
  "Чек-лист запуска",
  "Политика качества",
];

const SOURCE_BADGES: Record<KnowledgeSourceType | "default", { label: string; className: string; icon: LucideIcon }> = {
  "google-drive": { label: "Google Drive", className: "bg-sky-500/15 text-sky-600", icon: Cloud },
  notion: { label: "Notion", className: "bg-emerald-500/15 text-emerald-600", icon: Database },
  "local-pdf": { label: "Локальные PDF", className: "bg-orange-500/15 text-orange-600", icon: FileText },
  local: { label: "Локальный индекс", className: "bg-violet-500/15 text-violet-600", icon: FileText },
  remote: { label: "Удалённый индекс", className: "bg-blue-500/15 text-blue-600", icon: Globe },
  unknown: { label: "Источник", className: "bg-slate-500/15 text-slate-600", icon: Sparkles },
  default: { label: "Источник", className: "bg-slate-500/15 text-slate-600", icon: Sparkles },
};

const CONFIDENCE_META: Record<KnowledgeConfidence, { label: string; description: string; className: string; icon: LucideIcon }> = {
  high: {
    label: "Высокая уверенность",
    description: "Фрагмент подтверждён несколькими совпадениями и свежими данными.",
    className: "bg-emerald-500/15 text-emerald-600",
    icon: ShieldCheck,
  },
  medium: {
    label: "Средняя уверенность",
    description: "Стоит свериться с источником, часть данных может требовать уточнения.",
    className: "bg-amber-500/15 text-amber-600",
    icon: ShieldQuestion,
  },
  low: {
    label: "Низкая уверенность",
    description: "Фрагмент найден по ограниченным совпадениям. Используйте осторожно.",
    className: "bg-rose-500/15 text-rose-600",
    icon: ShieldAlert,
  },
};

const CONNECTOR_ICONS: Record<KnowledgeConnectorProvider, LucideIcon> = {
  "google-drive": Cloud,
  notion: Database,
  "local-pdf": FileText,
};

const formatTimestamp = (iso?: string): string => {
  if (!iso) {
    return "—";
  }
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 Б";
  }
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  const precision = size >= 10 || index === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[index] ?? "КБ"}`;
};

const getSourceBadge = (type?: KnowledgeSourceType, fallback?: string) => {
  const normalized = type ?? "unknown";
  const config = SOURCE_BADGES[normalized] ?? SOURCE_BADGES.default;
  return {
    ...config,
    label: fallback && config.label === "Источник" ? fallback : config.label,
  };
};

const buildSnippetPayload = (snippet: KnowledgeSnippet) => ({
  type: "knowledge-snippet" as const,
  snippet: {
    id: snippet.id,
    title: snippet.title,
    content: snippet.content,
    source: snippet.source ?? getSourceBadge(snippet.sourceType).label,
    citation: snippet.citation ?? snippet.citations?.[0] ?? snippet.url,
  },
});

const handleSnippetDragStart = (event: React.DragEvent<HTMLElement>, snippet: KnowledgeSnippet) => {
  if (!event.dataTransfer) {
    return;
  }
  const payload = buildSnippetPayload(snippet);
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(KNOWLEDGE_SNIPPET_MIME, JSON.stringify(payload));
  event.dataTransfer.setData("application/json", JSON.stringify(payload));
  const source = payload.snippet.source ? `\nИсточник: ${payload.snippet.source}` : "";
  const citation = payload.snippet.citation ? `\nЦитата: ${payload.snippet.citation}` : "";
  event.dataTransfer.setData(
    "text/plain",
    `${snippet.title}\n\n${snippet.content}${source}${citation}`,
  );
};

const handleSnippetDragEnd = (event: React.DragEvent<HTMLElement>) => {
  event.dataTransfer?.clearData();
};

const SnippetCard = ({ snippet, isBookmarked, isExpanded, onToggleBookmark, onToggleExpand }: SnippetCardProps) => {
  const badge = getSourceBadge(snippet.sourceType, snippet.source);
  const ragCitations = snippet.citations?.length
    ? snippet.citations
    : snippet.citation
      ? [snippet.citation]
      : [];
  const confidenceMeta = snippet.confidence ? CONFIDENCE_META[snippet.confidence] : null;
  const scoreDisplay = Number.isFinite(snippet.score) ? snippet.score.toFixed(2) : "—";

  return (
    <article
      className="group glass-panel space-y-3 p-4 transition-shadow duration-200 hover:shadow-lg"
      draggable
      onDragStart={(event) => handleSnippetDragStart(event, snippet)}
      onDragEnd={handleSnippetDragEnd}
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-text-secondary/70">
            <GripVertical className="h-4 w-4 text-text-secondary/50" />
            <span>Релевантность: {scoreDisplay}</span>
          </div>
          <h3 className="text-base font-semibold text-text-primary">{snippet.title}</h3>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-semibold ${badge.className}`}>
              <badge.icon className="h-3.5 w-3.5" />
              {badge.label}
            </span>
            {confidenceMeta ? (
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-semibold ${confidenceMeta.className}`}>
                <confidenceMeta.icon className="h-3.5 w-3.5" />
                {confidenceMeta.label}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-start">
          {snippet.url ? (
            <a
              href={snippet.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 text-text-secondary transition-colors hover:border-primary/60 hover:text-primary"
              title="Открыть источник"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => onToggleBookmark(snippet)}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 transition-colors ${
              isBookmarked
                ? "border-accent/60 bg-accent/10 text-accent hover:bg-accent/20"
                : "text-text-secondary hover:border-primary/60 hover:text-primary"
            }`}
            title={isBookmarked ? "Удалить из закладок" : "Сохранить в закладки"}
          >
            {isBookmarked ? <BookmarkCheck className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <div className="relative">
        <p
          className={`whitespace-pre-line text-sm text-text-secondary ${
            isExpanded ? "" : "max-h-32 overflow-hidden"
          }`}
        >
          {snippet.content}
        </p>
        {!isExpanded ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />
        ) : null}
      </div>

      {snippet.highlights?.length ? (
        <div className="space-y-2 rounded-xl border border-border/60 bg-background-input/80 px-4 py-3">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-text-secondary/70">
            <Sparkles className="h-3.5 w-3.5" />
            Ключевые фрагменты
          </p>
          <ul className="space-y-2 text-sm text-text-primary">
            {snippet.highlights.map((highlight, index) => (
              <li key={`${snippet.id}-highlight-${index}`} className="rounded-lg bg-surface/60 px-3 py-2">
                {highlight}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {ragCitations.length ? (
        <div className="space-y-2 rounded-xl border border-border/60 bg-background-input/70 px-4 py-3 text-sm text-text-secondary">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-text-secondary/70">
            <Quote className="h-3.5 w-3.5" />
            Цитаты RAG
          </p>
          <ul className="space-y-2">
            {ragCitations.map((citation, index) => (
              <li key={`${snippet.id}-citation-${index}`} className="rounded-lg bg-surface/60 px-3 py-2">
                {citation}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {confidenceMeta ? (
        <p className="rounded-xl border border-dashed border-border/70 bg-surface/60 px-4 py-3 text-xs text-text-secondary">
          {confidenceMeta.description}
        </p>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-secondary/80">
        <span>Перетащите карточку в чат, чтобы вставить цитату или описание.</span>
        <button
          type="button"
          onClick={() => onToggleExpand(snippet.id)}
          className="text-primary transition-colors hover:text-primary/80"
        >
          {isExpanded ? "Свернуть" : "Показать полностью"}
        </button>
      </footer>
    </article>
  );
};

const KnowledgeView = ({ status, error, isLoading, onRefresh, usage }: KnowledgeViewProps) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KnowledgeSnippet[]>([]);
  const [searchError, setSearchError] = useState<string | undefined>();
  const [searchLoading, setSearchLoading] = useState(false);
  const [expandedSnippetId, setExpandedSnippetId] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<KnowledgeSnippet[]>([]);
  const [bookmarksReady, setBookmarksReady] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number>();

  const {
    connectors,
    isLoading: connectorsLoading,
    error: connectorsError,
    pendingId,
    connect,
    disconnect,
    toggleOffline,
    sync,
    getStatusLabel,
    getProviderLabel,
  } = useKnowledgeConnectors();

  useEffect(() => {
    if (typeof window === "undefined") {
      setBookmarksReady(true);
      return;
    }
    try {
      const stored = window.localStorage.getItem(BOOKMARK_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as KnowledgeSnippet[];
        if (Array.isArray(parsed)) {
          setBookmarks(parsed);
        }
      }
    } catch (reason) {
      console.warn("[knowledge-view] Не удалось загрузить закладки", reason);
    } finally {
      setBookmarksReady(true);
    }
  }, []);

  useEffect(() => {
    if (!bookmarksReady || typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(bookmarks));
    } catch (reason) {
      console.warn("[knowledge-view] Не удалось сохранить закладки", reason);
    }
  }, [bookmarks, bookmarksReady]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    if (!trimmed) {
      abortRef.current?.abort();
      abortRef.current = null;
      setResults([]);
      setSearchError(undefined);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    setSearchError(undefined);

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    debounceRef.current = window.setTimeout(() => {
      void searchKnowledge(trimmed, { topK: 8, signal: controller.signal })
        .then((snippets) => {
          setResults(snippets);
          setSearchLoading(false);
        })
        .catch((reason) => {
          if (controller.signal.aborted) {
            return;
          }
          const message = reason instanceof Error ? reason.message : "Не удалось выполнить поиск";
          setSearchError(message);
          setResults([]);
          setSearchLoading(false);
        })
        .finally(() => {
          if (controller.signal.aborted) {
            setSearchLoading(false);
          }
        });
    }, 260);

    return () => {
      controller.abort();
    };
  }, [query]);

  const bookmarkedIds = useMemo(() => new Set(bookmarks.map((item) => item.id)), [bookmarks]);

  const quickQueries = useMemo(() => {
    const suggestions = new Set(DEFAULT_QUICK_QUERIES);
    usage.recentEntries.slice(0, 3).forEach((entry) => {
      if (entry.conversationTitle.trim()) {
        suggestions.add(entry.conversationTitle.trim());
      }
    });
    connectors
      .filter((connector) => connector.status === "connected")
      .forEach((connector) => {
        suggestions.add(`Документы: ${connector.name}`);
      });
    return Array.from(suggestions).slice(0, 6);
  }, [usage.recentEntries, connectors]);

  const handleToggleBookmark = useCallback((snippet: KnowledgeSnippet) => {
    setBookmarks((previous) => {
      const exists = previous.some((entry) => entry.id === snippet.id);
      if (exists) {
        return previous.filter((entry) => entry.id !== snippet.id);
      }
      const next = [{ ...snippet }, ...previous.filter((entry) => entry.id !== snippet.id)];
      return next.slice(0, MAX_BOOKMARKS);
    });
  }, []);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedSnippetId((current) => (current === id ? null : id));
  }, []);

  const totalSources = useMemo(() => String(usage.uniqueSources ?? 0), [usage.uniqueSources]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <StatusBar status={status} error={error} isLoading={isLoading} onRefresh={onRefresh} />

      <section className="grid gap-4 md:grid-cols-3">
        <KnowledgeStat icon={Sparkles} label="Всего обращений" value={`${usage.totalReferences}`} />
        <KnowledgeStat icon={BookOpenCheck} label="Бесед с контекстом" value={`${usage.conversationsWithKnowledge}`} />
        <KnowledgeStat icon={Bookmark} label="Уникальные источники" value={totalSources} accent="accent" />
      </section>

      <section className="glass-panel grid gap-6 p-6 lg:grid-cols-[minmax(0,2.2fr),minmax(0,1fr)]">
        <div className="space-y-5">
          <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-text-secondary">Быстрый поиск</p>
              <h2 className="mt-1 text-lg font-semibold text-text-primary">Найдите нужный документ</h2>
            </div>
            {status?.timestamp ? (
              <span className="flex items-center gap-2 rounded-xl bg-background-input/70 px-3 py-2 text-xs text-text-secondary">
                <Clock3 className="h-4 w-4" />
                Снимок: {formatTimestamp(status.timestamp)}
              </span>
            ) : null}
          </header>

          <div className="flex flex-wrap gap-2">
            {quickQueries.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setQuery(item)}
                className="rounded-full border border-border/60 bg-background-input/70 px-3 py-1 text-xs font-semibold text-text-secondary transition-colors hover:border-primary/50 hover:text-primary"
              >
                {item}
              </button>
            ))}
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded-full border border-border/60 px-3 py-1 text-xs font-semibold text-text-secondary transition-colors hover:border-primary/60 hover:text-primary"
              >
                Очистить
              </button>
            ) : null}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary/60" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Например, политика качества или инструкция по онбордингу"
              className="w-full rounded-2xl border border-border-strong/60 bg-background-input/80 py-3 pl-12 pr-4 text-sm text-text-primary shadow-inner focus:border-primary focus:outline-none"
            />
          </div>

          {searchLoading ? (
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Выполняем поиск…
            </div>
          ) : null}

          {searchError ? (
            <p className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <AlertCircle className="h-4 w-4" />
              {searchError}
            </p>
          ) : null}

          <div className="space-y-4">
            {results.length ? (
              results.map((snippet) => (
                <SnippetCard
                  key={snippet.id}
                  snippet={snippet}
                  isBookmarked={bookmarkedIds.has(snippet.id)}
                  isExpanded={expandedSnippetId === snippet.id}
                  onToggleBookmark={handleToggleBookmark}
                  onToggleExpand={handleToggleExpand}
                />
              ))
            ) : !searchLoading && query.trim() ? (
              <p className="rounded-xl border border-dashed border-border-strong/60 p-4 text-sm text-text-secondary">
                Ничего не найдено. Попробуйте уточнить запрос или воспользуйтесь другим источником.
              </p>
            ) : (
              <p className="rounded-xl border border-dashed border-border-strong/60 p-4 text-sm text-text-secondary">
                Введите запрос или выберите один из быстрых сценариев, чтобы выполнить поиск по базе знаний и офлайн-кешу.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <header>
              <p className="text-xs uppercase tracking-[0.35em] text-text-secondary">Закладки</p>
              <h3 className="mt-1 text-lg font-semibold text-text-primary">Сохранённые фрагменты</h3>
            </header>
            {bookmarks.length ? (
              <div className="space-y-4">
                {bookmarks.map((snippet) => (
                  <SnippetCard
                    key={`bookmark-${snippet.id}`}
                    snippet={snippet}
                    isBookmarked
                    isExpanded={expandedSnippetId === snippet.id}
                    onToggleBookmark={handleToggleBookmark}
                    onToggleExpand={handleToggleExpand}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border-strong/60 p-4 text-sm text-text-secondary">
                Сохраняйте важные карточки знаний, чтобы быстро добавлять их в ответы и делиться с коллегами.
              </p>
            )}
          </div>

          <div className="space-y-4">
            <header>
              <p className="text-xs uppercase tracking-[0.35em] text-text-secondary">Последние обращения</p>
              <h3 className="mt-1 text-lg font-semibold text-text-primary">Колибри использовал знания</h3>
            </header>
            <div className="space-y-3">
              {usage.recentEntries.length ? (
                usage.recentEntries.map((entry) => (
                  <article key={entry.messageId} className="glass-panel space-y-2 p-4 text-sm text-text-secondary">
                    <div className="flex items-center justify-between text-xs uppercase tracking-wide text-text-secondary/80">
                      <span className="font-semibold text-text-primary">{entry.conversationTitle}</span>
                      <span>{formatTimestamp(entry.isoTimestamp)}</span>
                    </div>
                    <p className="text-text-secondary">{entry.excerpt}</p>
                    {entry.sources.length ? (
                      <p className="text-xs uppercase tracking-wide text-primary/80">Источники: {entry.sources.join(", ")}</p>
                    ) : null}
                    <p className="text-xs text-text-secondary/70">Фрагментов в ответе: {entry.snippetCount}</p>
                  </article>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-border-strong/60 p-4 text-sm text-text-secondary">
                  Колибри ещё не обращался к базе знаний в текущих беседах.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <header>
            <p className="text-xs uppercase tracking-[0.35em] text-text-secondary">Источники</p>
            <h3 className="mt-1 text-lg font-semibold text-text-primary">Unified Connector SDK</h3>
          </header>

          {connectorsLoading ? (
            <p className="flex items-center gap-2 text-sm text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Получаем список источников…
            </p>
          ) : null}

          {connectorsError ? (
            <p className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <AlertCircle className="h-4 w-4" />
              {connectorsError}
            </p>
          ) : null}

          <div className="space-y-3">
            {connectors.map((connector) => {
              const Icon = CONNECTOR_ICONS[connector.provider] ?? Cloud;
              const isProcessing = pendingId === connector.id || pendingId === connector.provider;
              return (
                <article key={connector.id} className="glass-panel space-y-3 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-text-primary">{connector.name}</p>
                        <p className="text-xs text-text-secondary/80">
                          {getStatusLabel(connector.status)} · Последняя синхронизация: {formatTimestamp(connector.lastSyncedIso)}
                        </p>
                        <p className="text-xs text-text-secondary/70">
                          Оффлайн кеш: {connector.offlineEnabled ? `${connector.offlineEntries} фрагм. · ${formatBytes(connector.offlineBytes)}` : "выключен"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {connector.status === "connected" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleOffline(connector.id)}
                            className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isProcessing}
                          >
                            {connector.offlineEnabled ? <CloudOff className="h-4 w-4" /> : <Cloud className="h-4 w-4" />}
                            {connector.offlineEnabled ? "Выключить оффлайн" : "Включить оффлайн"}
                          </button>
                          <button
                            type="button"
                            onClick={() => sync(connector.id)}
                            className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isProcessing}
                          >
                            <Sparkles className="h-4 w-4" />
                            Синхронизировать
                          </button>
                          <button
                            type="button"
                            onClick={() => disconnect(connector.id)}
                            className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isProcessing}
                          >
                            <Bookmark className="h-4 w-4" />
                            Отключить
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => connect(connector.provider)}
                          className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isProcessing}
                        >
                          <Sparkles className="h-4 w-4" />
                          Подключить {getProviderLabel(connector.provider)}
                        </button>
                      )}
                    </div>
                  </div>
                  {connector.error ? (
                    <p className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {connector.error}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};

const KnowledgeStat = ({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Sparkles;
  label: string;
  value: string;
  accent?: "primary" | "accent";
}) => (
  <article className="glass-panel flex items-center gap-3 px-4 py-3">
    <span
      className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
        accent === "accent" ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary"
      }`}
    >
      <Icon className="h-5 w-5" />
    </span>
    <div>
      <p className="text-xs uppercase tracking-[0.35em] text-text-secondary">{label}</p>
      <p className="text-lg font-semibold text-text-primary">{value}</p>
    </div>
  </article>
);

export default KnowledgeView;
