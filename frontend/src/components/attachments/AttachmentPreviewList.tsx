import { AlertCircle, Check, FileText, Loader2, X } from "lucide-react";
import { useMemo } from "react";
import type { AttachmentUploadStatus } from "../../types/attachments";

export interface AttachmentPreviewItem {
  id: string;
  name: string;
  size: number;
  status: AttachmentUploadStatus;
  progress?: number;
  previewUrl?: string;
  error?: string;
}

interface AttachmentPreviewListProps {
  items: AttachmentPreviewItem[];
  onRemove?: (id: string) => void;
  tone?: "surface" | "assistant" | "user";
  readOnly?: boolean;
  compact?: boolean;
}
type AttachmentPreviewTone = NonNullable<AttachmentPreviewListProps["tone"]>;

const toneClasses: Record<AttachmentPreviewTone, {
  container: string;
  secondary: string;
  progress: string;
  badge: string;
  badgeBorder: string;
  remove: string;
}> = {
  surface: {
    container: "border-border/70 bg-surface text-text",
    secondary: "text-text-muted",
    progress: "bg-brand/70",
    badge: "bg-brand/15 text-brand-foreground",
    badgeBorder: "border-brand/40",
    remove: "border-border/60 hover:border-border/40",
  },
  assistant: {
    container: "border-border-strong bg-background-card/80 text-text-secondary",
    secondary: "text-text-secondary/80",
    progress: "bg-primary/50",
    badge: "bg-primary/10 text-primary",
    badgeBorder: "border-primary/40",
    remove: "border-border-strong/70 hover:border-primary/50",
  },
  user: {
    container: "border-white/25 bg-white/10 text-white/90",
    secondary: "text-white/70",
    progress: "bg-white/60",
    badge: "bg-white/20 text-white",
    badgeBorder: "border-white/40",
    remove: "border-white/40 hover:border-white/20",
  },
};

const formatFileSize = (bytes: number): string => {
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

const clampProgress = (value: number | undefined, fallback: number): number => {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(100, Math.max(0, numeric));
};

const AttachmentPreviewList = ({
  items,
  onRemove,
  tone = "surface",
  readOnly = false,
  compact = false,
}: AttachmentPreviewListProps) => {
  const palette = toneClasses[tone];

  const enhanced = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        progress: clampProgress(
          item.progress,
          item.status === "success" || item.status === "fail" ? 100 : 0,
        ),
      })),
    [items],
  );

  if (!enhanced.length) {
    return null;
  }

  return (
    <ul className={`space-y-2 ${compact ? "text-xs" : "text-sm"}`}>
      {enhanced.map((item) => {
        const statusLabel =
          item.status === "loading"
            ? "Загрузка"
            : item.status === "success"
            ? "Готово"
            : "Ошибка";
        const statusIcon =
          item.status === "loading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : item.status === "success" ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5" />
          );

        const showPreview = Boolean(item.previewUrl);

        return (
          <li
            key={item.id}
            className={`flex items-center gap-3 rounded-2xl border px-3 py-2 transition-colors ${palette.container}`}
          >
            <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-border/40 bg-background/50">
              {showPreview ? (
                <img
                  src={item.previewUrl}
                  alt="Предпросмотр вложения"
                  className="h-full w-full object-cover"
                />
              ) : (
                <FileText className="h-5 w-5" />
              )}
              {item.status === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-semibold">{item.name}</p>
                <span className={`shrink-0 text-xs ${palette.secondary}`}>
                  {formatFileSize(item.size)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.25em]">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${palette.badgeBorder} ${palette.badge}`}>
                  {statusIcon}
                  {statusLabel}
                </span>
              </div>
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-background/40">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${palette.progress}`}
                  style={{ width: `${item.progress}%` }}
                />
              </div>
              {item.status === "fail" && item.error ? (
                <p className="flex items-center gap-1 text-[0.7rem] text-accent">
                  <AlertCircle className="h-3.5 w-3.5" /> {item.error}
                </p>
              ) : null}
            </div>

            {onRemove && !readOnly ? (
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className={`ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${palette.remove}`}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Удалить вложение</span>
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
};

export default AttachmentPreviewList;
