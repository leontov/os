import { Keyboard, Paperclip, Plus, RefreshCw, SendHorizontal, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef } from "react";
import { MODE_OPTIONS, findModeLabel } from "../core/modes";
import type { PendingAttachment } from "../types/attachments";

interface ChatInputProps {
  value: string;
  mode: string;
  isBusy: boolean;
  attachments: PendingAttachment[];
  onChange: (value: string) => void;
  onModeChange: (mode: string) => void;
  onSubmit: () => void;
  onReset: () => void;
  onAttach: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  onClearAttachments: () => void;
}

const MAX_LENGTH = 4000;

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} Б`;
  }
  const units = ["КБ", "МБ", "ГБ", "ТБ"];
  let size = bytes;
  let unitIndex = -1;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const unit = units[unitIndex] ?? "КБ";
  const precision = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${unit}`;
};

const ChatInput = ({
  value,
  mode,
  isBusy,
  attachments,
  onChange,
  onModeChange,
  onSubmit,
  onReset,
  onAttach,
  onRemoveAttachment,
  onClearAttachments,
}: ChatInputProps) => {
  const textAreaId = useId();
  const trimmedLength = useMemo(() => value.trim().length, [value]);
  const remaining = Math.max(0, MAX_LENGTH - value.length);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (attachments.length === 0 && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [attachments]);

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
      if (!isBusy && value.trim()) {
        onSubmit();
      }
    }
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
      {attachments.length > 0 && (
        <div className="rounded-2xl border border-dashed border-border-strong bg-background-card/70 p-4 text-sm text-text-secondary">
          <p className="mb-2 font-semibold text-text-primary">Прикреплённые файлы</p>
          <ul className="flex flex-col gap-3">
            {attachments.map((attachment) => (
              <li key={attachment.id} className="flex items-center justify-between gap-3">
                <div className="truncate">
                  <p className="truncate text-text-primary">{attachment.file.name}</p>
                  <p className="text-xs">{formatFileSize(attachment.file.size)}</p>
                </div>
                {onRemoveAttachment && (
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(attachment.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-border-strong text-text-secondary transition-colors hover:text-text-primary"
                    disabled={isBusy}
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Удалить вложение</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-secondary">
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
            className="flex items-center gap-2 rounded-xl border border-border-strong bg-background-card/80 px-3 py-2 transition-colors hover:text-text-primary"
            disabled={isBusy}
          >
            <Paperclip className="h-4 w-4" />
            Вложить
          </button>
          <button
            type="button"
            onClick={handleClearDraft}
            className="flex items-center gap-2 rounded-xl border border-border-strong bg-background-card/80 px-3 py-2 transition-colors hover:text-text-primary"
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
            disabled={isBusy || !value.trim()}
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
