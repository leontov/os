import { AlertCircle, BookOpenCheck, Bookmark, Clock3, Loader2, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KnowledgeUsageOverview } from "../core/useKolibriChat";
import { searchKnowledge, type KnowledgeStatus } from "../core/knowledge";
import type { KnowledgeSnippet } from "../types/knowledge";
import StatusBar from "./StatusBar";
import WorkspacePlaceholder from "./WorkspacePlaceholder";

interface KnowledgeViewProps {
  status: KnowledgeStatus | null;
  error?: string;
  isLoading?: boolean;
  onRefresh?: () => void;
  usage: KnowledgeUsageOverview;
}

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
const KnowledgeView = ({ status, error, isLoading, onRefresh }: KnowledgeViewProps) => (
  <div className="flex min-h-0 flex-1 flex-col gap-6">
    <StatusBar status={status} error={error} isLoading={isLoading} onRefresh={onRefresh} />
    <WorkspacePlaceholder
      badge="Контур памяти"
      title="Мониторинг знаний"
      description="Мы строим панель, которая покажет загрузку документов, состояние пайплайна и свежие события в базе знаний Kolibri."
      hint="До релиза вы можете обновлять статус вручную и отслеживать количество документов с помощью верхней панели."
      actions={
        <>
          <button type="button" className="ghost-button text-xs">
            Запросить отчёт
          </button>
          <button type="button" className="ghost-button text-xs">
            Настроить интеграции
          </button>
        </>
      }
    >
      <ul className="grid gap-4 sm:grid-cols-2">
        <li className="glass-panel p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-primary/80">Слои данных</p>
          <p className="mt-2 text-sm text-text-secondary">
            Поддержка Confluence, Google Drive и внутренних хранилищ появится здесь, чтобы вы контролировали, что уже подключено.
          </p>
        </li>
        <li className="glass-panel p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-primary/80">Контроль качества</p>
          <p className="mt-2 text-sm text-text-secondary">
            Вы увидите автоматические проверки полноты, свежести и точности с рекомендациями по исправлению.
          </p>
        </li>
      </ul>
    </WorkspacePlaceholder>
  </div>
);

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

const KnowledgeView = ({ status, error, isLoading, onRefresh, usage }: KnowledgeViewProps) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KnowledgeSnippet[]>([]);
  const [searchError, setSearchError] = useState<string | undefined>();
  const [searchLoading, setSearchLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number>();

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
      void searchKnowledge(trimmed, { topK: 6, signal: controller.signal })
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

  const totalSources = useMemo(() => String(usage.uniqueSources ?? 0), [usage.uniqueSources]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <StatusBar status={status} error={error} isLoading={isLoading} onRefresh={onRefresh} />

      <section className="grid gap-4 md:grid-cols-3">
        <KnowledgeStat icon={Sparkles} label="Всего обращений" value={`${usage.totalReferences}`} />
        <KnowledgeStat icon={BookOpenCheck} label="Бесед с контекстом" value={`${usage.conversationsWithKnowledge}`} />
        <KnowledgeStat
          icon={Bookmark}
          label="Уникальные источники"
          value={`${totalSources}`}
          accent="accent"
        />
      </section>

      <section className="glass-panel grid gap-6 p-6 lg:grid-cols-[minmax(0,2fr),minmax(0,1fr)]">
        <div className="space-y-4">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-text-secondary">Поиск</p>
              <h2 className="mt-1 text-lg font-semibold text-text-primary">Найдите нужный документ</h2>
            </div>
            {status?.timestamp ? (
              <span className="flex items-center gap-2 rounded-xl bg-background-input/70 px-3 py-2 text-xs text-text-secondary">
                <Clock3 className="h-4 w-4" />
                Снимок: {formatTimestamp(status.timestamp)}
              </span>
            ) : null}
          </header>

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

          <div className="space-y-3">
            {results.length ? (
              results.map((snippet) => (
                <article key={snippet.id} className="glass-panel space-y-2 p-4">
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-text-secondary/80">
                    <span className="font-semibold text-text-primary">{snippet.title}</span>
                    <span>Релевантность: {snippet.score.toFixed(2)}</span>
                  </div>
                  <p className="whitespace-pre-line text-sm text-text-secondary">{snippet.content}</p>
                  {snippet.source ? (
                    <p className="text-xs uppercase tracking-wide text-primary/80">Источник: {snippet.source}</p>
                  ) : null}
                </article>
              ))
            ) : !searchLoading && query.trim() ? (
              <p className="rounded-xl border border-dashed border-border-strong/60 p-4 text-sm text-text-secondary">
                Ничего не найдено. Попробуйте уточнить запрос или используйте другие ключевые слова.
              </p>
            ) : (
              <p className="rounded-xl border border-dashed border-border-strong/60 p-4 text-sm text-text-secondary">
                Введите запрос, чтобы выполнить поиск по локальной базе знаний. Никакие данные не покидают устройство.
              </p>
            )}
          </div>
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
      </section>
    </div>
  );
};

export default KnowledgeView;
