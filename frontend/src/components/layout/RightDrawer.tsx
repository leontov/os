import * as Tabs from "@radix-ui/react-tabs";
import { X } from "lucide-react";
import { Button } from "../ui/Button";

export interface DrawerSection {
  value: string;
  label: string;
  content: React.ReactNode;
}

interface RightDrawerProps {
  sections: ReadonlyArray<DrawerSection>;
  activeSection: string;
  onChangeSection: (value: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function RightDrawer({ sections, activeSection, onChangeSection, isOpen, onClose }: RightDrawerProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <aside
      className="hidden h-full w-96 flex-shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-elev)] lg:flex"
      aria-label="Панель параметров"
    >
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Контекст</h2>
        <Button variant="ghost" size="icon" aria-label="Закрыть панель" onClick={onClose}>
          <X aria-hidden />
        </Button>
      </div>
      <Tabs.Root value={activeSection} onValueChange={onChangeSection} className="flex h-full flex-col">
        <Tabs.List
          className="grid grid-cols-3 gap-2 border-b border-[var(--border-subtle)] px-4 py-3"
          aria-label="Выбор секции контекста"
        >
          {sections.map((section) => (
            <Tabs.Trigger
              key={section.value}
              value={section.value}
              className="rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-[var(--muted)] transition data-[state=active]:border-[var(--brand)] data-[state=active]:bg-[var(--brand-ghost)] data-[state=active]:text-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(6,8,10,0.8)]"
            >
              {section.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {sections.map((section) => (
            <Tabs.Content key={section.value} value={section.value} className="space-y-3 text-sm text-[var(--text)]">
              {section.content}
            </Tabs.Content>
          ))}
        </div>
      </Tabs.Root>
    </aside>
  );
}
