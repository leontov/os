import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowDownWideNarrow,
  BarChart3,
  Crosshair,
  Database,
  ListChecks,
  Menu,
  PanelsTopLeft,
  Pencil,
  RefreshCcw,
  Settings2,
  Sparkles,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import useMediaQuery from "../core/useMediaQuery";
import type { ConversationMetrics, ConversationSummary } from "../core/useKolibriChat";
import type { ModeOption } from "../core/modes";
import { usePersonaTheme } from "../core/usePersonaTheme";
import type { ModeOption } from "../core/modes";
import type { ConversationMetrics, ConversationSummary } from "../core/useKolibriChat";
import type { ChatMessage } from "../types/chat";
import ChatMessageView from "./ChatMessageView";
import { MessageSkeleton } from "./loading";
import ChatSidebar from "./sidebar/ChatSidebar";

interface ChatViewProps {
  messages: ChatMessage[];
  isLoading: boolean;
  conversationId: string;
  conversationTitle: string;
  conversationSummaries: ConversationSummary[];
  mode: string;
  modeLabel: string;
  modeOptions: ModeOption[];
  metrics: ConversationMetrics;
  emptyState?: ReactNode;
  composer?: ReactNode;
  onConversationTitleChange: (title: string) => void;
  onConversationCreate: () => void;
  onConversationSelect: (id: string) => void;
  onConversationRename: (id: string, title: string) => void;
  onConversationDelete: (id: string) => void;
  onModeChange: (mode: string) => void;
  onOpenKnowledge: () => void;
  onOpenAnalytics: () => void;
  onOpenSwarm: () => void;
  onOpenPreferences: () => void;
  onOpenSettings: () => void;
  onOpenActions: () => void;
  onRefreshKnowledge: () => void;
  isKnowledgeLoading: boolean;
  bridgeReady: boolean;
  isZenMode: boolean;
  onToggleZenMode: () => void;
  personaName: string;
  onViewportElementChange?: (element: HTMLElement | null) => void;
}

type TimelineItem =
  | { type: "divider"; id: string; label: string }
  | { type: "message"; id: string; message: ChatMessage; contextUserMessage?: ChatMessage };

const ChatView = ({
  messages,
  isLoading,
  conversationId,
  conversationTitle,
  conversationSummaries,
  mode,
  modeLabel,
  modeOptions,
  metrics,
  emptyState,
  composer,
  onConversationTitleChange,
  onConversationCreate,
  onConversationSelect,
  onConversationRename,
  onConversationDelete,
  onModeChange,
  onOpenKnowledge,
  onOpenAnalytics,
  onOpenSwarm,
  onOpenPreferences,
  onOpenSettings,
  onOpenActions,
  onRefreshKnowledge,
  isKnowledgeLoading,
  bridgeReady,
  isZenMode,
  onToggleZenMode,
  personaName,
  onViewportElementChange,
}: ChatViewProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isRenamingTitle, setIsRenamingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(conversationTitle);
  const { resolvedMotion } = usePersonaTheme();
  const prefersReducedMotion = useReducedMotion();
  const shouldReduceMotion = resolvedMotion === "reduced" || Boolean(prefersReducedMotion);
  const easeCurve: [number, number, number, number] = [0.22, 0.61, 0.36, 1];
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isMobileViewport = useMediaQuery("(max-width: 1023px)");
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const rootRef = useCallback(
    (element: HTMLElement | null) => {
      if (onViewportElementChange) {
        onViewportElementChange(element);
      }
    },
    [onViewportElementChange],
  );

  useEffect(() => {
    if (!isRenamingTitle) {
      setTitleDraft(conversationTitle);
    }
  }, [conversationTitle, isRenamingTitle]);

  useEffect(() => {
    if (isRenamingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isRenamingTitle]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return undefined;
    }

    const handleScroll = () => {
      const distance = container.scrollHeight - (container.scrollTop + container.clientHeight);
      setIsNearBottom(distance < 96);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    if (!isNearBottom) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    if (typeof container.scrollTo === "function") {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: shouldReduceMotion ? "auto" : "smooth",
      });
    } else {
      container.scrollTop = container.scrollHeight;
    }
  }, [isLoading, isNearBottom, messages, shouldReduceMotion]);

  useEffect(() => {
    if (isDesktop) {
      setSidebarOpen(false);
    }
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop) {
      setSidebarCollapsed(false);
    }
  }, [isDesktop]);

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    if (typeof container.scrollTo === "function") {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: shouldReduceMotion ? "auto" : "smooth",
      });
    } else {
      container.scrollTop = container.scrollHeight;
    }
  }, [shouldReduceMotion]);

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    let lastUserMessage: ChatMessage | undefined;
    let lastDateKey: string | undefined;

    messages.forEach((message, index) => {
      const contextUserMessage = message.role === "assistant" ? lastUserMessage : undefined;
      if (message.role === "user") {
        lastUserMessage = message;
      }

      const dateKey = message.isoTimestamp ? new Date(message.isoTimestamp).toDateString() : undefined;
      if (dateKey && dateKey !== lastDateKey) {
        lastDateKey = dateKey;
        const formattedDate = new Date(message.isoTimestamp!).toLocaleDateString("ru-RU", {
          day: "2-digit",
          month: "long",
        });
        items.push({ type: "divider", id: `divider-${dateKey}-${index}`, label: formattedDate });
      }

      items.push({ type: "message", id: message.id, message, contextUserMessage });
    });

    return items;
  }, [messages]);

  const conversationShortId = useMemo(() => conversationId.slice(0, 8), [conversationId]);

  const totalMessages = metrics.userMessages + metrics.assistantMessages;

  const lastUpdatedLabel = useMemo(() => {
    if (!metrics.lastUpdatedIso) {
      return "—";
    }
    try {
      return new Date(metrics.lastUpdatedIso).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  }, [metrics.lastUpdatedIso]);

  const handleConversationSelect = useCallback(
    (id: string) => {
      onConversationSelect(id);
      if (!isDesktop) {
        setSidebarOpen(false);
      }
    },
    [isDesktop, onConversationSelect],
  );

  const handleConversationCreate = useCallback(() => {
    onConversationCreate();
    if (!isDesktop) {
      setSidebarOpen(false);
    }
  }, [isDesktop, onConversationCreate]);

  const commitTitle = useCallback(() => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== conversationTitle) {
      onConversationTitleChange(trimmed);
    }
    if (!trimmed) {
      setTitleDraft(conversationTitle);
    }
    setIsRenamingTitle(false);
  }, [conversationTitle, onConversationTitleChange, titleDraft]);

  const cancelRename = useCallback(() => {
    setTitleDraft(conversationTitle);
    setIsRenamingTitle(false);
  }, [conversationTitle]);

  const handleTitleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitTitle();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancelRename();
      }
    },
    [cancelRename, commitTitle],
  );

  return (
    <div ref={rootRef} className="flex h-full min-h-screen w-full bg-app-background text-text" data-zen-mode={isZenMode}>
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex max-w-full transform transition-transform duration-300 ease-gesture lg:static lg:z-auto ${
          isDesktop ? "translate-x-0" : isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!isDesktop && !isSidebarOpen}
      >
        <ChatSidebar
          conversations={conversationSummaries}
          activeConversationId={conversationId}
          mode={mode}
          modeOptions={modeOptions}
          isCollapsed={isSidebarCollapsed}
          onCollapseToggle={() => setSidebarCollapsed((previous) => !previous)}
          onCreateConversation={handleConversationCreate}
          onSelectConversation={handleConversationSelect}
          onRenameConversation={onConversationRename}
          onDeleteConversation={onConversationDelete}
          onModeChange={onModeChange}
          onClose={() => setSidebarOpen(false)}
        />
      </aside>

      {!isDesktop && isSidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/50"
          onClick={() => setSidebarOpen(false)}
          aria-label="Закрыть список бесед"
        />
      ) : null}

      <div className="flex min-h-screen flex-1 flex-col bg-background-main/95">
        <header className="sticky top-0 z-20 border-b border-border/60 bg-sidebar/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:text-text lg:hidden"
                aria-label="Открыть список бесед"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="flex flex-col gap-1">
                {isRenamingTitle ? (
                  <input
                    ref={titleInputRef}
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={handleTitleKeyDown}
                    className="w-full rounded-xl border border-border/70 bg-background-input px-3 py-2 text-sm font-semibold text-text focus:border-brand focus:outline-none"
                    aria-label="Название беседы"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsRenamingTitle(true)}
                    className="inline-flex items-center gap-2 text-left text-base font-semibold text-text transition-colors hover:text-primary"
                  >
                    <span className="truncate">{conversationTitle || "Новая беседа"}</span>
                    <Pencil className="h-3.5 w-3.5 text-text-muted" />
                  </button>
                )}
                <span className="text-xs font-medium uppercase tracking-[0.32em] text-text-muted">
                  Диалог #{conversationShortId}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleZenMode}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
                  isZenMode
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border/70 text-text-muted hover:text-text"
                }`}
                aria-pressed={isZenMode}
                aria-label={isZenMode ? "Отключить режим фокуса" : "Включить режим фокуса"}
              >
                <Crosshair className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onOpenKnowledge}
                className="hidden h-10 w-10 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:text-text sm:inline-flex"
                aria-label="Открыть знания"
              >
                <Sparkles className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onOpenAnalytics}
                className="hidden h-10 w-10 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:text-text lg:inline-flex"
                aria-label="Открыть аналитику"
              >
                <BarChart3 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onOpenActions}
                className="hidden h-10 w-10 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:text-text lg:inline-flex"
                aria-label="Открыть действия"
              >
                <ListChecks className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onOpenSwarm}
                className="hidden h-10 w-10 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:text-text xl:inline-flex"
                aria-label="Открыть swarm"
              >
                <PanelsTopLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:text-text"
                aria-label="Открыть память"
              >
                <Database className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onOpenPreferences}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:text-text"
                aria-label="Настройки беседы"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            </div>
          </div>

        <section className="border-b border-border/50 bg-chat-surface">
          <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
            <label htmlFor="conversation-title" className="text-[0.68rem] uppercase tracking-[0.35em] text-text-muted">
              Название беседы
            </label>
            <input
              id="conversation-title"
              value={conversationTitle}
              onChange={(event) => onConversationTitleChange(event.target.value)}
              placeholder="Назови беседу"
              className="mt-2 w-full rounded-xl border border-border/70 bg-chat-input px-4 py-3 text-sm font-semibold text-text focus:border-brand focus:outline-none"
            />
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-text-muted">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
                  bridgeReady ? "border-brand/30 bg-brand/10 text-text" : "border-border/70 bg-surface-muted text-text-muted"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${bridgeReady ? "bg-brand" : "bg-text-muted"}`} />
                {bridgeReady ? "Ядро готово" : "Ожидание"}
              </span>
              <span className="hidden text-xs text-text-muted sm:inline">{modeLabel}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-text-muted">
              <span>Сообщений: {totalMessages}</span>
              <span>Обновлено: {formatIsoTime(metrics.lastUpdatedIso)}</span>
              <div className="flex items-center gap-2">
                <span className="hidden rounded-full border border-border/70 bg-surface-muted px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-text-muted sm:inline">
                  {personaName}
                </span>
                <button
                  type="button"
                  onClick={onToggleZenMode}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-quick ${
                    isZenMode
                      ? "border-primary/70 bg-primary/15 text-primary"
                      : "border-border/70 text-text-muted hover:text-text"
                  }`}
                  aria-pressed={isZenMode}
                  aria-label={isZenMode ? "Отключить режим фокуса" : "Включить режим фокуса"}
                >
                  <Crosshair className="h-3.5 w-3.5" />
                  Фокус
                </button>
              </div>
              <div className="ml-auto hidden items-center gap-2 lg:flex">
                <button
                  type="button"
                  onClick={onRefreshKnowledge}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:text-text"
                  aria-label="Обновить память"
                  disabled={isKnowledgeLoading}
                >
                  <RefreshCcw className={`h-4 w-4 ${isKnowledgeLoading ? "animate-spin" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={onOpenKnowledge}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:text-text"
                  aria-label="Открыть знания"
                >
                  <Sparkles className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onOpenAnalytics}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:text-text"
                  aria-label="Открыть аналитику"
                >
                  <BarChart3 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onOpenActions}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:text-text"
                  aria-label="Открыть действия"
                >
                  <ListChecks className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onOpenSwarm}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:text-text"
                  aria-label="Открыть swarm"
                >
                  <PanelsTopLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:text-text"
                  aria-label="Настройки модели и памяти"
                >
                  <Database className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onOpenPreferences}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:text-text"
                  aria-label="Настройки беседы"
                >
                  <Settings2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <main className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border/60 bg-surface px-1 py-4 shadow-sm">
            <div className="relative flex-1">
              <div className="soft-scroll absolute inset-0 overflow-y-auto px-1 pb-8" ref={containerRef}>
                {timelineItems.length === 0 && !isLoading ? (
                  <div className="px-3 py-6 text-sm text-text-muted">{emptyState}</div>
                ) : (
                  <div className="flex flex-col gap-6">
                    <AnimatePresence initial={false}>
                      {timelineItems.map((item) => {
                        if (item.type === "divider") {
                          return (
                            <motion.div
                              key={item.id}
                              className="flex items-center gap-3 px-2"
                              layout="position"
                              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                              transition={shouldReduceMotion ? { duration: 0.12 } : { duration: 0.22, ease: easeCurve }}
                            >
                              <span className="h-px flex-1 bg-border/70" />
                              <span className="rounded-full border border-border/70 bg-surface px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-text-muted">
                                {item.label}
                              </span>
                              <span className="h-px flex-1 bg-border/70" />
                            </motion.div>
                          );
                        }

                        return (
                          <motion.div
                            key={item.id}
                            className="px-2"
                            layout="position"
                            initial={
                              shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }
                            }
                            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.98 }}
                            transition={shouldReduceMotion ? { duration: 0.16 } : { duration: 0.32, ease: easeCurve }}
                          >
                            <ChatMessageView
                              message={item.message}
                              latestUserMessage={item.contextUserMessage}
                            />
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
                <AnimatePresence>
                  {isLoading ? (
                    <motion.div
                      key="loading-indicator"
                      className="px-2 pt-4"
                      layout="position"
                      initial={shouldReduceMotion ? { opacity: 0.8 } : { opacity: 0, y: 16 }}
                      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                      transition={shouldReduceMotion ? { duration: 0.12 } : { duration: 0.28, ease: easeCurve }}
                      role="status"
                      aria-live="polite"
                    >
                      <MessageSkeleton />
                      <span className="sr-only">Колибри формирует ответ…</span>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
              {!isNearBottom ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                  <button
                    type="button"
                    onClick={scrollToBottom}
                    className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-brand-foreground shadow-card transition-transform hover:scale-[1.02]"
                  >
                    <ArrowDownWideNarrow className="h-4 w-4" />
                    К последнему сообщению
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </main>
      <footer className="border-t border-border/60 bg-chat-footer/90">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">{composer}</div>
      </footer>
      </div>
      {isMobileViewport ? (
        <div
          className="mx-auto mt-3 flex w-full max-w-5xl flex-col gap-2 rounded-2xl border border-border/60 bg-surface px-3 py-3 text-xs text-text-muted shadow-sm lg:hidden"
          role="toolbar"
          aria-label="Быстрые действия"
        >
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onOpenKnowledge}
              className="flex items-center justify-start gap-2 rounded-xl border border-border/60 bg-surface-muted px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Знания
            </button>
            <button
              type="button"
              onClick={onOpenAnalytics}
              className="flex items-center justify-start gap-2 rounded-xl border border-border/60 bg-surface-muted px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              Аналитика
            </button>
            <button
              type="button"
              onClick={onOpenSwarm}
              className="flex items-center justify-start gap-2 rounded-xl border border-border/60 bg-surface-muted px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <PanelsTopLeft className="h-4 w-4" aria-hidden="true" />
              Swarm
            </button>
            <button
              type="button"
              onClick={onOpenActions}
              className="flex items-center justify-start gap-2 rounded-xl border border-border/60 bg-surface-muted px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <ListChecks className="h-4 w-4" aria-hidden="true" />
              Действия
            </button>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onRefreshKnowledge}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-surface-muted text-text transition-colors hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
              aria-label="Обновить память"
              disabled={isKnowledgeLoading}
            >
              <RefreshCcw className={`h-4 w-4 ${isKnowledgeLoading ? "animate-spin" : ""}`} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onOpenPreferences}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-surface-muted text-text transition-colors hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label="Настройки беседы"
            >
              <Settings2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ChatView;
