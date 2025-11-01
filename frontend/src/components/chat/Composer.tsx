import { useEffect, useMemo, useRef, useState } from "react";
import { Paperclip, Send, Sparkles, WifiOff, CornerDownLeft } from "lucide-react";
import { Textarea } from "../ui/Textarea";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { useOfflineQueue } from "../../shared/hooks/useOfflineQueue";
import { useI18n } from "../../app/i18n";
import { useToast } from "../feedback/Toast";

interface ComposerProps {
  draft: string;
  onChange: (next: string) => void;
  onSend: (content: string) => Promise<void> | void;
  disabled?: boolean;
}

const MAX_LENGTH = 4000;
const TOKENS_PER_CHARACTER = 0.25;
const ENERGY_PER_TOKEN_WH = 0.00045;
const CARBON_GRAMS_PER_WH = 0.4;

export function Composer({ draft, onChange, onSend, disabled }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [isDragging, setDragging] = useState(false);
  const { enqueue, flush, isOffline, queued } = useOfflineQueue();
  const { t } = useI18n();
  const { publish } = useToast();

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
      publish({ title: t("toast.sent.offline"), tone: "success" });
      return;
    }
    await onSend(trimmed);
    onChange("");
    publish({ title: t("toast.sent"), tone: "success" });
  };

  const slashCommands = useMemo(
    () => [
      { key: "/summary", label: t("composer.slash.summary") },
      { key: "/code", label: t("composer.slash.code") },
      { key: "/fix", label: t("composer.slash.fix") },
      { key: "/context", label: t("composer.slash.context") },
    ],
    [t],
  );

  const suggestions = useMemo(
    () => slashCommands.filter((command) => command.key.includes(draft.trim())),
    [slashCommands, draft],
  );

  const characterCount = draft.length;
  const tokenEstimate = Math.max(0, Math.ceil(characterCount * TOKENS_PER_CHARACTER));
  const estimatedEnergyWh = tokenEstimate * ENERGY_PER_TOKEN_WH;
  const estimatedCarbonGrams = estimatedEnergyWh * CARBON_GRAMS_PER_WH;

  const formattedEnergy = estimatedEnergyWh === 0
    ? "0 Wh"
    : estimatedEnergyWh < 0.1
      ? `${(estimatedEnergyWh * 1000).toFixed(1)} mWh`
      : `${estimatedEnergyWh.toFixed(2)} Wh`;
  const formattedCarbon = estimatedCarbonGrams === 0
    ? "0 g"
    : estimatedCarbonGrams < 1
      ? `${estimatedCarbonGrams.toFixed(2)} g`
      : `${(estimatedCarbonGrams / 1000).toFixed(2)} kg`;
  const containerClasses = `relative w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elev-2)] p-4 shadow-[var(--shadow-1)] transition ${
    isDragging ? "border-[var(--brand)] bg-[rgba(74,222,128,0.08)]" : ""
  }`;

  return (
    <div
      className={containerClasses}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDragEnd={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        publish({ title: t("composer.attach.unsupported"), tone: "error" });
      }}
    >
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <Badge tone={isOffline ? "warning" : "accent"}>
            {isOffline ? t("composer.status.offline") : t("composer.status.ready")}
          </Badge>
          {isOffline ? (
            <span className="inline-flex items-center gap-1">
              <WifiOff aria-hidden className="h-3.5 w-3.5" />
              <span>
                {t("composer.offline.queue")}: {queued.length}
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[var(--muted)]">
              <Sparkles aria-hidden className="h-3.5 w-3.5" />
              <span>{t("composer.hint.slash")}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <span>{t("composer.hint.shortcut")}</span>
          {queued.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={isOffline || disabled}
              onClick={async () => {
                if (isOffline || disabled) {
                  return;
                }
                await flush(async (message) => {
                  await onSend(message);
                });
                publish({ title: t("composer.retry"), tone: "success" });
              }}
            >
              {t("composer.retry")}
            </Button>
          ) : null}
        </div>
      </div>
      <Textarea
        ref={textareaRef}
        minLength={0}
        rows={1}
        value={draft}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        aria-label={t("composer.input.label")}
        disabled={disabled}
        className="max-h-60 bg-transparent text-base leading-relaxed"
        aria-live="polite"
        maxLength={MAX_LENGTH}
      />
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label={t("composer.buttons.attach")}
            disabled={disabled}
          >
            <Paperclip aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("composer.buttons.templates")}
            disabled={disabled}
            data-open-command-palette="true"
            onClick={() => setCommandPaletteOpen((value) => !value)}
          >
            <Sparkles aria-hidden />
          </Button>
        </div>
        <Button onClick={submit} disabled={disabled || characterCount === 0}>
          <span className="hidden sm:inline">{t("composer.buttons.send")}</span>
          <CornerDownLeft aria-hidden className="hidden sm:block" />
          <Send aria-hidden className="sm:hidden" />
        </Button>
      </div>
      <div className="mt-3 space-y-1 text-xs text-[var(--muted)]">
        <div>
          {t("composer.counter")}: {characterCount}/{MAX_LENGTH}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            {t("composer.estimate.tokens")} {tokenEstimate}
          </span>
          <span>• {t("composer.estimate.energy")} {formattedEnergy}</span>
          <span>• {t("composer.estimate.co2")} {formattedCarbon}</span>
        </div>
      </div>
      {isCommandPaletteOpen && suggestions.length > 0 ? (
        <div className="absolute left-4 right-4 top-[-6.5rem] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elev)] p-3 shadow-[var(--shadow-2)]">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{t("composer.slash.title")}</p>
          <ul className="space-y-1" role="listbox">
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
