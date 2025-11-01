import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { Message, type MessageBlock } from "./Message";
import { Skeleton } from "../feedback/Skeleton";
import { EmptyState } from "../feedback/Empty";
import { ErrorState } from "../feedback/Error";
import { useVirtualList } from "../../shared/hooks/useVirtualList";
import { Button } from "../ui/Button";
import { useI18n } from "../../app/i18n";

interface MessageListProps {
  messages: ReadonlyArray<MessageBlock>;
  status: "idle" | "loading" | "error";
  onRetry: () => void;
}

export function MessageList({ messages, status, onRetry }: MessageListProps) {
  const { t, locale } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }), [locale]);

  type RenderableItem = { kind: "message"; message: MessageBlock } | { kind: "separator"; id: string; label: string };

  const items = useMemo<RenderableItem[]>(() => {
    if (messages.length === 0) {
      return [];
    }
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const result: RenderableItem[] = [];
    let lastDay: string | null = null;
    for (const message of messages) {
      const timestamp = message.timestamp ?? Date.now();
      const date = new Date(timestamp);
      const dayKey = date.toISOString().slice(0, 10);
      if (dayKey !== lastDay) {
        let label = dateFormatter.format(date);
        if (date.toDateString() === today.toDateString()) {
          label = t("message.separator.today");
        } else if (date.toDateString() === yesterday.toDateString()) {
          label = t("message.separator.yesterday");
        }
        result.push({ kind: "separator", id: `sep-${dayKey}`, label });
        lastDay = dayKey;
      }
      result.push({ kind: "message", message });
    }
    return result;
  }, [messages, t, dateFormatter]);

  const estimateSize = useCallback(
    (index: number) => (items[index]?.kind === "separator" ? 56 : 168),
    [items],
  );

  const { virtualItems, totalHeight, scrollToIndex, registerItem } = useVirtualList({
    itemCount: items.length,
    estimateSize,
    overscan: 6,
    containerRef,
  });

  const [isAtBottom, setIsAtBottom] = useState(true);
  const [pending, setPending] = useState(0);
  const previousMessageCountRef = useRef(messages.length);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const handleScroll = () => {
      const { scrollTop, clientHeight, scrollHeight } = container;
      const atBottom = scrollHeight - (scrollTop + clientHeight) < 48;
      setIsAtBottom(atBottom);
      if (atBottom) {
        setPending(0);
      }
    };
    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    const previous = previousMessageCountRef.current;
    if (messages.length > previous) {
      if (isAtBottom) {
        scrollToIndex(items.length - 1);
      } else {
        setPending((value) => value + (messages.length - previous));
      }
    }
    previousMessageCountRef.current = messages.length;
  }, [messages.length, isAtBottom, scrollToIndex, items.length]);

  const scrollToBottom = useCallback(() => {
    scrollToIndex(items.length - 1);
    const container = containerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
    setPending(0);
  }, [scrollToIndex, items.length]);

  if (status === "error") {
    return (
      <div className="flex h-full items-center justify-center">
        <ErrorState onRetry={onRetry} />
      </div>
    );
  }

  if (status === "loading" && messages.length === 0) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} />
        ))}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full overflow-y-auto" role="log" aria-live="polite">
      <div
        aria-hidden
        className="pointer-events-none absolute left-[3.75rem] top-0 hidden h-full w-px bg-[var(--surface-border)] sm:block"
      />
      <div style={{ height: totalHeight, position: "relative" }}>
        {virtualItems.map((item) => {
          const renderable = items[item.index];
          return (
            <div
              key={renderable.kind === "message" ? renderable.message.id : renderable.id}
              style={{
                position: "absolute",
                top: item.start,
                width: "100%",
                transform: "translateZ(0)",
              }}
              ref={(node) => registerItem(item.index, node)}
            >
              {renderable.kind === "separator" ? (
                <div className="py-4 text-center text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">
                  {renderable.label}
                </div>
              ) : (
                <Message
                  message={renderable.message}
                  compact={(() => {
                    const previous = item.index > 0 ? items[item.index - 1] : undefined;
                    return (
                      previous?.kind === "message" &&
                      previous.message.role === renderable.message.role &&
                      previous.message.authorLabel === renderable.message.authorLabel
                    );
                  })()}
                />
              )}
            </div>
          );
        })}
      </div>
      {!isAtBottom ? (
        <div className="pointer-events-none absolute bottom-5 right-5 flex flex-col items-end gap-2">
          {pending > 0 ? (
            <span className="pointer-events-auto rounded-full bg-[rgba(74,222,128,0.18)] px-3 py-1 text-xs font-semibold text-[var(--brand)] shadow-[var(--brand-glow)]">
              {pending} {t("message.new")}
            </span>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            className="pointer-events-auto"
            onClick={scrollToBottom}
            aria-label={t("message.scrollToBottom")}
          >
            <ArrowDown aria-hidden className="h-4 w-4" />
            <span>{t("message.scrollToBottom")}</span>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
