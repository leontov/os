import { Clock3, Plus, SlidersHorizontal } from "lucide-react";
import type { ConversationMetrics } from "../core/useKolibriChat";
import { NAVIGATION_ITEMS, type NavigationSection } from "./navigation";

interface MobileDockProps {
  activeSection: NavigationSection;
  onSectionChange: (section: NavigationSection) => void;
  onCreateConversation: () => void;
  onOpenHistory: () => void;
  onOpenControls: () => void;
  isBusy: boolean;
  metrics: ConversationMetrics;
}

const MobileDock = ({
  activeSection,
  onSectionChange,
  onCreateConversation,
  onOpenHistory,
  onOpenControls,
  isBusy,
  metrics,
}: MobileDockProps) => {
  const totalMessages = metrics.assistantMessages + metrics.userMessages;
  return (
    <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 text-xs font-medium text-text-secondary">
      <button
        type="button"
        onClick={onOpenHistory}
        className="glass-panel flex flex-1 items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary"
        aria-label="История бесед"
      >
        <Clock3 className="h-4 w-4" />
        История
      </button>
      <div className="glass-panel flex flex-[2] items-center justify-around gap-1 px-2 py-1 text-[0.7rem]">
        {NAVIGATION_ITEMS.map((item) => {
          const isActive = item.value === activeSection;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onSectionChange(item.value)}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-1 transition-colors ${
                isActive
                  ? "bg-primary/15 text-primary"
                  : "text-text-secondary hover:text-text-primary"
              }`}
              aria-pressed={isActive}
              aria-label={item.label}
              disabled={isBusy && item.value !== "dialog"}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-1 items-center justify-end gap-2">
        <button
          type="button"
          onClick={onOpenControls}
          className="glass-panel flex h-11 w-11 items-center justify-center text-text-secondary transition-colors hover:text-text-primary"
          aria-label="Настроить ядро"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onCreateConversation}
          disabled={isBusy}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-white shadow-lg transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Новая беседа"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <span className="sr-only">{`Сообщений: ${totalMessages}`}</span>
    </div>
  );
};

export default MobileDock;
