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
    <header className="sticky top-0 z-30 border-b border-[var(--surface-divider)] bg-[var(--surface-glass)]/90 backdrop-blur-xl supports-[backdrop-filter]:backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-[var(--content-max-width)] items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
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
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-ghost)] text-[var(--brand)] shadow-[var(--brand-glow)]">
            <MessageCircle aria-hidden />
          </span>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">Kolibri</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="text-xl font-semibold text-[var(--text)]" aria-live="polite">
                  {title}
                </h1>
                {subtitle ? <span className="text-sm text-[var(--muted)]">{subtitle}</span> : null}
                {isOffline ? (
                  <Badge tone="warning" className="inline-flex items-center gap-2 text-xs">
                    <WifiOff aria-hidden className="h-3.5 w-3.5" />
                    {offlineLabel ?? "Offline"}
                  </Badge>
                ) : null}
              </div>
              {context ? <div className="text-xs text-[var(--muted)]">{context}</div> : null}
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
    </header>
  );
}
