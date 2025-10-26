import { Check, Copy, Link2, Paperclip, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import type { ChatMessage as ChatMessageModel } from "../types/chat";
import "highlight.js/styles/github.css";

const formatScore = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return value.toFixed(2);
};

const formatAttachmentSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} КБ`;
  }
  return `${bytes} Б`;
};

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-4 list-disc space-y-2 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 list-decimal space-y-2 pl-6">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mb-4 border-l-4 border-primary/30 bg-background-card/70 px-4 py-2 text-[0.95rem] italic text-text-secondary">
      {children}
    </blockquote>
  ),
  code({ inline, className, children }: { inline?: boolean; className?: string; children?: ReactNode }) {
    const text = String(children).replace(/\n$/, "");
    if (inline) {
      return (
        <code className="rounded-md bg-background-card/80 px-1.5 py-0.5 font-mono text-[0.85rem]">
          {text}
        </code>
      );
    }
    return (
      <pre className="soft-scroll relative mb-4 max-h-[420px] overflow-auto rounded-2xl border border-border/60 bg-background-card/90 p-4 text-[0.85rem] leading-relaxed">
        <code className={className}>{text}</code>
      </pre>
    );
  },
  table: ({ children }) => (
    <div className="mb-4 overflow-x-auto rounded-2xl border border-border/60 bg-background-card/80">
      <table className="min-w-full divide-y divide-border/60 text-left text-[0.85rem]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-background-card/90">{children}</thead>,
  th: ({ children }) => (
    <th className="px-4 py-3 text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-text-secondary">
      {children}
    </th>
  ),
  tbody: ({ children }) => <tbody className="divide-y divide-border/60">{children}</tbody>,
  td: ({ children }) => <td className="px-4 py-3 text-[0.85rem] text-text-primary">{children}</td>,
  a: ({ children, href }) => (
    <a
      href={href ?? "#"}
      target="_blank"
      rel="noreferrer"
      className="font-semibold text-primary underline decoration-dotted underline-offset-4 transition-colors hover:text-primary/80"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-6 border-border/70" />,
};

const markdownRemarkPlugins = [remarkGfm];
const markdownRehypePlugins = [rehypeHighlight];

interface ChatMessageProps {
  message: ChatMessageModel;
  latestUserMessage?: ChatMessageModel;
  disableActions?: boolean;
  onRegenerate?: (message: ChatMessageModel, latestUserMessage?: ChatMessageModel) => void;
}

const ChatMessage = ({ message, latestUserMessage, disableActions = false, onRegenerate }: ChatMessageProps) => {
  const isUser = message.role === "user";
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [reaction, setReaction] = useState<"up" | "down" | null>(null);
  const hasContext = !isUser && Boolean(message.context?.length);
  const contextCount = message.context?.length ?? 0;

  const isoDate = useMemo(() => {
    if (!message.isoTimestamp) {
      return null;
    }
    try {
      return new Date(message.isoTimestamp).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return null;
    }
  }, [message.isoTimestamp]);

  const actorLabel = isUser ? "Вы" : "Kolibri Σ";
  const avatarLabel = isUser ? "Вы" : "Σ";

  const handleCopy = useCallback(async () => {
    if (!navigator?.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(message.content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1500);
    } catch {
      setIsCopied(false);
    }
  }, [message.content]);

  const handleReaction = useCallback((value: "up" | "down") => {
    setReaction((previous) => (previous === value ? null : value));
  }, []);

  const avatar = isUser ? (
    <span
      className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-primary/90 via-primary/75 to-primary/60 text-sm font-semibold text-white shadow-[0_18px_35px_-22px_rgba(79,70,229,0.9)]"
      aria-hidden="true"
    >
      {avatarLabel}
    </span>
  ) : (
    <span
      className="flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-background-card/90 shadow-[0_18px_35px_-22px_rgba(7,9,70,0.9)]"
      aria-hidden="true"
    >
      <img src="/kolibri.svg" alt="Аватар ассистента" className="h-6 w-6" />
    </span>
  );

  const bubbleClasses = isUser
    ? "border-primary/50 bg-gradient-to-br from-primary/85 via-primary/70 to-primary/60 text-white shadow-[0_28px_60px_-32px_rgba(99,102,241,0.8)]"
    : "border-border-strong/70 bg-background-input/85 text-text-primary";

  return (
    <article className={`flex w-full gap-4 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && avatar}
      <div className={`flex max-w-3xl flex-col gap-2 ${isUser ? "items-end text-right" : "items-start"}`}>
        <div
          className={`relative w-full rounded-3xl border ${bubbleClasses} p-6 backdrop-blur`}
        >
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3 text-[0.7rem] uppercase tracking-[0.35em]">
            <span className={isUser ? "text-white/80" : "text-text-secondary/80"}>{actorLabel}</span>
            <span className="text-text-secondary/70">{isoDate ?? message.timestamp}</span>
          </header>

          {message.content ? (
            <div
              className={`flex flex-col gap-4 text-[0.95rem] leading-relaxed ${
                isUser ? "text-white/95" : "text-text-primary"
              }`}
            >
              <ReactMarkdown
                remarkPlugins={markdownRemarkPlugins}
                rehypePlugins={markdownRehypePlugins}
                components={markdownComponents}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          ) : null}

          {message.attachments?.length ? (
            <div className="mt-4 space-y-2">
              {message.attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className={`flex items-center gap-3 rounded-2xl border px-3 py-2 text-[0.8rem] ${
                    isUser
                      ? "border-white/25 bg-white/10 text-white/90"
                      : "border-border-strong bg-background-card/80 text-text-secondary"
                  }`}
                >
                  <Paperclip className={`h-3.5 w-3.5 ${isUser ? "text-white" : "text-primary"}`} />
                  <span className="truncate" title={attachment.name}>
                    {attachment.name}
                  </span>
                  <span className="ml-auto whitespace-nowrap">{formatAttachmentSize(attachment.size)}</span>
                </div>
              ))}
            </div>
          ) : null}

          {!isUser && (hasContext || message.contextError) && (
            <div className="mt-4 space-y-3 rounded-2xl border border-dashed border-border-strong/70 bg-background-card/80 p-4 text-xs text-text-secondary">
              {hasContext && (
                <div>
                  <button
                    type="button"
                    onClick={() => setIsContextExpanded((previous) => !previous)}
                    className="rounded-full border border-primary/40 bg-primary/10 px-4 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-primary transition-colors hover:border-primary"
                  >
                    {isContextExpanded ? "Скрыть контекст" : "Показать контекст"} ({contextCount})
                  </button>
                  {isContextExpanded && (
                    <div className="mt-3 space-y-3">
                      {message.context?.map((snippet, index) => (
                        <article
                          key={snippet.id}
                          className="glass-panel p-3"
                          aria-label={`Источник ${index + 1}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[0.7rem] font-semibold text-text-secondary">
                            <span className="uppercase tracking-[0.3em] text-text-primary">Источник {index + 1}</span>
                            <span className="text-text-secondary">Релевантность: {formatScore(snippet.score)}</span>
                          </div>
                          <p className="mt-1 text-sm font-semibold text-text-primary">{snippet.title}</p>
                          <p className="mt-2 whitespace-pre-line text-[0.85rem] leading-relaxed text-text-secondary">
                            {snippet.content}
                          </p>
                          {snippet.source && (
                            <p className="mt-2 flex items-center gap-1 text-[0.7rem] uppercase tracking-[0.3em] text-primary/80">
                              <Link2 className="h-3.5 w-3.5" /> {snippet.source}
                            </p>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {message.contextError && (
                <p className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-[0.75rem] text-accent">
                  Контекст недоступен: {message.contextError}
                </p>
              )}
            </div>
          )}
        </div>

        <footer
          className={`mt-4 flex w-full flex-wrap items-center justify-between gap-3 text-[0.7rem] ${
            isUser ? "text-white/70" : "text-text-secondary"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            {!isUser && message.modeLabel ? (
              <span className="pill-badge border-primary/40 bg-primary/10 text-primary">{message.modeLabel}</span>
            ) : null}
            {!isUser && latestUserMessage ? (
              <span className="truncate rounded-full border border-border-strong/60 bg-background-card/70 px-3 py-1 text-text-secondary">
                ↪ {latestUserMessage.content.slice(0, 80)}
                {latestUserMessage.content.length > 80 ? "…" : ""}
              </span>
            ) : null}
            {!isUser && hasContext ? (
              <span className="rounded-full border border-border-strong/60 bg-background-card/70 px-3 py-1 text-text-secondary">
                Контекстов: {contextCount}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.25em] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                isUser
                  ? "border-white/30 bg-white/10 text-white/80 hover:border-white/60 hover:bg-white/20 hover:text-white"
                  : "border-border-strong/80 bg-background-card/80 text-text-secondary hover:border-primary hover:text-primary"
              }`}
              disabled={disableActions}
            >
              {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {isCopied ? "Copied" : "Copy"}
            </button>
            {!isUser ? (
              <>
                <button
                  type="button"
                  onClick={() => onRegenerate?.(message, latestUserMessage)}
                  className="inline-flex items-center gap-2 rounded-full border border-border-strong/70 bg-background-card/80 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.25em] text-text-secondary transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={disableActions || !onRegenerate}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Regenerate
                </button>
                <div className="flex items-center gap-1 rounded-full border border-border-strong/70 bg-background-card/80 px-2 py-1">
                  <button
                    type="button"
                    onClick={() => handleReaction("up")}
                    className={`flex items-center gap-1 rounded-full px-2 py-1 text-[0.7rem] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      reaction === "up" ? "text-primary" : "text-text-secondary hover:text-primary"
                    }`}
                    aria-pressed={reaction === "up"}
                    disabled={disableActions}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                    Up
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReaction("down")}
                    className={`flex items-center gap-1 rounded-full px-2 py-1 text-[0.7rem] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      reaction === "down" ? "text-accent" : "text-text-secondary hover:text-accent"
                    }`}
                    aria-pressed={reaction === "down"}
                    disabled={disableActions}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                    Down
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </footer>
      </div>
      {isUser && avatar}
    </article>
  );
};

export default ChatMessage;
