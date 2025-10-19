import { Keyboard, Paperclip, Plus, RefreshCw, SendHorizontal, SlidersHorizontal, X } from "lucide-react";
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
  onSubmit: () => void | Promise<void>;
  onReset: () => void | Promise<void>;
  onAttach: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  onClearAttachments: () => void;
  onOpenControls?: () => void;
}

const MAX_LENGTH = 4000;

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
  onOpenControls,
}: ChatInputProps) => {
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
    const next = Math.min(textArea.scrollHeight, 320);
    textArea.style.height = `${next}px`;
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
      if (!isBusy && (value.trim() || attachments.length)) {
        void onSubmit();
      }
    }
  };

  const handleSubmitClick = () => {
    if (isBusy || (!value.trim() && attachments.length === 0)) {
      return;
    }
    void onSubmit();
  };

  return (
    <div className="glass-panel flex flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 text-sm text-text-secondary md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/80 to-primary/60 text-white shadow-md">
            К
          </div>
          <label htmlFor={textAreaId} className="text-xs uppercase tracking-[0.3em]">
            Режим ядра
          </label>
          <select
            id={textAreaId}
            className="rounded-xl border border-border-strong/70 bg-background-card/80 px-3 py-2 text-xs font-semibold text-text-primary focus:border-primary focus:outline-none"
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
          <span className="pill-badge !px-2 !py-1">
            {findModeLabel(mode)}
          </span>
          {onOpenControls ? (
            <button
              type="button"
              onClick={onOpenControls}
              className="ghost-button text-xs"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Настроить ядро
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
          <span>
            Символов: {trimmedLength} / {MAX_LENGTH}
          </span>
          <button
            type="button"
            onClick={() => {
              if (!isBusy) {
                void onReset();
              }
            }}
            className="ghost-button text-xs disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isBusy}
          >
            <Plus className="h-4 w-4" />
            Новый диалог
          </button>
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
        placeholder="Сообщение для Колибри"
        className="max-h-[320px] w-full resize-none rounded-2xl border border-border-strong/70 bg-background-card/85 px-4 py-3 text-[0.95rem] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none"
      />
      {attachments.length > 0 && (
        <div className="glass-panel space-y-3 border-dashed border-border-strong p-4 text-sm text-text-secondary">
          <p className="mb-2 font-semibold text-text-primary">Прикреплённые файлы</p>
          <ul className="soft-scroll max-h-60 space-y-3 overflow-y-auto pr-1">
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
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-border-strong/70 bg-background-card/70 text-text-secondary transition-colors hover:text-text-primary"
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
      <p className="text-[0.7rem] text-text-secondary">
        Быстрые команды: <code className="font-mono text-xs text-text-primary">/help</code>,
        <code className="font-mono text-xs text-text-primary">/learn on|off</code>,
        <code className="font-mono text-xs text-text-primary">/profile next</code>, <code className="font-mono text-xs text-text-primary">/status</code>.
      </p>
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
            className="ghost-button transition-colors hover:text-text-primary"
            disabled={isBusy}
          >
            <Paperclip className="h-4 w-4" />
            Вложить
          </button>
          <button
            type="button"
            onClick={handleClearDraft}
            className="ghost-button transition-colors hover:text-text-primary"
            disabled={isBusy}
          >
            <RefreshCw className="h-4 w-4" />
            Сбросить
          </button>
          <div className="glass-panel flex items-center gap-2 px-3 py-2">
            <Keyboard className="h-4 w-4" />
            <span>Enter — отправить, Shift + Enter — перенос строки</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="pill-badge !px-3 !py-1">
            Осталось: {remaining}
          </span>
          <button
            type="button"
            onClick={handleSubmitClick}
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
