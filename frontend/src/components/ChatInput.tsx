import { Keyboard, Paperclip, Plus, RefreshCw, SendHorizontal, X } from "lucide-react";
import { useId, useMemo, useRef } from "react";
import type { ChatAttachment } from "../types/chat";
import { MODE_OPTIONS, findModeLabel } from "../core/modes";

interface ChatInputProps {
  value: string;
  mode: string;
  isBusy: boolean;
  onChange: (value: string) => void;
  onModeChange: (mode: string) => void;
  onSubmit: () => void;
  onReset: () => void;
  onAttach: (files: FileList | File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onClear: () => void;
  attachments: ChatAttachment[];
}

const MAX_LENGTH = 4000;

const ChatInput = ({
  value,
  mode,
  isBusy,
  onChange,
  onModeChange,
  onSubmit,
  onReset,
  onAttach,
  onRemoveAttachment,
  onClear,
  attachments,
}: ChatInputProps) => {
  const textAreaId = useId();
  const trimmedLength = useMemo(() => value.trim().length, [value]);
  const remaining = Math.max(0, MAX_LENGTH - value.length);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!isBusy && (value.trim() || attachments.length)) {
        onSubmit();
      }
    }
  };

  const handleAttachmentClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files?.length) {
      onAttach(files);
      event.target.value = "";
    }
  };

  const handleClear = () => {
    onChange("");
    onClear();
  };

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-border-strong bg-background-input/95 p-6 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-text-secondary">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">К</div>
          <label htmlFor={textAreaId} className="text-xs uppercase tracking-[0.3em]">
            Режим ядра
          </label>
          <select
            id={textAreaId}
            className="rounded-xl border border-border-strong bg-background-card/80 px-3 py-2 text-xs font-semibold text-text-primary focus:border-primary focus:outline-none"
            value={mode}
            onChange={(event) => onModeChange(event.target.value)}
            disabled={isBusy}
          >
            {MODE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <span className="rounded-lg border border-border-strong bg-background-card/70 px-2 py-1 text-[0.7rem] uppercase tracking-wide text-text-secondary">
            {findModeLabel(mode)}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-text-secondary">
          <span>
            Символов: {trimmedLength} / {MAX_LENGTH}
          </span>
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-2 rounded-xl border border-border-strong bg-background-card/80 px-3 py-2 text-xs font-semibold transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isBusy}
          >
            <Plus className="h-4 w-4" />
            Новый диалог
          </button>
        </div>
      </div>
      <textarea
        id={`${textAreaId}-textarea`}
        value={value}
        onChange={(event) => {
          if (event.target.value.length <= MAX_LENGTH) {
            onChange(event.target.value);
          }
        }}
        onKeyDown={handleKeyDown}
        placeholder="Сообщение для Колибри"
        className="min-h-[160px] w-full resize-none rounded-2xl border border-border-strong bg-background-card/85 px-4 py-3 text-sm text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none"
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      {attachments.length > 0 && (
        <ul className="space-y-2 rounded-2xl border border-dashed border-border-strong bg-background-card/60 p-3 text-xs text-text-secondary">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex items-center gap-3">
              <Paperclip className="h-3.5 w-3.5 text-primary" />
              <span className="flex-1 truncate text-text-primary" title={attachment.name}>
                {attachment.name}
              </span>
              <span className="whitespace-nowrap">{formatAttachmentSize(attachment.size)}</span>
              <button
                type="button"
                onClick={() => onRemoveAttachment(attachment.id)}
                className="rounded-lg border border-border-strong bg-background-card/80 p-1 text-text-secondary transition-colors hover:text-text-primary"
                aria-label={`Удалить вложение ${attachment.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-secondary">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-border-strong bg-background-card/80 px-3 py-2 transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isBusy}
            onClick={handleAttachmentClick}
          >
            <Paperclip className="h-4 w-4" />
            Вложить
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-2 rounded-xl border border-border-strong bg-background-card/80 px-3 py-2 transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isBusy}
          >
            <RefreshCw className="h-4 w-4" />
            Сбросить
          </button>
          <div className="flex items-center gap-2 rounded-xl border border-border-strong bg-background-card/80 px-3 py-2">
            <Keyboard className="h-4 w-4" />
            <span>Enter — отправить, Shift + Enter — перенос строки</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-lg border border-border-strong bg-background-card/70 px-3 py-1 text-[0.7rem] uppercase tracking-wide text-text-secondary">
            Осталось: {remaining}
          </span>
          <button
            type="button"
            onClick={onSubmit}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isBusy || (!value.trim() && attachments.length === 0)}
          >
            <SendHorizontal className="h-4 w-4" />
            Отправить
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
