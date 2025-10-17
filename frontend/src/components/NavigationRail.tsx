import { Activity, Compass, Network, Plus, Settings, Sparkles } from "lucide-react";
import type { ConversationMetrics } from "../core/useKolibriChat";

export type NavigationSection = "dialog" | "knowledge" | "swarm" | "analytics";

const navigationItems: Array<{ icon: typeof Sparkles; label: string; value: NavigationSection }> = [
  { icon: Sparkles, label: "Диалог", value: "dialog" },
  { icon: Compass, label: "Знания", value: "knowledge" },
  { icon: Network, label: "Рой", value: "swarm" },
  { icon: Activity, label: "Аналитика", value: "analytics" },
];

interface NavigationRailProps {
  onCreateConversation: () => void;
  isBusy: boolean;
  metrics: ConversationMetrics;
  activeSection: NavigationSection;
  onSectionChange: (section: NavigationSection) => void;
}

const NavigationRail = ({
  onCreateConversation,
  isBusy,
  metrics,
  activeSection,
  onSectionChange,
}: NavigationRailProps) => (
  <div className="flex h-full w-20 flex-col items-center justify-between rounded-[2.5rem] border border-border-strong bg-background-panel/70 p-4 backdrop-blur">
    <div className="flex flex-col items-center gap-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-primary/15 text-lg font-semibold text-primary">
        К
      </div>
      <button
        type="button"
        onClick={onCreateConversation}
        disabled={isBusy}
        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border-strong bg-background-card/80 text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Новая беседа"
      >
        <Plus className="h-5 w-5" />
      </button>
      <nav className="flex flex-col items-center gap-3">
        {navigationItems.map((item) => {
          const isActive = activeSection === item.value;
          return (
          <button
            key={item.value}
            type="button"
            className={`flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              isActive
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-transparent text-text-secondary hover:border-primary/40 hover:text-text-primary"
            }`}
            aria-label={item.label}
            aria-pressed={isActive}
            onClick={() => onSectionChange(item.value)}
            disabled={isBusy && item.value !== "dialog"}
          >
            <item.icon className="h-5 w-5" />
          </button>
          );
        })}
      </nav>
    </div>
    <div className="space-y-3 text-center text-[0.65rem] text-text-secondary">
      <div className="rounded-2xl border border-border-strong bg-background-card/70 px-2 py-2">
        <p className="font-semibold text-text-primary">{metrics.userMessages + metrics.assistantMessages}</p>
        <p>сообщений</p>
      </div>
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border-strong bg-background-card/80 text-text-secondary transition-colors hover:text-text-primary"
        aria-label="Настройки"
      >
        <Settings className="h-5 w-5" />
      </button>
    </div>
  </div>
);

export default NavigationRail;
