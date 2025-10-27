import { Share2, FileDown, MoreHorizontal, Search, MessageCircle } from "lucide-react";
import { Button } from "../ui/Button";

interface HeaderProps {
  title: string;
  onSearch: () => void;
  onShare: () => void;
  onExport: () => void;
  onMenu: () => void;
}

export function Header({ title, onSearch, onShare, onExport, onMenu }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[rgba(14,17,22,0.85)] backdrop-blur supports-[backdrop-filter]:backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-[var(--content-max-width)] items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-ghost)] text-[var(--brand)]">
            <MessageCircle aria-hidden />
          </span>
          <div>
            <p className="text-sm uppercase tracking-wider text-[var(--muted)]">Kolibri</p>
            <h1 className="text-lg font-semibold text-[var(--text)]" aria-live="polite">
              {title}
            </h1>
          </div>
        </div>
        <nav aria-label="Глобальные действия" className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onSearch} aria-label="Поиск">
            <Search aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" onClick={onShare} aria-label="Поделиться">
            <Share2 aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" onClick={onExport} aria-label="Экспорт">
            <FileDown aria-hidden />
          </Button>
          <Button variant="secondary" size="icon" onClick={onMenu} aria-label="Дополнительно">
            <MoreHorizontal aria-hidden />
          </Button>
        </nav>
      </div>
    </header>
  );
}
