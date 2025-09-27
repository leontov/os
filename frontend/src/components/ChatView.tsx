import { useEffect, useRef } from "react";
import type { ChatMessage, PromptScenario } from "../types/chat";
import ChatMessageView from "./ChatMessage";

interface ChatViewProps {
  messages: ChatMessage[];
  isLoading: boolean;
  prefillScenario?: PromptScenario | null;
}

const ChatView = ({ messages, isLoading, prefillScenario }: ChatViewProps) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const shouldAnimateRef = useRef(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const behavior = shouldAnimateRef.current ? "smooth" : "auto";
    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    shouldAnimateRef.current = true;
  }, [messages, isLoading, prefillScenario]);

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-[36px] border border-white/60 bg-white/80 shadow-hero">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/60 px-10 py-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Диалог с Колибри</p>
          <h2 className="mt-2 text-2xl font-semibold text-text-dark">Канал когнитивной связи</h2>
        </div>
        <div className="flex items-center gap-3 text-sm text-text-light">
          <span className={`inline-flex h-2 w-2 rounded-full ${isLoading ? "bg-primary animate-pulse" : "bg-primary"}`} />
          {isLoading ? "Колибри формирует ответ..." : "Сеанс активен"}
        </div>
      </header>
      <div ref={viewportRef} className="flex-1 space-y-6 overflow-y-auto px-10 py-8">
        {!messages.length && prefillScenario && (
          <div className="rounded-3xl border border-primary/40 bg-primary/10 p-8 text-left text-sm text-text-dark shadow-card">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Сценарий активирован</p>
            <p className="mt-3 text-xl font-semibold text-text-dark">{prefillScenario.title}</p>
            <p className="mt-2 text-text-light">{prefillScenario.description}</p>
            <p className="mt-4 rounded-2xl border border-dashed border-primary/30 bg-white/80 p-4 text-sm text-text-dark">
              {prefillScenario.prompt}
            </p>
          </div>
        )}
        {messages.map((message) => (
          <ChatMessageView key={message.id} message={message} />
        ))}
        {isLoading && (
          <div className="flex items-center gap-3 text-sm text-text-light">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            Колибри формирует ответ...
          </div>
        )}
        {!messages.length && !isLoading && !prefillScenario && (
          <div className="rounded-3xl border border-dashed border-primary/30 bg-primary/5 p-10 text-center text-sm text-text-light">
            Отправь сообщение, чтобы активировать поток идей.
          </div>
        )}
      </div>
    </section>
  );
};

export default ChatView;
