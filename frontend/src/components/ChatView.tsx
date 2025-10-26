import {
  ArrowDownWideNarrow,
  BarChart3,
  Crosshair,
  ListChecks,
  Menu,
  PanelsTopLeft,
  RefreshCcw,
  Settings2,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import useMediaQuery from "../core/useMediaQuery";
import type { ConversationMetrics, ConversationSummary } from "../core/useKolibriChat";
import type { ModeOption } from "../core/modes";
import type { ChatMessage } from "../types/chat";
import ChatMessageView from "./ChatMessage";
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
  onOpenActions: () => void;
  onRefreshKnowledge: () => void;
  isKnowledgeLoading: boolean;
  bridgeReady: boolean;
  isZenMode: boolean;
  onToggleZenMode: () => void;
  personaName: string;
  onViewportElementChange?: (element: HTMLElement | null) => void;
}

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
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const rootRef = useCallback(
    (element: HTMLElement | null) => {
      if (onViewportElementChange) {
        onViewportElementChange(element);
      }
    },
    [onViewportElementChange],
  );

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const handleScroll = () => {
      const distance = container.scrollHeight - (container.scrollTop + container.clientHeight);
      setIsNearBottom(distance < 120);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || !isNearBottom) {
      return;
    }

    if (typeof container.scrollTo === "function") {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    } else {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, isLoading, isNearBottom]);

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
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    } else {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  const renderedMessages = useMemo(() => {
    const items: Array<JSX.Element> = [];
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
        items.push(
          <div key={`divider-${dateKey}-${index}`} className="flex items-center gap-3 px-2">
            <span className="h-px flex-1 bg-border/70" />
            <span className="rounded-full border border-border/70 bg-surface px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-text-muted">
              {formattedDate}
            </span>
            <span className="h-px flex-1 bg-border/70" />
          </div>,
        );
      }

      items.push(
        <div key={message.id} className="px-2">
          <ChatMessageView message={message} latestUserMessage={contextUserMessage} />
        </div>,
      );
    });

    return items;
  }, [messages]);

  const conversationShortId = useMemo(() => conversationId.slice(0, 8), [conversationId]);
  const totalMessages = metrics.userMessages + metrics.assistantMessages;

  const formatIsoTime = (iso?: string) => {
    if (!iso) {
      return "—";
    }
    try {
      return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "—";
    }
  };

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
          className="fixed inset-0 z-30 bg-black/40"
          onClick={() => setSidebarOpen(false)}
          aria-label="Закрыть список бесед"
        />
      ) : null}

      <div className="flex min-h-screen flex-1 flex-col bg-chat-surface">
        <header className="sticky top-0 z-10 border-b border-border/60 bg-chat-header/80 backdrop-blur">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 text-text-muted transition-colors hover:text-text lg:hidden"
                aria-label="Открыть список бесед"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/90 text-base font-semibold text-brand-foreground shadow-card">
                  K
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-text-muted">Kolibri Studio</p>
                  <p className="text-sm font-semibold text-text">Диалог #{conversationShortId}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenKnowledge}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 text-text-muted transition-colors hover:text-text"
                aria-label="Открыть знания"
              >
                <Sparkles className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onOpenAnalytics}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 text-text-muted transition-colors hover:text-text"
                aria-label="Открыть аналитику"
              >
                <BarChart3 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onOpenActions}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 text-text-muted transition-colors hover:text-text"
                aria-label="Открыть действия"
              >
                <ListChecks className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onOpenSwarm}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 text-text-muted transition-colors hover:text-text"
                aria-label="Открыть swarm"
              >
                <PanelsTopLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onOpenPreferences}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 text-text-muted transition-colors hover:text-text"
                aria-label="Настройки беседы"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

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
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
                bridgeReady ? "border-brand/30 bg-brand/10 text-text" : "border-border/70 bg-surface-muted text-text-muted"
              }`}
              >
                <span className={`h-2 w-2 rounded-full ${bridgeReady ? "bg-brand" : "bg-text-muted"}`} />
                {bridgeReady ? "Ядро готово" : "Ожидание"}
              </span>
              <span className="hidden text-xs text-text-muted sm:inline">{modeLabel}</span>
              <span className="hidden rounded-full border border-border/70 bg-surface-muted px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-text-muted sm:inline">
                {personaName}
              </span>
              <span>Сообщений: {totalMessages}</span>
              <span>Обновлено: {formatIsoTime(metrics.lastUpdatedIso)}</span>
              <button
                type="button"
                onClick={onToggleZenMode}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-quick ${
                  isZenMode ? "border-primary/70 bg-primary/15 text-primary" : "border-border/70 text-text-muted hover:text-text"
                }`}
                aria-pressed={isZenMode}
                aria-label={isZenMode ? "Отключить режим фокуса" : "Включить режим фокуса"}
              >
                <Crosshair className="h-3.5 w-3.5" />
                Фокус
              </button>
              <div className="ml-auto flex items-center gap-2">
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
              </div>
            </div>
          </div>
        </section>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative flex-1">
            <div ref={containerRef} className="soft-scroll absolute inset-0 overflow-y-auto">
              <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-24 pt-6 sm:px-6 lg:px-8">
                {renderedMessages.length === 0 && !isLoading ? (
                  <div className="rounded-2xl border border-dashed border-border/60 bg-surface px-6 py-8 text-sm text-text-muted">
                    {emptyState}
                  </div>
                ) : (
                  renderedMessages
                )}
                {isLoading ? (
                  <div className="mx-2 flex items-center gap-2 rounded-xl border border-dashed border-brand/40 bg-brand/10 px-4 py-3 text-sm text-text">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
                    Колибри формирует ответ...
                  </div>
                ) : null}
              </div>
            </div>
            {!isNearBottom ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
                <button
                  type="button"
                  onClick={scrollToBottom}
                  className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-card transition-transform hover:scale-[1.02]"
                >
                  <ArrowDownWideNarrow className="h-4 w-4" />
                  К последнему сообщению
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <footer className="border-t border-border/60 bg-chat-footer/90">
          <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">{composer}</div>
        </footer>
      </div>
    </div>
  );
};

export default ChatView;
