import {
  Share2,
  FileDown,
  MoreHorizontal,
  Search,
  MessageCircle,
  Moon,
  SunMedium,
  Command,
  Menu,
  WifiOff,
} from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import type { ReactNode } from "react";

interface HeaderProps {
  title: string;
  subtitle?: string;
  context?: ReactNode;
  onSearch: () => void;
  onShare: () => void;
  onExport: () => void;
  onMenu: () => void;
  onOpenCommand: () => void;
  onToggleTheme: () => void;
  resolvedTheme: "dark" | "light";
  onToggleSidebar?: () => void;
  isOffline?: boolean;
  offlineLabel?: string;
}

export function Header({
  title,
  subtitle,
  context,
  onSearch,
  onShare,
  onExport,
  onMenu,
  onOpenCommand,
  onToggleTheme,
  resolvedTheme,
  onToggleSidebar,
  isOffline,
  offlineLabel,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 px-4 pt-6 sm:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex items-center justify-between rounded-[2.5rem] border border-[var(--surface-border)] bg-[var(--surface-card)]/85 px-5 py-5 shadow-[0_32px_80px_rgba(8,10,14,0.55)] backdrop-blur-2xl">
          <div className="flex items-center gap-5">
            {onToggleSidebar ? (
              <Button
                variant="ghost"
                size="icon"
                className="xl:hidden"
                aria-label="Открыть список бесед"
                onClick={onToggleSidebar}
              >
                <Menu aria-hidden />
              </Button>
            ) : null}
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-[var(--brand)]/90 to-emerald-400/70 text-black shadow-[0_25px_60px_rgba(16,185,129,0.35)]">
                <MessageCircle aria-hidden />
              </span>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--muted)]">Kolibri</p>
                  {isOffline ? (
                    <Badge tone="warning" className="inline-flex items-center gap-2 text-xs">
                      <WifiOff aria-hidden className="h-3.5 w-3.5" />
                      {offlineLabel ?? "Offline"}
                    </Badge>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-balance">
                  <h1 className="text-2xl font-semibold leading-tight text-[var(--text)] sm:text-[1.85rem]">
                    {title}
                  </h1>
                  {subtitle ? <span className="text-sm text-[var(--text-subtle)]">{subtitle}</span> : null}
                </div>
                {context ? <div className="text-sm text-[var(--text-subtle)]">{context}</div> : null}
              </div>
            </div>
          </div>
          <nav aria-label="Глобальные действия" className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onOpenCommand} aria-label="Открыть командную панель">
              <Command aria-hidden />
            </Button>
            <Button variant="ghost" size="icon" onClick={onSearch} aria-label="Поиск">
              <Search aria-hidden />
            </Button>
            <Button variant="ghost" size="icon" onClick={onShare} aria-label="Поделиться">
              <Share2 aria-hidden />
            </Button>
            <Button variant="ghost" size="icon" onClick={onExport} aria-label="Экспорт">
              <FileDown aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Переключить тему"
              onClick={onToggleTheme}
              title="Сменить тему"
            >
              {resolvedTheme === "dark" ? <SunMedium aria-hidden /> : <Moon aria-hidden />}
            </Button>
            <Button variant="secondary" size="icon" onClick={onMenu} aria-label="Дополнительно">
              <MoreHorizontal aria-hidden />
            </Button>
          </nav>
        </div>
      </div>
    </header>
  );
}
