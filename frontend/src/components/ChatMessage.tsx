import type { ChatMessage as ChatMessageModel } from "../types/chat";

interface ChatMessageProps {
  message: ChatMessageModel;
}

const ChatMessage = ({ message }: ChatMessageProps) => {
  const isUser = message.role === "user";
  const hasFileContext = Boolean(message.fileContext);
  const patches = message.patches ?? [];

  return (
    <div className="flex items-start gap-3">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full ${
          isUser ? "bg-primary/20 text-primary" : "bg-accent-coral/10 text-accent-coral"
        }`}
      >
        {isUser ? "Я" : "К"}
      </div>
      <div className="flex-1 rounded-2xl bg-white/80 p-4 shadow-card">
        <p className="whitespace-pre-line text-sm leading-relaxed text-text-dark">{message.content}</p>

        {hasFileContext ? (
          <div className="mt-3 rounded-xl bg-background-light/60 p-3 text-xs">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-light">Контекст файла</p>
            <p className="mt-1 font-medium text-text-dark">{message.fileContext?.path}</p>
            {message.fileContext?.repository ? (
              <p className="mt-1 text-text-light">{message.fileContext.repository}</p>
            ) : null}
          </div>
        ) : null}

        {patches.length > 0 ? (
          <div className="mt-3 space-y-2 text-xs">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-light">Предложенные изменения</p>
            {patches.map((patch) => (
              <div key={patch.id} className="rounded-xl bg-background-light/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-text-dark">{patch.filePath}</span>
                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-light">
                    {patch.mode === "explain" ? "Объяснить" : "Рефакторинг"}
                  </span>
                </div>
                {patch.summary ? (
                  <p className="mt-2 font-medium text-text-dark">{patch.summary}</p>
                ) : null}
                {patch.description ? (
                  <p className="mt-2 whitespace-pre-line text-text-light">{patch.description}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <p className="mt-2 text-xs text-text-light">{message.timestamp}</p>
      </div>
    </div>
  );
};

export default ChatMessage;
