import {
  ArrowDownWideNarrow,
  BarChart3,
  Menu,
  PanelsTopLeft,
  RefreshCcw,
  Settings2,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ConversationMetrics } from "../core/useKolibriChat";
import type { ChatMessage } from "../types/chat";
import ChatMessageView from "./ChatMessage";

interface ChatViewProps {
  messages: ChatMessage[];
  isLoading: boolean;
  conversationId: string;
  conversationTitle: string;
  modeLabel: string;
  metrics: ConversationMetrics;
  emptyState?: ReactNode;
  onConversationTitleChange: (title: string) => void;
  onOpenSidebar: () => void;
  onOpenKnowledge: () => void;
  onOpenAnalytics: () => void;
  onOpenSwarm: () => void;
  onOpenPreferences: () => void;
  onRefreshKnowledge: () => void;
  isKnowledgeLoading: boolean;
  bridgeReady: boolean;
}

const ChatView = ({
  messages,
  isLoading,
  conversationId,
  conversationTitle,
  modeLabel,
  metrics,
  emptyState,
  onConversationTitleChange,
  onOpenSidebar,
  onOpenKnowledge,
  onOpenAnalytics,
  onOpenSwarm,
  onOpenPreferences,
  onRefreshKnowledge,
  isKnowledgeLoading,
  bridgeReady,
}: ChatViewProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
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

  return (
    <section className="flex h-full flex-col gap-4">
      <header className="rounded-2xl border border-border/70 bg-surface px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 text-text-muted transition-colors hover:text-text lg:hidden"
            aria-label="Открыть список бесед"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label htmlFor="conversation-title" className="text-[0.7rem] uppercase tracking-[0.3em] text-text-muted">
              Текущая беседа #{conversationShortId}
            </label>
            <input
              id="conversation-title"
              value={conversationTitle}
              onChange={(event) => onConversationTitleChange(event.target.value)}
              placeholder="Назови беседу"
              className="w-full rounded-xl border border-border/70 bg-surface-muted px-3 py-2 text-sm font-semibold text-text focus:border-brand focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
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
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-text-muted">
          <span>Сообщений: {totalMessages}</span>
          <span>Обновлено: {formatIsoTime(metrics.lastUpdatedIso)}</span>
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
              onClick={onOpenSwarm}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:text-text"
              aria-label="Открыть swarm"
            >
              <PanelsTopLeft className="h-4 w-4" />
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
      </header>

      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border/60 bg-surface px-1 py-4 shadow-sm">
        <div className="relative flex-1">
          <div className="soft-scroll absolute inset-0 space-y-6 overflow-y-auto px-1 pb-8" ref={containerRef}>
            {renderedMessages.length === 0 && !isLoading ? (
              <div className="px-3 py-6 text-sm text-text-muted">{emptyState}</div>
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
          {!isNearBottom ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
              <button
                type="button"
                onClick={scrollToBottom}
                className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-card transition-transform hover:scale-[1.01]"
              >
                <ArrowDownWideNarrow className="h-4 w-4" />
                К последнему сообщению
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default ChatView;
