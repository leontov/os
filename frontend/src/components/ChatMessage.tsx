
import { useState } from "react";



import type { ChatMessage as ChatMessageModel } from "../types/chat";

const formatScore = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return value.toFixed(2);
};

interface ChatMessageProps {
  message: ChatMessageModel;
  conversationId: string;
  latestUserMessage?: ChatMessageModel;
}

const ChatMessage = ({ message, conversationId, latestUserMessage }: ChatMessageProps) => {
  const isUser = message.role === "user";
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const hasContext = !isUser && Boolean(message.context?.length);
  const contextCount = message.context?.length ?? 0;

  return (
    <div className="flex items-start gap-4">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${
          isUser ? "bg-primary/20 text-primary" : "bg-accent/20 text-accent"
        }`}
      >
        {isUser ? "Я" : "К"}
      </div>
      <div className="max-w-3xl rounded-2xl border border-border-strong bg-background-input/90 p-4">
        <p className="whitespace-pre-line text-sm leading-relaxed text-text-primary">{message.content}</p>
        <p className="mt-2 text-xs text-text-secondary">{message.timestamp}</p>

        {!isUser && (hasContext || message.contextError) && (
          <div className="mt-3 space-y-3 border-t border-dashed border-border-strong pt-3 text-xs text-text-secondary">
            {hasContext && (
              <div>
                <button
                  type="button"
                  onClick={() => setIsContextExpanded((prev) => !prev)}
                  className="rounded-lg border border-primary/40 bg-background-input/80 px-3 py-1 font-semibold text-primary transition-colors hover:border-primary"
                >
                  {isContextExpanded ? "Скрыть контекст" : "Показать контекст"} ({contextCount})
                </button>
                {isContextExpanded && (
                  <div className="mt-2 space-y-2">
                    {message.context?.map((snippet, index) => (
                      <article
                        key={snippet.id}
                        className="rounded-xl border border-border-strong bg-background-card/70 p-3"
                        aria-label={`Источник ${index + 1}`}
                      >
                        <div className="flex items-center justify-between text-[0.7rem] font-semibold text-text-secondary">
                          <span className="uppercase tracking-wide text-text-primary">Источник {index + 1}</span>
                          <span className="text-text-secondary">Релевантность: {formatScore(snippet.score)}</span>
                        </div>
                        <p className="mt-1 text-sm font-semibold text-text-primary">{snippet.title}</p>
                        <p className="mt-2 whitespace-pre-line text-[0.85rem] leading-relaxed text-text-secondary">
                          {snippet.content}
                        </p>
                        {snippet.source && (
                          <p className="mt-2 text-[0.7rem] uppercase tracking-wide text-primary/80">{snippet.source}</p>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
            {message.contextError && (
              <p className="rounded-lg bg-accent/10 px-3 py-2 text-[0.75rem] text-accent">
                Контекст недоступен: {message.contextError}
              </p>
            )}
          </div>

        )}
      </div>
    </div>
  );
};

export default ChatMessage;
