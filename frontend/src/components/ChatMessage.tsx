import {
  BookmarkCheck,
  BookmarkPlus,
  Check,
  Copy,
  Link2,
  Paperclip,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import AudioVisualizer from "./AudioVisualizer";
import MessageBubble from "./MessageBubble";
import type { ChatMessage as ChatMessageModel } from "../types/chat";

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

const renderHighlightedText = (text: string, highlights: string[] | undefined, isUser: boolean) => {
  if (!text) {
    return null;
  }
  const unique = Array.from(new Set((highlights ?? []).filter((item) => Boolean(item?.trim()))));
  let segments: ReactNode[] = [text];

  unique.forEach((highlight, highlightIndex) => {
    const lowerHighlight = highlight.toLowerCase();
    if (!lowerHighlight) {
      return;
    }
    segments = segments.flatMap((segment) => {
      if (typeof segment !== "string") {
        return [segment];
      }
      const lowerSegment = segment.toLowerCase();
      const parts: ReactNode[] = [];
      let cursor = 0;
      let localIndex = 0;
      let matchIndex = lowerSegment.indexOf(lowerHighlight);
      while (matchIndex !== -1) {
        if (matchIndex > cursor) {
          parts.push(segment.slice(cursor, matchIndex));
        }
        const matched = segment.slice(matchIndex, matchIndex + highlight.length);
        parts.push(
          <mark
            key={`highlight-${highlightIndex}-${localIndex}`}
            className={`rounded px-1 py-0.5 ${isUser ? "bg-white/30 text-white" : "bg-brand/15 text-brand"}`}
          >
            {matched}
          </mark>,
        );
        cursor = matchIndex + highlight.length;
        localIndex += 1;
        matchIndex = lowerSegment.indexOf(lowerHighlight, cursor);
      }
      if (cursor < segment.length) {
        parts.push(segment.slice(cursor));
      }
      return parts;
    });
  });

  const withBreaks: ReactNode[] = [];
  segments.forEach((segment, index) => {
    if (typeof segment !== "string") {
      withBreaks.push(segment);
      return;
    }
    const lines = segment.split("\n");
    lines.forEach((line, lineIndex) => {
      if (line) {
        withBreaks.push(
          <span key={`line-${index}-${lineIndex}`} className={isUser ? "text-white/95" : "text-text-primary"}>
            {line}
          </span>,
        );
      }
      if (lineIndex < lines.length - 1) {
        withBreaks.push(<br key={`br-${index}-${lineIndex}`} />);
      }
    });
  });

  if (withBreaks.length === 0) {
    return (
      <span className={isUser ? "text-white/95" : "text-text-primary"}>
        {text}
      </span>
    );
  }

  return withBreaks;
};

interface ChatMessageProps {
  message: ChatMessageModel;
  latestUserMessage?: ChatMessageModel;
  onReplayAudio?: (messageId: string) => void;
  onTranscribeAudio?: (messageId: string) => void;
}

const ChatMessage = ({ message, latestUserMessage, onReplayAudio, onTranscribeAudio }: ChatMessageProps) => {
  const isUser = message.role === "user";
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [reaction, setReaction] = useState<"up" | "down" | null>(null);
  const [isPinned, setIsPinned] = useState(false);
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

  const togglePinned = useCallback(() => {
    setIsPinned((previous) => !previous);
  }, []);

  const header = (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <span className={isUser ? "text-white/80" : "text-text-secondary/80"}>{actorLabel}</span>
      <div className="flex items-center gap-2 text-[0.7rem] text-text-secondary/80">
        <span>{isoDate ?? message.timestamp}</span>
        <button
          type="button"
          onClick={handleCopy}
          className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[0.65rem] font-semibold transition-colors ${
            isUser
              ? "border-white/30 bg-white/10 text-white/80 hover:border-white/60 hover:bg-white/20 hover:text-white"
              : "border-border-strong/80 bg-background-card/80 text-text-secondary hover:border-primary hover:text-primary"
          }`}
        >
          {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {isCopied ? "Скопировано" : "Копировать"}
        </button>
      </div>
    </div>
  );

  const body = (
    <>
      {message.content ? (
        <p className="whitespace-pre-line text-[0.95rem] leading-relaxed">
          {renderHighlightedText(message.content, message.highlights, isUser)}
        </p>
      ) : null}
      {message.attachments?.length ? (
        <div className="space-y-2">
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
      {!isUser && (hasContext || message.contextError) ? (
        <div className="space-y-3 rounded-2xl border border-dashed border-border-strong/70 bg-background-card/80 p-4 text-xs text-text-secondary">
          {hasContext ? (
            <div>
              <button
                type="button"
                onClick={() => setIsContextExpanded((previous) => !previous)}
                className="rounded-full border border-primary/40 bg-primary/10 px-4 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-primary transition-colors hover:border-primary"
              >
                {isContextExpanded ? "Скрыть контекст" : "Показать контекст"} ({contextCount})
              </button>
              {isContextExpanded ? (
                <div className="mt-3 space-y-3">
                  {message.context?.map((snippet, index) => (
                    <article key={snippet.id} className="glass-panel p-3" aria-label={`Источник ${index + 1}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[0.7rem] font-semibold text-text-secondary">
                        <span className="uppercase tracking-[0.3em] text-text-primary">Источник {index + 1}</span>
                        <span className="text-text-secondary">Релевантность: {formatScore(snippet.score)}</span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-text-primary">{snippet.title}</p>
                      <p className="mt-2 whitespace-pre-line text-[0.85rem] leading-relaxed text-text-secondary">
                        {snippet.content}
                      </p>
                      {snippet.source ? (
                        <p className="mt-2 flex items-center gap-1 text-[0.7rem] uppercase tracking-[0.3em] text-primary/80">
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
    </>
  );

  const footer = (
    <div
      className={`flex w-full flex-wrap items-center gap-3 text-[0.7rem] ${
        isUser ? "justify-end text-text-secondary/70" : "text-text-secondary"
      }`}
    >
      {!isUser && message.modeLabel ? (
        <span className="pill-badge border-primary/40 bg-primary/10 text-primary">{message.modeLabel}</span>
      ) : null}
      {latestUserMessage && !isUser ? (
        <span className="truncate rounded-full border border-border-strong/60 bg-background-card/70 px-3 py-1 text-text-secondary">
          ↪ {latestUserMessage.content.slice(0, 80)}
          {latestUserMessage.content.length > 80 ? "…" : ""}
        </span>
      ) : null}
      {hasContext && !isUser ? (
        <span className="rounded-full border border-border-strong/60 bg-background-card/70 px-3 py-1 text-text-secondary">
          Контекстов: {contextCount}
        </span>
      ) : null}
      {isPinned ? (
        <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-accent">Закреплено</span>
      ) : null}
    </div>
  );

  const actions = !isUser ? (
    <div className="ml-auto flex items-center gap-1 rounded-full border border-border-strong/70 bg-background-card/80 px-2 py-1 text-text-secondary">
      <button
        type="button"
        onClick={() => handleReaction("up")}
        className={`flex items-center gap-1 rounded-full px-2 py-1 text-[0.7rem] transition-colors ${
          reaction === "up" ? "text-primary" : "hover:text-primary"
        }`}
        aria-pressed={reaction === "up"}
      >
        <ThumbsUp className="h-3.5 w-3.5" /> Полезно
      </button>
      <button
        type="button"
        onClick={() => handleReaction("down")}
        className={`flex items-center gap-1 rounded-full px-2 py-1 text-[0.7rem] transition-colors ${
          reaction === "down" ? "text-accent" : "hover:text-accent"
        }`}
        aria-pressed={reaction === "down"}
      >
        <ThumbsDown className="h-3.5 w-3.5" /> Улучшить
      </button>
      <button
        type="button"
        onClick={togglePinned}
        className={`flex items-center gap-1 rounded-full px-2 py-1 text-[0.7rem] transition-colors ${
          isPinned ? "text-primary" : "hover:text-primary"
        }`}
        aria-pressed={isPinned}
      >
        {isPinned ? <BookmarkCheck className="h-3.5 w-3.5" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
        {isPinned ? "Сохранено" : "Сохранить"}
      </button>
    </div>
  ) : null;

  const avatar = (
    <span
      className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold shadow-[0_18px_35px_-22px_rgba(79,70,229,0.9)] ${
        isUser
          ? "bg-gradient-to-br from-primary/90 via-primary/75 to-primary/60 text-white"
          : "bg-background-card/80 text-primary"
      }`}
      aria-hidden="true"
    >
      {avatarLabel}
    </span>
  );

  const showAudioControls = !isUser &&
    (Boolean(message.audioSpectrum?.length) ||
      Boolean(message.audioWaveform?.length) ||
      Boolean(message.audioStreamId));

  return (
    <article className={`flex w-full gap-4 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && avatar}
      <div className={`flex max-w-3xl flex-col gap-3 ${isUser ? "items-end text-right" : "items-start"}`}>
        <MessageBubble
          role={message.role}
          header={header}
          body={body}
          footer={footer}
          actions={actions}
          subtitles={message.subtitles}
          emojiTimeline={message.emojiTimeline}
          avatar={message.avatar}
          isStreaming={message.isStreaming}
        />
        {showAudioControls ? (
          <AudioVisualizer
            spectrum={message.audioSpectrum}
            waveform={message.audioWaveform}
            isActive={message.isStreaming}
            onReplay={onReplayAudio ? () => onReplayAudio(message.id) : undefined}
            onTranscribe={onTranscribeAudio ? () => onTranscribeAudio(message.id) : undefined}
          />
        ) : null}
      </div>
      {isUser && avatar}
    </article>
  );
};

export default ChatMessage;
