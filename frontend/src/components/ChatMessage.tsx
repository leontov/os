import type { ChatMessage as ChatMessageModel } from "../types/chat";
import { formatFileSize } from "../utils/files";

interface ChatMessageProps {
  message: ChatMessageModel;
}

const ChatMessage = ({ message }: ChatMessageProps) => {
  const isUser = message.role === "user";
  const hasContent = message.content.trim().length > 0;

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
        {hasContent && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-text-dark">{message.content}</p>
        )}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.attachments.map((attachment) => {
              const preview = attachment.text.trim();
              const truncated = preview.length > 400 ? `${preview.slice(0, 400)}…` : preview;

              return (
                <div
                  key={attachment.id}
                  className="rounded-xl bg-background-light/60 p-3 text-xs text-text-dark"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{attachment.name}</span>
                    <span className="text-text-light">{formatFileSize(attachment.size)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-text-light">
                    {truncated || "Текст не обнаружен."}
                  </p>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-xs text-text-light">{message.timestamp}</p>
      </div>
    </div>
  );
};

export default ChatMessage;
