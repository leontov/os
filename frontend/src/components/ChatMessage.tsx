import type { ChatMessage as ChatMessageModel } from "../types/chat";

interface ChatMessageProps {
  message: ChatMessageModel;
}

const ChatMessage = ({ message }: ChatMessageProps) => {
  const isUser = message.role === "user";

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex max-w-2xl items-end gap-3 ${
          isUser ? "flex-row-reverse text-right" : "flex-row"
        }`}
      >
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-semibold ${
            isUser ? "bg-primary/20 text-primary" : "bg-accent-coral/20 text-accent-coral"
          }`}
        >
          {isUser ? "Я" : "К"}
        </div>
        <div
          className={`rounded-3xl border p-5 text-left shadow-layer ${
            isUser
              ? "border-primary/30 bg-primary/10 text-text-dark"
              : "border-white/70 bg-white/90 text-text-dark"
          }`}
        >
          <p className="whitespace-pre-line text-base leading-relaxed">{message.content}</p>
          <p className={`mt-3 text-xs ${isUser ? "text-primary/70" : "text-text-light"}`}>{message.timestamp}</p>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
