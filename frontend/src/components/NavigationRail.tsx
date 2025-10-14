import { Compass, History, LayoutGrid, Settings, Sparkles } from "lucide-react";

const navigationItems = [
  { icon: LayoutGrid, label: "Главная", active: true },
  { icon: Sparkles, label: "Знания" },
  { icon: Compass, label: "Исследовать" },
  { icon: History, label: "История" },
  { icon: Settings, label: "Настройки" },
];

const NavigationRail = () => (
  <div className="flex h-full w-16 flex-col items-center justify-between rounded-3xl bg-background-panel/60 p-4 backdrop-blur">
    <div className="flex flex-col items-center gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        К
      </div>
      <nav className="flex flex-col items-center gap-3">
        {navigationItems.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
              item.active ? "bg-primary/20 text-primary" : "text-text-secondary hover:text-text-primary"
            }`}
            aria-label={item.label}
          >
            <item.icon className="h-5 w-5" />
          </button>
        ))}
      </nav>
    </div>
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background-card text-text-secondary">
      <span className="text-sm font-semibold">Я</span>
    </div>
  </div>
);

export default NavigationRail;
