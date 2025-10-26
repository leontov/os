import {
  BookmarkCheck,
  BookmarkPlus,
  Check,
  Copy,
  Link2,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import AttachmentPreviewList, {
  type AttachmentPreviewItem,
} from "./attachments/AttachmentPreviewList";
import ChatMarkdown from "./ChatMarkdown";
import type { ChatMessage as ChatMessageModel } from "../types/chat";

interface ChatMessageProps {
  message: ChatMessageModel;
  latestUserMessage?: ChatMessageModel;
}

const formatScore = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return value.toFixed(2);
};

const ChatMessageView = ({ message, latestUserMessage }: ChatMessageProps) => {
  const isUser = message.role === "user";
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [reaction, setReaction] = useState<"up" | "down" | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const hasContext = !isUser && Boolean(message.context?.length);
  const contextCount = message.context?.length ?? 0;

  const attachmentItems = useMemo<AttachmentPreviewItem[]>(() => {
    if (!message.attachments?.length) {
      return [];
    }

    return message.attachments.map((attachment) => {
      const previewUrl =
        attachment.dataBase64 && attachment.type.startsWith("image/")
          ? `data:${attachment.type};base64,${attachment.dataBase64}`
          : undefined;

      return {
        id: attachment.id,
        name: attachment.name,
        size: attachment.size,
        status: "success",
        progress: 100,
        previewUrl,
      } satisfies AttachmentPreviewItem;
    });
  }, [message.attachments]);

  const isoDate = useMemo(() => {
    if (!message.isoTimestamp) {
      return null;
    }
    try {
      return new Date(message.isoTimestamp).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return null;
    }
  }, [message.isoTimestamp]);

  const actorLabel = isUser ? "Вы" : "Kolibri GPT";
  const avatarLabel = isUser ? "Вы" : "Σ";

  const handleCopy = useCallback(async () => {
    if (!navigator?.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(message.content);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 1600);
    } catch {
      setIsCopied(false);
    }
  }, [message.content]);

  const toggleReaction = useCallback((value: "up" | "down") => {
    setReaction((previous) => (previous === value ? null : value));
  }, []);

  const togglePinned = useCallback(() => {
    setIsPinned((previous) => !previous);
  }, []);

  const handleToggleContext = useCallback(() => {
    setIsContextExpanded((previous) => !previous);
  }, []);

  const bubbleClasses = isUser
    ? "border-white/10 bg-[rgba(64,65,79,0.88)] text-white shadow-[0_26px_60px_-34px_rgba(15,23,42,0.7)]"
    : "border-border/60 bg-surface/95 text-text shadow-[0_26px_68px_-38px_rgba(15,23,42,0.5)]";

  return (
    <article className={`group relative flex w-full gap-4 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-surface text-[0.65rem] font-semibold uppercase tracking-[0.22em] ${
          isUser ? "text-white" : "text-primary"
        }`}
        aria-hidden="true"
      >
        {avatarLabel}
      </span>

      <div className={`flex min-w-0 flex-1 flex-col gap-3 ${isUser ? "items-end text-right" : "items-start text-left"}`}>
        <div className={`relative w-full rounded-3xl border px-5 py-5 transition-colors ${bubbleClasses}`}>
          <header
            className={`mb-3 flex flex-wrap items-center gap-3 text-[0.7rem] uppercase tracking-[0.32em] ${
              isUser ? "justify-end text-white/70" : "justify-between text-text-muted"
            }`}
          >
            <span>{actorLabel}</span>
            <div className="flex items-center gap-2 text-[0.7rem]">
              <span className={isUser ? "text-white/70" : "text-text-muted"}>{isoDate ?? message.timestamp}</span>
              <button
                type="button"
                onClick={handleCopy}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.68rem] font-semibold transition-colors ${
                  isUser
                    ? "border-white/30 bg-white/10 text-white/80 hover:border-white/60 hover:bg-white/20 hover:text-white"
                    : "border-border/70 bg-surface text-text-muted hover:border-primary hover:text-primary"
                }`}
              >
                {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {isCopied ? "Скопировано" : "Копировать"}
              </button>
            </div>
          </header>

          {message.content ? (
            <ChatMarkdown content={message.content} tone={isUser ? "user" : "assistant"} />
          ) : null}

          {attachmentItems.length ? (
            <div className="mt-4">
              <AttachmentPreviewList
                items={attachmentItems}
                tone={isUser ? "user" : "assistant"}
                readOnly
              />
            </div>
          ) : null}

          {!isUser && (hasContext || message.contextError) ? (
            <div className="mt-4 space-y-3 rounded-2xl border border-dashed border-border/70 bg-surface/90 p-4 text-xs text-text-muted">
              {hasContext ? (
                <div>
                  <button
                    type="button"
                    onClick={handleToggleContext}
                    className="rounded-full border border-primary/40 bg-primary/10 px-4 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-primary transition-colors hover:border-primary"
                  >
                    {isContextExpanded ? "Скрыть контекст" : "Показать контекст"} ({contextCount})
                  </button>
                  {isContextExpanded ? (
                    <div className="mt-3 space-y-3">
                      {message.context?.map((snippet, index) => (
                        <article key={snippet.id} className="rounded-2xl border border-border/60 bg-background-card/90 p-3 shadow-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-text-muted">
                            <span className="text-text">Источник {index + 1}</span>
                            <span>Релевантность: {formatScore(snippet.score)}</span>
                          </div>
                          <p className="mt-1 text-sm font-semibold text-text">{snippet.title}</p>
                          <p className="mt-2 whitespace-pre-wrap text-[0.85rem] leading-relaxed text-text-muted">{snippet.content}</p>
                          {snippet.source ? (
                            <p className="mt-2 flex items-center gap-1 text-[0.68rem] uppercase tracking-[0.28em] text-primary">
                              <Link2 className="h-3.5 w-3.5" /> {snippet.source}
                            </p>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {message.contextError ? (
                <p className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-[0.75rem] text-accent">
                  Контекст недоступен: {message.contextError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <footer
          className={`flex w-full flex-wrap items-center gap-3 text-[0.7rem] ${
            isUser ? "justify-end text-white/70" : "text-text-muted"
          }`}
        >
          {!isUser && message.modeLabel ? (
            <span className="rounded-full border border-border/60 bg-surface px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.3em] text-text-muted">
              {message.modeLabel}
            </span>
          ) : null}
          {!isUser && latestUserMessage ? (
            <span className="truncate rounded-full border border-border/60 bg-surface px-3 py-1 text-text-muted">
              ↪ {latestUserMessage.content.slice(0, 80)}
              {latestUserMessage.content.length > 80 ? "…" : ""}
            </span>
          ) : null}
          {!isUser && hasContext ? (
            <span className="rounded-full border border-border/60 bg-surface px-3 py-1 text-text-muted">
              Контекстов: {contextCount}
            </span>
          ) : null}
          {isPinned ? (
            <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-primary">Закреплено</span>
          ) : null}

          {!isUser ? (
            <div className="ml-auto flex items-center gap-1 rounded-full border border-border/60 bg-surface px-2 py-1 text-text-muted">
              <button
                type="button"
                onClick={() => toggleReaction("up")}
                className={`flex items-center gap-1 rounded-full px-2 py-1 transition-colors ${
                  reaction === "up" ? "text-primary" : "hover:text-primary"
                }`}
                aria-pressed={reaction === "up"}
              >
                <ThumbsUp className="h-3.5 w-3.5" />
                Полезно
              </button>
              <button
                type="button"
                onClick={() => toggleReaction("down")}
                className={`flex items-center gap-1 rounded-full px-2 py-1 transition-colors ${
                  reaction === "down" ? "text-accent" : "hover:text-accent"
                }`}
                aria-pressed={reaction === "down"}
              >
                <ThumbsDown className="h-3.5 w-3.5" />
                Улучшить
              </button>
              <button
                type="button"
                onClick={togglePinned}
                className={`flex items-center gap-1 rounded-full px-2 py-1 transition-colors ${
                  isPinned ? "text-primary" : "hover:text-primary"
                }`}
                aria-pressed={isPinned}
              >
                {isPinned ? <BookmarkCheck className="h-3.5 w-3.5" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
                {isPinned ? "Сохранено" : "Сохранить"}
              </button>
            </div>
          ) : null}
        </footer>
      </div>
    </article>
  );
};

export default ChatMessageView;
