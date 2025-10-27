import { useEffect, useMemo, useRef, useState } from "react";
import { Paperclip, Send, Sparkles, WifiOff, CornerDownLeft } from "lucide-react";
import { Textarea } from "../ui/Textarea";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { useOfflineQueue } from "../../shared/hooks/useOfflineQueue";

interface ComposerProps {
  draft: string;
  onChange: (next: string) => void;
  onSend: (content: string) => Promise<void> | void;
  disabled?: boolean;
}

const SLASH_COMMANDS = [
  { key: "/summary", label: "Краткое резюме" },
  { key: "/code", label: "Формат кода" },
  { key: "/fix", label: "Исправить ошибки" },
];

export function Composer({ draft, onChange, onSend, disabled }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const { enqueue, flush, isOffline, queued } = useOfflineQueue();

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [draft]);

  useEffect(() => {
    if (!isOffline && queued.length > 0) {
      void flush(async (message) => {
        await onSend(message);
      });
    }
  }, [isOffline, queued, flush, onSend]);

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await submit();
    }
    if (event.key === "/") {
      setCommandPaletteOpen(true);
    }
    if (event.key === "Escape") {
      setCommandPaletteOpen(false);
    }
  };

  const submit = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }
    if (isOffline) {
      enqueue(trimmed);
      onChange("");
      return;
    }
    await onSend(trimmed);
    onChange("");
  };

  const suggestions = useMemo(() => SLASH_COMMANDS.filter((command) => command.key.includes(draft.trim())), [draft]);

  return (
    <div className="relative w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elev-2)] p-4 shadow-[var(--shadow-1)]">
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <Badge tone={isOffline ? "warning" : "accent"}>
            {isOffline ? "Оффлайн" : "Готов"}
          </Badge>
          {isOffline ? (
            <span className="inline-flex items-center gap-1">
              <WifiOff aria-hidden className="h-3.5 w-3.5" />
              <span>
                Сообщения в очереди: {queued.length}
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[var(--muted)]">
              <Sparkles aria-hidden className="h-3.5 w-3.5" />
              <span>Slash-команды ускоряют ответ</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <span>Shift + Enter — новая строка</span>
        </div>
      </div>
      <Textarea
        ref={textareaRef}
        minLength={0}
        rows={1}
        value={draft}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Поле ввода сообщения"
        disabled={disabled}
        className="max-h-60 bg-transparent text-base leading-relaxed"
        aria-live="polite"
      />
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Прикрепить файл" disabled={disabled}>
            <Paperclip aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Готовые шаблоны" disabled={disabled}>
            <Sparkles aria-hidden />
          </Button>
        </div>
        <Button onClick={submit} disabled={disabled}>
          <span className="hidden sm:inline">Отправить</span>
          <CornerDownLeft aria-hidden className="hidden sm:block" />
          <Send aria-hidden className="sm:hidden" />
        </Button>
      </div>
      {isCommandPaletteOpen && suggestions.length > 0 ? (
        <div className="absolute left-4 right-4 top-[-6.5rem] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elev)] p-3 shadow-[var(--shadow-2)]">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Slash-команды</p>
          <ul className="space-y-1">
            {suggestions.map((command) => (
              <li key={command.key}>
                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[rgba(255,255,255,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(6,8,10,0.8)]"
                  onClick={() => {
                    onChange(`${command.key} `);
                    setCommandPaletteOpen(false);
                  }}
                >
                  <span className="font-mono text-[var(--brand)]">{command.key}</span>
                  <span className="ml-2 text-[var(--muted)]">{command.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
