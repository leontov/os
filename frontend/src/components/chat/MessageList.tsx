import { useCallback, useEffect, useRef } from "react";
import { Message, type MessageBlock } from "./Message";
import { Skeleton } from "../feedback/Skeleton";
import { EmptyState } from "../feedback/Empty";
import { ErrorState } from "../feedback/Error";
import { useVirtualList } from "../../shared/hooks/useVirtualList";

interface MessageListProps {
  messages: ReadonlyArray<MessageBlock>;
  status: "idle" | "loading" | "error";
  onRetry: () => void;
}

export function MessageList({ messages, status, onRetry }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { virtualItems, totalHeight, scrollToIndex } = useVirtualList({
    itemCount: messages.length,
    estimateSize: useCallback(() => 168, []),
    overscan: 6,
    containerRef,
  });

  useEffect(() => {
    if (messages.length > 0) {
      scrollToIndex(messages.length - 1);
    }
  }, [messages, scrollToIndex]);

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
      <div style={{ height: totalHeight, position: "relative" }}>
        {virtualItems.map((item) => {
          const message = messages[item.index];
          return (
            <div
              key={message.id}
              style={{
                position: "absolute",
                top: item.start,
                width: "100%",
                transform: "translateZ(0)",
              }}
            >
              <Message message={message} compact={false} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
