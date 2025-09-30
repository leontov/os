import { useEffect, useRef } from "react";
import type { ChatMessage, FeedbackRating } from "../types/chat";
import ChatMessageView from "./ChatMessage";

interface ChatViewProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onFeedbackSubmit?: (messageId: string, rating: FeedbackRating, comment?: string) => void;
}

const ChatView = ({ messages, isLoading, onFeedbackSubmit }: ChatViewProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [messages, isLoading]);

  return (
    <section className="flex h-full flex-col rounded-3xl bg-white/70 p-8 shadow-card">
      <div className="flex-1 space-y-6 overflow-y-auto pr-2" ref={containerRef}>
        {messages.map((message) => (
          <ChatMessageView
            key={message.id}
            message={message}
            onFeedbackSubmit={
              message.role === "assistant"
                ? (rating, comment) => onFeedbackSubmit?.(message.id, rating, comment)
                : undefined
            }
          />
        ))}
        {isLoading && (
          <div className="flex items-center gap-3 text-sm text-text-light">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            Колибри формирует ответ...
          </div>
        )}
        {!messages.length && !isLoading && (
          <div className="rounded-2xl bg-background-light/60 p-6 text-sm text-text-light">
            Отправь сообщение, чтобы начать диалог с Колибри.
          </div>
        )}
      </div>
    </section>
  );
};

export default ChatView;
