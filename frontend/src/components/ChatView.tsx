import type { ChatMessage } from "../types/chat";
import ChatMessageView from "./ChatMessage";

interface ChatViewProps {
  messages: ChatMessage[];
  isLoading: boolean;
}

const ChatView = ({ messages, isLoading }: ChatViewProps) => (
  <section className="flex h-full flex-col rounded-3xl bg-white/70 p-8 shadow-card">
    <div className="flex-1 space-y-6 overflow-y-auto pr-2">
      {messages.map((message) => (
        <ChatMessageView key={message.id} message={message} />
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

export default ChatView;
