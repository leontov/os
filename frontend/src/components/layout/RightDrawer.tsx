import { useEffect } from "react";
import { createPortal } from "react-dom";
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
  title: string;
  menuLabel?: string;
  closeLabel?: string;
}

export function RightDrawer({
  sections,
  activeSection,
  onChangeSection,
  isOpen,
  onClose,
  title,
  menuLabel,
  closeLabel,
}: RightDrawerProps) {
  const drawerContent = (
    <div className="flex h-full w-full flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-elev)]">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">{title}</h2>
        <Button variant="ghost" size="icon" aria-label={closeLabel ?? title} onClick={onClose}>
          <X aria-hidden />
        </Button>
      </div>
      <Tabs.Root value={activeSection} onValueChange={onChangeSection} className="flex h-full flex-col">
        <Tabs.List
          className="grid grid-cols-3 gap-2 border-b border-[var(--border-subtle)] px-4 py-3"
          aria-label={menuLabel ?? title}
        >
          {sections.map((section) => (
            <Tabs.Trigger
              key={section.value}
              value={section.value}
              className="rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-[var(--muted)] transition data-[state=active]:border-[var(--brand)] data-[state=active]:bg-[var(--brand-ghost)] data-[state=active]:text-[var(--brand)] focus-visible:outline-none focus-visible:[box-shadow:var(--focus-strong)]"
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
    </div>
  );

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") {
      return;
    }
    const prefersInline = window.matchMedia("(min-width: 1280px)").matches;
    if (prefersInline) {
      return;
    }
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  const inline = (
    <aside
      className={`hidden h-full w-[26rem] flex-shrink-0 flex-col xl:flex ${isOpen ? "" : "xl:hidden"}`.trim()}
      aria-label={title}
    >
      {drawerContent}
    </aside>
  );

  if (typeof window === "undefined") {
    return inline;
  }

  return (
    <>
      {inline}
      {isOpen
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-stretch justify-end px-4 py-8 xl:hidden">
              <div className="absolute inset-0 bg-[rgba(6,8,10,0.65)]" onClick={onClose} aria-hidden />
              <div
                className="relative ml-auto flex h-full max-h-[min(90vh,620px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-overlay)] shadow-[var(--shadow-2)]"
                role="dialog"
                aria-modal="true"
                aria-label={title}
              >
                {drawerContent}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
