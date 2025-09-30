import { Loader2, Paperclip, Plus, RefreshCw, SendHorizontal, X } from "lucide-react";
import { ChangeEvent, useId, useRef } from "react";
import type { AttachmentState } from "../types/attachments";

interface ChatInputProps {
  value: string;
  mode: string;
  isBusy: boolean;
  attachments: AttachmentState[];
  canSubmit: boolean;
  onChange: (value: string) => void;
  onModeChange: (mode: string) => void;
  onSubmit: () => void;
  onReset: () => void;
  onUploadFile: (file: File) => void;
  onRemoveAttachment: (id: string) => void;
}

const modes = ["Быстрый ответ", "Исследование", "Творческий"];

const ChatInput = ({
  value,
  mode,
  isBusy,
  attachments,
  canSubmit,
  onChange,
  onModeChange,
  onSubmit,
  onReset,
  onUploadFile,
  onRemoveAttachment,
}: ChatInputProps) => {
  const textAreaId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) {
      return;
    }
    Array.from(files).forEach((file) => onUploadFile(file));
    event.target.value = "";
  };

  return (
    <div className="mt-6 flex flex-col gap-4 rounded-3xl bg-white/80 p-6 shadow-card">
      <div className="flex items-center gap-3 text-sm text-text-light">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-coral/10 text-accent-coral">
          К
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor={textAreaId} className="text-text-dark">
            Режим
          </label>
          <select
            id={textAreaId}
            className="rounded-xl border border-transparent bg-background-light/60 px-3 py-2 text-sm font-medium text-text-dark focus:border-primary focus:outline-none"
            value={mode}
            onChange={(event) => onModeChange(event.target.value)}
            disabled={isBusy}
          >
            {modes.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>
      <textarea
        id={`${textAreaId}-textarea`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Сообщение для Колибри"
        className="min-h-[120px] w-full resize-none rounded-2xl border border-transparent bg-background-light/60 px-4 py-3 text-sm text-text-dark placeholder:text-text-light focus:border-primary focus:outline-none"
      />
      {attachments.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl bg-background-light/40 p-3">
          {attachments.map((attachment) => {
            let statusLabel: JSX.Element;

            if (attachment.status === "processing") {
              statusLabel = (
                <span className="flex items-center gap-1 text-text-light">
                  <Loader2 className="h-3 w-3 animate-spin" /> Обработка…
                </span>
              );
            } else if (attachment.status === "error") {
              statusLabel = (
                <span className="text-accent-coral">{attachment.error ?? "Не удалось обработать."}</span>
              );
            } else {
              statusLabel = (
                <span className="text-text-light">
                  {attachment.ocrPerformed ? "OCR выполнен" : "Готово"}
                  {attachment.truncated ? " · усечено" : null}
                </span>
              );
            }

            return (
              <div
                key={attachment.id}
                className="flex flex-wrap items-center gap-2 rounded-xl bg-white/40 px-3 py-2 text-xs text-text-dark"
              >
                <span className="font-semibold">{attachment.filename}</span>
                {statusLabel}
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(attachment.id)}
                  className="ml-auto flex items-center gap-1 rounded-lg bg-background-light/60 px-2 py-1 text-[11px] font-medium text-text-light transition-colors hover:text-text-dark"
                >
                  <X className="h-3 w-3" />
                  Удалить
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 text-text-light">
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl bg-background-light/60 px-3 py-2 text-xs font-semibold text-text-light transition-colors hover:text-text-dark disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleFileButtonClick}
            disabled={isBusy}
          >
            <Paperclip className="h-4 w-4" />
            Вложить
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={handleFileChange}
            accept=".txt,.md,.markdown,.csv,.json,.pdf,image/*"
          />
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-2 rounded-xl bg-background-light/60 px-3 py-2 text-xs font-semibold text-text-light transition-colors hover:text-text-dark"
          >
            <Plus className="h-4 w-4" />
            Новый диалог
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-2 rounded-xl bg-background-light/60 px-4 py-2 text-sm font-medium text-text-light transition-colors hover:text-text-dark"
            disabled={isBusy}
          >
            <RefreshCw className="h-4 w-4" />
            Сбросить
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isBusy || !canSubmit}
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
