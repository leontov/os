import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Search, Sparkles, Settings, BookOpen } from "lucide-react";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { useI18n } from "../../app/i18n";

export interface CommandItem {
  id: string;
  label: string;
  description: string;
  icon?: React.ReactNode;
  onSelect: () => void;
}

interface CommandMenuProps {
  open: boolean;
  onClose: () => void;
  items?: ReadonlyArray<CommandItem>;
}

export function CommandMenu({ open, onClose, items }: CommandMenuProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const defaultItems = useMemo<CommandItem[]>(
    () => [
      {
        id: "search",
        label: t("command.search"),
        description: t("command.search.description"),
        icon: <Search aria-hidden className="h-4 w-4" />,
        onSelect: () => {
          const element = document.querySelector<HTMLInputElement>("[data-chat-search='true']");
          element?.focus();
        },
      },
      {
        id: "shortcuts",
        label: t("command.shortcuts"),
        description: t("command.shortcuts.description"),
        icon: <Sparkles aria-hidden className="h-4 w-4" />,
        onSelect: () => {
          const target = document.querySelector("[data-open-command-palette='true']");
          if (target instanceof HTMLButtonElement) {
            target.click();
          }
        },
      },
      {
        id: "settings",
        label: t("command.settings"),
        description: t("command.settings.description"),
        icon: <Settings aria-hidden className="h-4 w-4" />,
        onSelect: () => {
          const settingsLink = document.querySelector<HTMLAnchorElement>("a[href='/settings']");
          settingsLink?.click();
        },
      },
      {
        id: "docs",
        label: t("command.docs"),
        description: t("command.docs.description"),
        icon: <BookOpen aria-hidden className="h-4 w-4" />,
        onSelect: () => {
          window.open("https://kolibri.ai/docs", "_blank", "noopener");
        },
      },
    ],
    [t],
  );

  const commands = useMemo(() => {
    const source = items ?? defaultItems;
    if (!query.trim()) {
      return source;
    }
    const normalized = query.toLowerCase();
    return source.filter((item) =>
      [item.label, item.description].some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [items, query, defaultItems]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const timeout = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(timeout);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || typeof window === "undefined") {
      return;
    }
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  const handleKeyNavigation = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!commands.length) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % commands.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + commands.length) % commands.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = commands[activeIndex];
      if (item) {
        item.onSelect();
        onClose();
      }
    }
  };

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-[rgba(4,6,9,0.76)] px-4 py-16" role="presentation">
      <div
        ref={containerRef}
        className="relative w-full max-w-2xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-overlay)] p-4 shadow-[var(--shadow-2)]"
        role="dialog"
        aria-modal="true"
        aria-label={t("command.title")}
        onKeyDown={handleKeyNavigation}
      >
        <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] pb-3">
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("command.placeholder")}
            aria-label={t("command.placeholder")}
          />
          <Button variant="ghost" onClick={onClose} aria-label={t("command.close")}>
            {t("command.close")}
          </Button>
        </div>
        <div className="mt-3 max-h-[60vh] overflow-y-auto" role="menu" aria-label={t("command.menuLabel")}>
          {commands.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-[var(--muted)]">{t("command.empty")}</p>
          ) : (
            <ul className="space-y-2">
              {commands.map((command, index) => (
                <li key={command.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      command.onSelect();
                      onClose();
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:[box-shadow:var(--focus-strong)] ${
                      activeIndex === index
                        ? "border-[var(--brand)] bg-[var(--brand-ghost)] text-[var(--brand)]"
                        : "border-transparent bg-[var(--bg-soft)] text-[var(--text)] hover:border-[var(--border-subtle)]"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      {command.icon ? (
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[rgba(74,222,128,0.12)] text-[var(--brand)]">
                          {command.icon}
                        </span>
                      ) : null}
                      <span className="flex flex-col">
                        <span className="text-sm font-semibold">{command.label}</span>
                        <span className="text-xs text-[var(--muted)]">{command.description}</span>
                      </span>
                    </span>
                    <span className="rounded-full border border-[var(--border-subtle)] px-2 py-1 text-[0.7rem] text-[var(--muted)]">
                      ⏎
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
