import {
  AlertCircle,
  Keyboard,
  Paperclip,
  Plus,
  RefreshCw,
  SendHorizontal,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef } from "react";
import { KNOWLEDGE_SNIPPET_MIME, type DraggedKnowledgeSnippet } from "../core/drag";
import { MODE_OPTIONS, findModeLabel } from "../core/modes";
import type { PendingAttachment } from "../types/attachments";
import AttachmentPreviewList, {
  type AttachmentPreviewItem,
} from "./attachments/AttachmentPreviewList";

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
  editingMessage?: {
    id: string;
    originalContent: string;
  };
  onCancelEditing?: () => void;
}

const MAX_LENGTH = 4000;

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
  editingMessage,
  onCancelEditing,
}: ChatInputProps) => {
  const textAreaId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const trimmedLength = useMemo(() => value.trim().length, [value]);
  const remaining = Math.max(0, MAX_LENGTH - value.length);

  const attachmentItems = useMemo<AttachmentPreviewItem[]>(
    () =>
      attachments.map((attachment) => ({
        id: attachment.id,
        name: attachment.file.name,
        size: attachment.file.size,
        status: attachment.status,
        progress: attachment.progress,
        previewUrl: attachment.previewUrl,
        error: attachment.error,
      })),
    [attachments],
  );

  const hasReadyAttachments = useMemo(
    () => attachments.some((attachment) => attachment.status === "success"),
    [attachments],
  );
  const hasPendingUploads = useMemo(
    () => attachments.some((attachment) => attachment.status === "loading"),
    [attachments],
  );
  const hasFailedAttachments = useMemo(
    () => attachments.some((attachment) => attachment.status === "fail"),
    [attachments],
  );

  const canSend = value.trim().length > 0 || hasReadyAttachments;
  const sendDisabled = isBusy || hasPendingUploads || !canSend;

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
    if (isBusy || editingMessage) {
      return;
    }
    fileInputRef.current?.click();
  };

  const handleClearDraft = () => {
    if (editingMessage && onCancelEditing) {
      onCancelEditing();
      return;
    }
    onChange("");
    onClearAttachments();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!sendDisabled) {
        void onSubmit();
      }
    }
  };

  const handleSubmitClick = () => {
    if (sendDisabled) {
      return;
    }
    void onSubmit();
  };

  const extractKnowledgeSnippet = (event: React.DragEvent<HTMLElement>) => {
    if (!event.dataTransfer) {
      return null;
    }
    const availableTypes = Array.from(event.dataTransfer.types ?? []);
    if (!availableTypes.includes(KNOWLEDGE_SNIPPET_MIME) && !availableTypes.includes("application/json")) {
      return null;
    }
    const rawPayload = event.dataTransfer.getData(KNOWLEDGE_SNIPPET_MIME) || event.dataTransfer.getData("application/json");
    if (!rawPayload) {
      return null;
    }
    try {
      const payload = JSON.parse(rawPayload) as DraggedKnowledgeSnippet;
      if (payload && payload.type === "knowledge-snippet" && payload.snippet) {
        return payload.snippet;
      }
    } catch {
      return null;
    }
    return null;
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (editingMessage) {
      return;
    }
    const snippet = extractKnowledgeSnippet(event);
    if (!snippet) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (editingMessage) {
      return;
    }
    const snippet = extractKnowledgeSnippet(event);
    if (!snippet) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const parts: string[] = [];
    if (snippet.title) {
      parts.push(`Цитата из «${snippet.title}»`);
    }
    parts.push(snippet.content);
    if (snippet.citation) {
      parts.push(`Цитата: ${snippet.citation}`);
    }
    if (snippet.source) {
      parts.push(`Источник: ${snippet.source}`);
    }
    const block = parts.join("\n").trim();
    const prefix = value.trim().length ? `${value.trimEnd()}\n\n` : "";
    onChange(`${prefix}${block}`);
  };

  return (
    <div
      className="rounded-2xl border border-border/70 bg-surface shadow-sm"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 text-xs text-text-muted md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor={textAreaId} className="text-[0.65rem] uppercase tracking-[0.3em]">
            Режим ядра
          </label>
          <select
            id={textAreaId}
            className="rounded-lg border border-border/70 bg-surface-muted px-3 py-2 text-xs font-semibold text-text focus:border-brand focus:outline-none"
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
              if (!isBusy) {
                void onReset();
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 text-xs font-semibold text-text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isBusy}
          >
            <Plus className="h-4 w-4" />
            Новый диалог
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-4 px-4 py-4">
        {editingMessage ? (
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-primary/50 bg-primary/10 px-4 py-3 text-sm text-primary">
            <div className="max-w-xl space-y-1">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-primary/80">
                Редактирование сообщения
              </p>
              <p className="break-words text-xs text-primary/90">
                {editingMessage.originalContent || "(пустое сообщение)"}
              </p>
            </div>
            {onCancelEditing ? (
              <button
                type="button"
                onClick={onCancelEditing}
                className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-surface px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-primary transition-colors hover:border-primary hover:text-primary/90"
              >
                Отменить
              </button>
            ) : null}
          </div>
        ) : null}
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
          className="max-h-[320px] w-full resize-none rounded-xl border border-border/60 bg-surface-muted px-4 py-3 text-sm text-text placeholder:text-text-muted focus:border-brand focus:outline-none"
        />
        {attachmentItems.length > 0 ? (
          <div className="space-y-3 rounded-xl border border-dashed border-border/70 bg-surface px-4 py-3 text-sm text-text-muted">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-text">Прикреплённые файлы</p>
              {hasPendingUploads ? (
                <span className="text-xs uppercase tracking-[0.3em] text-text-muted">
                  Идёт загрузка…
                </span>
              ) : hasFailedAttachments ? (
                <span className="inline-flex items-center gap-1 text-xs text-accent">
                  <AlertCircle className="h-3.5 w-3.5" /> Есть ошибки загрузки
                </span>
              ) : null}
            </div>
            <AttachmentPreviewList
              items={attachmentItems}
              onRemove={isBusy ? undefined : onRemoveAttachment}
              tone="surface"
              compact
              readOnly={isBusy || !onRemoveAttachment}
            />
            {hasFailedAttachments ? (
              <p className="flex items-center gap-2 text-xs text-accent">
                <AlertCircle className="h-3.5 w-3.5" /> Удалите или снова прикрепите файлы с ошибкой.
              </p>
            ) : null}
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
              disabled={isBusy || Boolean(editingMessage)}
            >
              <Paperclip className="h-4 w-4" />
              Вложить
            </button>
            <button
              type="button"
              onClick={handleClearDraft}
              className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 transition-colors hover:text-text"
              disabled={isBusy}
            >
              <RefreshCw className="h-4 w-4" />
              Сбросить
            </button>
            <span className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2">
              <Keyboard className="h-4 w-4" />
              Enter — отправить, Shift + Enter — перенос строки
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-border/70 bg-surface px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.25em]">
              Осталось: {remaining}
            </span>
            <button
              type="button"
              onClick={handleSubmitClick}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={sendDisabled}
            >
              <SendHorizontal className="h-4 w-4" />
              Отправить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
