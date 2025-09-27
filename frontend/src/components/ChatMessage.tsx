import type { ChatMessage as ChatMessageModel } from "../types/chat";

interface ChatMessageProps {
  message: ChatMessageModel;
}

const ChatMessage = ({ message }: ChatMessageProps) => {
  const isUser = message.role === "user";

  return (
    <div className="flex items-start gap-3">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full ${
          isUser ? "bg-primary/20 text-primary" : "bg-accent-coral/10 text-accent-coral"
        }`}
      >
        {isUser ? "Я" : "К"}
      </div>
      <div className="rounded-2xl bg-white/80 p-4 shadow-card">
        <p className="whitespace-pre-line text-sm leading-relaxed text-text-dark">{message.content}</p>
        <p className="mt-2 text-xs text-text-light">{message.timestamp}</p>
      </div>
    </div>
  );
};

export default ChatMessage;
