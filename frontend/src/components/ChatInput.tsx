import { Paperclip, Plus, RefreshCw, SendHorizontal, X } from "lucide-react";
import { ChangeEvent, useCallback, useId, useRef } from "react";
import type { ChatAttachment } from "../types/chat";
import { formatFileSize } from "../utils/files";

interface ChatInputProps {
  value: string;
  mode: string;
  isBusy: boolean;
  isUploading: boolean;
  attachments: ChatAttachment[];
  onChange: (value: string) => void;
  onModeChange: (mode: string) => void;
  onAttachmentsAdd: (files: FileList | File[]) => void;
  onAttachmentRemove: (id: string) => void;
  onSubmit: () => void;
  onReset: () => void;
}

const modes = ["Быстрый ответ", "Исследование", "Творческий"];

const ACCEPTED_TYPES = [
  ".txt",
  ".md",
  ".markdown",
  ".json",
  "application/json",
  "application/pdf",
];

const ChatInput = ({
  value,
  mode,
  isBusy,
  isUploading,
  attachments,
  onChange,
  onModeChange,
  onAttachmentsAdd,
  onAttachmentRemove,
  onSubmit,
  onReset,
}: ChatInputProps) => {
  const textAreaId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files || event.target.files.length === 0) {
        return;
      }

      onAttachmentsAdd(event.target.files);
      event.target.value = "";
    },
    [onAttachmentsAdd]
  );

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
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-2xl bg-background-light/60 p-3 text-xs text-text-dark">
          {attachments.map((attachment) => (
            <span
              key={attachment.id}
              className="inline-flex items-center gap-2 rounded-xl bg-white/70 px-3 py-1 shadow-sm"
            >
              <span className="font-medium">{attachment.name}</span>
              <span className="text-[10px] text-text-light">{formatFileSize(attachment.size)}</span>
              <button
                type="button"
                onClick={() => onAttachmentRemove(attachment.id)}
                className="text-text-light transition-colors hover:text-text-dark"
                aria-label={`Удалить вложение ${attachment.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {isUploading && (
        <p className="text-xs text-primary" role="status">
          Обрабатываем вложения…
        </p>
      )}
      <textarea
        id={`${textAreaId}-textarea`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Сообщение для Колибри"
        className="min-h-[120px] w-full resize-none rounded-2xl border border-transparent bg-background-light/60 px-4 py-3 text-sm text-text-dark placeholder:text-text-light focus:border-primary focus:outline-none"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 text-text-light">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            accept={ACCEPTED_TYPES.join(",")}
            onChange={handleFileChange}
            data-testid="chat-attachment-input"
          />
          <button
            type="button"
            onClick={handleFileButtonClick}
            className="flex items-center gap-2 rounded-xl bg-background-light/60 px-3 py-2 text-xs font-semibold text-text-light transition-colors hover:text-text-dark"
            disabled={isBusy}
          >
            <Paperclip className="h-4 w-4" />
            Вложить
          </button>
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
            disabled={
              isBusy || (value.trim().length === 0 && attachments.length === 0)
            }
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
