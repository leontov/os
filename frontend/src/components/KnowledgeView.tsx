import {
  AlertCircle,
  BookOpenCheck,
  Bookmark,
  Clock3,
  Copy,
  Loader2,
  Plus,
  Search,
  Share2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCollabSession } from "../core/collaboration/CollabSessionProvider";
import type { KnowledgeUsageOverview } from "../core/useKolibriChat";
import { searchKnowledge, type KnowledgeStatus } from "../core/knowledge";
import type { KnowledgeSnippet } from "../types/knowledge";
import StatusBar from "./StatusBar";
import Whiteboard from "./canvas/Whiteboard";

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
  const {
    notes: sharedNotes,
    addNote,
    updateNote,
    removeNote,
    participants,
    shareLink,
  } = useCollabSession();
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

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
    if (sharedNotes.length === 0) {
      setActiveNoteId(null);
      return;
    }
    if (!activeNoteId || !sharedNotes.some((note) => note.id === activeNoteId)) {
      setActiveNoteId(sharedNotes[0]?.id ?? null);
    }
  }, [sharedNotes, activeNoteId]);

  const activeNote = useMemo(() => sharedNotes.find((note) => note.id === activeNoteId) ?? null, [sharedNotes, activeNoteId]);

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

  const handleCreateNote = useCallback(() => {
    const id = addNote({ title: "Новая заметка", content: "" });
    if (id) {
      setActiveNoteId(id);
    }
  }, [addNote]);

  const handleDeleteNote = useCallback(() => {
    if (!activeNoteId) {
      return;
    }
    removeNote(activeNoteId);
    setActiveNoteId(null);
  }, [activeNoteId, removeNote]);

  const handleCopyShareLink = useCallback(async () => {
    if (!shareLink || !navigator?.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareLink);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 1500);
    } catch {
      setIsCopied(false);
    }
  }, [shareLink]);

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

      <section className="glass-panel grid gap-6 p-6 xl:grid-cols-[minmax(0,1fr),minmax(0,1.3fr)]">
        <div className="flex min-h-[24rem] flex-col gap-4">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-text-secondary">Совместные заметки</p>
              <h2 className="mt-1 text-lg font-semibold text-text-primary">Коллективная рабочая область</h2>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:border-primary"
              onClick={handleCreateNote}
            >
              <Plus className="h-3.5 w-3.5" />
              Новая заметка
            </button>
          </header>

          <div className="grid flex-1 gap-4 md:grid-cols-[14rem,minmax(0,1fr)]">
            <aside className="space-y-2">
              {sharedNotes.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border-strong/60 p-4 text-xs text-text-secondary">
                  Пока нет общих заметок. Создайте первую, чтобы зафиксировать идеи команды.
                </p>
              ) : (
                <ul className="soft-scroll space-y-2 overflow-y-auto pr-1">
                  {sharedNotes.map((note) => (
                    <li key={note.id}>
                      <button
                        type="button"
                        onClick={() => setActiveNoteId(note.id)}
                        className={`w-full rounded-2xl border px-3 py-3 text-left text-sm transition-colors ${
                          note.id === activeNoteId
                            ? "border-primary/50 bg-primary/10 text-text"
                            : "border-border-strong/50 bg-background-input/70 text-text-secondary hover:border-primary/40"
                        }`}
                      >
                        <span className="block text-xs uppercase tracking-[0.3em] text-text-secondary/80">Обновлено</span>
                        <span className="block truncate text-sm font-semibold text-text-primary">{note.title || "Без названия"}</span>
                        <span className="block text-xs text-text-secondary/80">{new Date(note.updatedAtIso).toLocaleString("ru-RU")}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
            <div className="flex flex-col gap-3 rounded-3xl border border-border-strong/60 bg-background-input/70 p-4">
              {activeNote ? (
                <>
                  <input
                    value={activeNote.title}
                    onChange={(event) => updateNote(activeNote.id, { title: event.target.value })}
                    placeholder="Название заметки"
                    className="rounded-2xl border border-border-strong/60 bg-background-card/70 px-3 py-2 text-sm font-semibold text-text-primary focus:border-primary focus:outline-none"
                  />
                  <textarea
                    value={activeNote.content}
                    onChange={(event) => updateNote(activeNote.id, { content: event.target.value })}
                    placeholder="Запишите ключевые решения, идеи, контрольные списки или риски"
                    className="soft-scroll flex-1 resize-none rounded-2xl border border-border-strong/60 bg-background-card/70 px-3 py-3 text-sm text-text-secondary focus:border-primary focus:outline-none"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-secondary">
                    <span>Последнее изменение: {new Date(activeNote.updatedAtIso).toLocaleString("ru-RU")}</span>
                    <button
                      type="button"
                      onClick={handleDeleteNote}
                      className="inline-flex items-center gap-2 rounded-full border border-red-400/50 px-3 py-1 text-xs font-semibold text-red-200 transition-colors hover:border-red-300 hover:text-red-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Удалить
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-text-secondary">
                  Выберите заметку, чтобы начать редактирование.
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-strong/60 bg-background-input/70 px-4 py-3 text-xs text-text-secondary">
            <div className="flex items-center gap-2 text-text-secondary/80">
              <Share2 className="h-4 w-4" />
              {shareLink ? (
                <span className="truncate" title={shareLink}>
                  {shareLink}
                </span>
              ) : (
                <span>Ссылка на сессию недоступна в офлайн-режиме.</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center -space-x-1">
                {participants.slice(0, 4).map((participant) => (
                  <span
                    key={participant.clientId}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-[0.65rem] font-semibold text-white shadow-lg"
                    style={{ backgroundColor: participant.color }}
                    title={`${participant.name} · ${participant.status}`}
                  >
                    {participant.name.slice(0, 1).toUpperCase()}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={handleCopyShareLink}
                disabled={!shareLink}
                className="inline-flex items-center gap-2 rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy className="h-3.5 w-3.5" />
                {isCopied ? "Скопировано" : "Скопировать"}
              </button>
            </div>
          </div>
        </div>
        <div className="min-h-[24rem] rounded-3xl border border-border-strong/60 bg-background-input/60">
          <Whiteboard />
        </div>
      </section>
    </div>
  );
};

export default KnowledgeView;
