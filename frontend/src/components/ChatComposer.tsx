import {
  Keyboard,
  Paperclip,
  Plus,
  RefreshCw,
  SendHorizontal,
  SlidersHorizontal,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef } from "react";
import { MODE_OPTIONS, findModeLabel } from "../core/modes";
import type { PendingAttachment } from "../types/attachments";

interface ChatComposerProps {
  value: string;
  mode: string;
  isBusy: boolean;
  isStreaming: boolean;
  attachments: PendingAttachment[];
  onChange: (value: string) => void;
  onModeChange: (mode: string) => void;
  onSubmit: () => void | Promise<void>;
  onReset: () => void | Promise<void>;
  onAttach: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  onClearAttachments: () => void;
  onOpenControls?: () => void;
  onStop?: () => void;
  onRegenerate?: () => void;
}

const MAX_LENGTH = 4000;

const MODE_HINTS: Record<string, string> = {
  neutral: "Сбалансированный",
  journal: "Подробный отчёт",
  emoji: "Неформально",
  analytics: "Факты и выводы",
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} Б`;
  }
  const units = ["КБ", "МБ", "ГБ", "ТБ"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const precision = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex] ?? "КБ"}`;
};

const ChatComposer = ({
  value,
  mode,
  isBusy,
  isStreaming,
  attachments,
  onChange,
  onModeChange,
  onSubmit,
  onReset,
  onAttach,
  onRemoveAttachment,
  onClearAttachments,
  onOpenControls,
  onStop,
  onRegenerate,
}: ChatComposerProps) => {
  const textAreaId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const trimmedLength = useMemo(() => value.trim().length, [value]);
  const remaining = Math.max(0, MAX_LENGTH - value.length);

  useEffect(() => {
    if (attachments.length === 0 && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [attachments]);

  useEffect(() => {
    const textArea = textAreaRef.current;
    if (!textArea) {
      return;
    }
    textArea.style.height = "auto";
    const nextHeight = Math.min(textArea.scrollHeight, 320);
    textArea.style.height = `${nextHeight}px`;
  }, [value]);

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (files.length) {
      onAttach(files);
    }
    event.target.value = "";
  };

  const handleAttachClick = () => {
    if (isBusy) {
      return;
    }
    fileInputRef.current?.click();
  };

  const handleClearDraft = () => {
    onChange("");
    onClearAttachments();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!isBusy && !isStreaming && (value.trim() || attachments.length)) {
        void onSubmit();
      }
    }
  };

  const handleSubmitClick = () => {
    if (isStreaming) {
      onStop?.();
      return;
    }
    if (isBusy || (!value.trim() && attachments.length === 0)) {
      return;
    }
    void onSubmit();
  };

  const canRegenerate = Boolean(onRegenerate) && !isBusy && !isStreaming && trimmedLength === 0 && attachments.length === 0;

  return (
    <div className="rounded-2xl border border-border/70 bg-surface shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 text-xs text-text-muted md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor={textAreaId} className="text-[0.65rem] uppercase tracking-[0.3em]">
            Режим ядра
          </label>
          <select
            id={textAreaId}
            className="rounded-lg border border-border/70 bg-surface-muted px-3 py-2 text-xs font-semibold text-text focus:border-brand focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            value={mode}
            onChange={(event) => onModeChange(event.target.value)}
            disabled={isBusy || isStreaming}
          >
            {MODE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <span className="rounded-full border border-border/70 bg-surface px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.25em]">
            {findModeLabel(mode)}
          </span>
          {onOpenControls ? (
            <button
              type="button"
              onClick={onOpenControls}
              className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 text-xs font-semibold text-text-muted transition-colors hover:text-text"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Настроить
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span>
            Символов: {trimmedLength} / {MAX_LENGTH}
          </span>
          <button
            type="button"
            onClick={() => {
              if (!isBusy && !isStreaming) {
                void onReset();
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 text-xs font-semibold text-text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isBusy || isStreaming}
          >
            <Plus className="h-4 w-4" />
            Новый диалог
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-4 px-4 py-4">
        <div className="rounded-2xl border border-border/60 bg-surface px-4 py-3">
          <div className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-text-muted">
            <Sparkles className="h-4 w-4 text-primary" />
            Подсказки моделей
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {MODE_OPTIONS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => onModeChange(item.value)}
                className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  item.value === mode
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/70 bg-surface-muted text-text-muted hover:text-text"
                }`}
                disabled={isBusy || isStreaming}
              >
                <span className="block text-sm font-semibold text-text">{item.label}</span>
                <span className="mt-1 block text-[0.6rem] uppercase tracking-[0.25em] text-text-muted">
                  {MODE_HINTS[item.value] ?? "Режим"}
                </span>
              </button>
            ))}
          </div>
        </div>
        <textarea
          ref={textAreaRef}
          id={`${textAreaId}-textarea`}
          value={value}
          onChange={(event) => {
            if (event.target.value.length <= MAX_LENGTH) {
              onChange(event.target.value);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="Сообщение для Kolibri"
          className="max-h-[320px] w-full resize-none rounded-xl border border-border/60 bg-surface-muted px-4 py-3 text-sm text-text placeholder:text-text-muted focus:border-brand focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy && !isStreaming}
        />
        {attachments.length > 0 ? (
          <div className="space-y-3 rounded-xl border border-dashed border-border/70 bg-surface px-4 py-3 text-sm text-text-muted">
            <p className="font-semibold text-text">Прикреплённые файлы</p>
            <ul className="soft-scroll max-h-52 space-y-3 overflow-y-auto pr-1">
              {attachments.map((attachment) => (
                <li key={attachment.id} className="flex items-center justify-between gap-3">
                  <div className="truncate">
                    <p className="truncate text-text">{attachment.file.name}</p>
                    <p className="text-xs">{formatFileSize(attachment.file.size)}</p>
                  </div>
                  {onRemoveAttachment ? (
                    <button
                      type="button"
                      onClick={() => onRemoveAttachment(attachment.id)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isBusy || isStreaming}
                    >
                      <X className="h-4 w-4" />
                      <span className="sr-only">Удалить вложение</span>
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="text-[0.7rem] text-text-muted">
          Быстрые команды: <code className="font-mono text-xs text-text">/help</code>,
          <code className="font-mono text-xs text-text">/learn on|off</code>,
          <code className="font-mono text-xs text-text">/profile next</code>, <code className="font-mono text-xs text-text">/status</code>.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-muted">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={handleFileInputChange}
              tabIndex={-1}
            />
            <button
              type="button"
              onClick={handleAttachClick}
              className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isBusy || isStreaming}
            >
              <Paperclip className="h-4 w-4" />
              Вложить
            </button>
            <button
              type="button"
              onClick={handleClearDraft}
              className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isBusy || isStreaming}
            >
              <RefreshCw className="h-4 w-4" />
              Сбросить
            </button>
            <span className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 text-[0.7rem] uppercase tracking-[0.25em]">
              <Keyboard className="h-4 w-4" />
              Enter — отправить, Shift + Enter — перенос строки
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border/70 bg-surface px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.25em]">
              Осталось: {remaining}
            </span>
            {canRegenerate ? (
              <button
                type="button"
                onClick={() => onRegenerate?.()}
                className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 text-sm font-semibold text-text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className="h-4 w-4" />
                Regenerate
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleSubmitClick}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-60 ${
                isStreaming
                  ? "bg-accent text-white hover:opacity-90"
                  : "bg-brand text-brand-foreground hover:opacity-90"
              }`}
              disabled={(isBusy && !isStreaming) || (!value.trim() && attachments.length === 0 && !isStreaming)}
            >
              {isStreaming ? <Square className="h-4 w-4" /> : <SendHorizontal className="h-4 w-4" />}
              {isStreaming ? "Stop" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatComposer;
