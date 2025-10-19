import { Activity, ArrowDownWideNarrow, Clock3, MessageSquare, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConversationMetrics } from "../core/useKolibriChat";
import type { ChatMessage } from "../types/chat";
import ChatMessageView from "./ChatMessage";

interface ChatViewProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isBusy: boolean;
  conversationId: string;
  conversationTitle: string;
  modeLabel: string;
  metrics: ConversationMetrics;
  onSuggestionSelect: (value: string) => void;
}

const DEFAULT_SUGGESTIONS = [
  "Сформулируй краткое резюме беседы",
  "Предложи три следующих шага",
  "Выпиши ключевые идеи",
  "Помоги подготовить письмо по теме диалога",
];

const formatPercent = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return `${Math.round(value * 100)}%`;
};

const ChatView = ({
  messages,
  isLoading,
  isBusy,
  conversationId,
  conversationTitle,
  modeLabel,
  metrics,
  onSuggestionSelect,
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

    container.scrollTop = container.scrollHeight;
  }, [messages, isLoading, isNearBottom]);

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, []);

  const lastAssistantMessage = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      if (candidate.role === "assistant" && candidate.content.trim()) {
        return candidate;
      }
    }
    return undefined;
  }, [messages]);

  const quickSuggestions = useMemo(() => {
    const suggestions = new Set<string>();

    if (lastAssistantMessage?.content) {
      const [firstSentence] = lastAssistantMessage.content.split(/[.!?\n]/u);
      const trimmed = firstSentence?.trim();
      if (trimmed) {
        const excerpt = trimmed.length > 96 ? `${trimmed.slice(0, 96)}…` : trimmed;
        suggestions.add(`Раскрой подробнее: ${excerpt}`);
      }
    }

    suggestions.add(`Применим режим ${modeLabel} к новому примеру`);
    DEFAULT_SUGGESTIONS.forEach((item) => suggestions.add(item));

    return Array.from(suggestions).slice(0, 4);
  }, [lastAssistantMessage, modeLabel]);

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
          <div
            key={`divider-${dateKey}-${index}`}
            className="relative pl-12 pr-4"
          >
            <div className="flex items-center gap-3 text-[0.7rem] uppercase tracking-[0.35em] text-text-secondary">
              <span className="h-px flex-1 bg-border-strong/60" />
              <span className="rounded-full border border-border-strong/60 bg-background-card/70 px-3 py-1 text-text-secondary">
                {formattedDate}
              </span>
              <span className="h-px flex-1 bg-border-strong/60" />
            </div>
          </div>,
        );
      }

      items.push(
        <div key={message.id} className="pl-12 pr-4">
          <ChatMessageView message={message} latestUserMessage={contextUserMessage} />
        </div>,
      );
    });

    return items;
  }, [messages]);

  const conversationShortId = useMemo(() => conversationId.slice(0, 8), [conversationId]);

  const stats = useMemo(
    () => [
      {
        icon: Sparkles,
        label: "Режим",
        value: modeLabel,
      },
      {
        icon: MessageSquare,
        label: "Сообщений",
        value: String(metrics.userMessages + metrics.assistantMessages),
      },
      {
        icon: Activity,
        label: "Стабильность",
        value: formatPercent(metrics.stability),
      },
      {
        icon: Clock3,
        label: "Задержка P50",
        value: `${metrics.latencyP50.toFixed(0)} мс`,
      },
    ],
    [metrics.assistantMessages, metrics.latencyP50, metrics.stability, metrics.userMessages, modeLabel],
  );

  return (
    <section className="flex h-full flex-col gap-6">
      <header className="glass-panel relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/3 bg-gradient-to-l from-primary/20 via-primary/5 to-transparent blur-2xl lg:block" aria-hidden="true" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.35em] text-primary/80">Kolibri Σ</p>
            <h2 className="text-2xl font-semibold text-text-primary">
              {conversationTitle || "Диалог с Колибри"}
            </h2>
          </div>
          <span className="pill-badge border-primary/60 bg-primary/15 text-primary">
            #{conversationShortId}
          </span>
        </div>
        <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="glass-panel flex items-center gap-3 px-4 py-3 text-sm text-text-secondary"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <dt className="text-[0.7rem] uppercase tracking-[0.3em] text-text-secondary/80">{label}</dt>
                <dd className="text-sm font-semibold text-text-primary">{value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </header>

      <div className="glass-panel flex min-h-0 flex-1 flex-col p-4 md:p-6">
        <div className="relative flex-1 overflow-hidden">
          <div className="pointer-events-none absolute left-8 top-6 bottom-6 hidden w-px bg-gradient-to-b from-primary/60 via-border-strong/50 to-transparent lg:block" aria-hidden="true" />
          <div className="soft-scroll absolute inset-0 space-y-6 overflow-y-auto pr-3" ref={containerRef}>
            {renderedMessages}
            {isLoading && (
              <div className="glass-panel flex items-center gap-3 border-dashed border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
                <span className="flex h-2 w-2 animate-pulse rounded-full bg-primary" />
                Колибри формирует ответ...
              </div>
            )}
          </div>
          {!isNearBottom && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
              <button
                type="button"
                onClick={scrollToBottom}
                className="pointer-events-auto flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-[1.02]"
              >
                <ArrowDownWideNarrow className="h-4 w-4" />
                К последнему сообщению
              </button>
            </div>
          )}
        </div>

        {quickSuggestions.length > 0 && (
            <div className="glass-panel mt-4 space-y-3 p-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.35em] text-text-secondary">
                <span>Быстрые подсказки</span>
                <span className="text-primary">Фокус: {modeLabel}</span>
              </div>
              <div className="flex flex-wrap gap-3">
                {quickSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => onSuggestionSelect(suggestion)}
                    className="group flex items-center gap-2 rounded-full border border-border-strong/70 bg-background-card/80 px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isBusy}
                  >
                    <Sparkles className="h-4 w-4 text-primary transition-transform group-hover:scale-110" />
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default ChatView;
