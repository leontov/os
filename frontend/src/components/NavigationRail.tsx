import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Activity, Compass, Network, Plus, Settings, Sparkles, X } from "lucide-react";
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

type ThemePreference = "system" | "dark" | "light";

const THEME_STORAGE_KEY = "kolibri:ui-theme";

const resolveSystemTheme = (): "light" | "dark" => {
  if (typeof window === "undefined") {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
};

const readInitialTheme = (): ThemePreference => {
  if (typeof window === "undefined") {
    return "system";
  }
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
};

const applyTheme = (preference: ThemePreference) => {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;

  const desired = preference === "system" ? resolveSystemTheme() : preference;

  if (desired === "light") {
    root.setAttribute("data-theme", "light");
    root.style.colorScheme = "light";
  } else {
    root.removeAttribute("data-theme");
    root.style.colorScheme = "dark";
  }
};

const themeOptions: Array<{ value: ThemePreference; title: string; description: string }> = [
  {
    value: "system",
    title: "Как в системе",
    description: "Следовать настройке операционной системы.",
  },
  {
    value: "dark",
    title: "Тёмная тема",
    description: "Глубокие цвета и максимальный контраст.",
  },
  {
    value: "light",
    title: "Светлая тема",
    description: "Светлый фон и мягкие акценты.",
  },
];

const NavigationRail = ({
  onCreateConversation,
  isBusy,
  metrics,
  activeSection,
  onSectionChange,
}: NavigationRailProps) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(readInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  }, [theme]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = () => {
      applyTheme("system");
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
    } else {
      media.addListener(handleChange);
    }
    return () => {
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", handleChange);
      } else {
        media.removeListener(handleChange);
      }
    };
  }, [theme]);

  const totalMessages = useMemo(
    () => metrics.userMessages + metrics.assistantMessages,
    [metrics.assistantMessages, metrics.userMessages],
  );

  const handleThemeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value as ThemePreference;
    setTheme(next);
  };

  const closeSettings = () => setIsSettingsOpen(false);

  return (
    <>
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
            <p className="font-semibold text-text-primary">{totalMessages}</p>
            <p>сообщений</p>
          </div>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border-strong bg-background-card/80 text-text-secondary transition-colors hover:text-text-primary"
            aria-label="Настройки"
            aria-expanded={isSettingsOpen}
            aria-controls="kolibri-settings-panel"
            onClick={() => setIsSettingsOpen(true)}
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>
      {isSettingsOpen && (
        <div
          id="kolibri-settings-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="kolibri-settings-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
          onClick={closeSettings}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-border-strong bg-background-panel/95 p-6 text-left shadow-card backdrop-blur"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="kolibri-settings-title" className="text-lg font-semibold text-text-primary">
                  Настройки Kolibri
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Управляйте внешним видом интерфейса и поведением приложения.
                </p>
              </div>
              <button
                type="button"
                onClick={closeSettings}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-strong bg-background-card/80 text-text-secondary transition-colors hover:text-text-primary"
                aria-label="Закрыть настройки"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-6 space-y-4">
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Оформление</h3>
                <p className="mt-2 text-sm text-text-secondary">
                  Выберите тему, чтобы адаптировать Kolibri под ваше окружение.
                </p>
                <div className="mt-4 space-y-3">
                  {themeOptions.map((option) => {
                    const isSelected = theme === option.value;
                    return (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary ${
                          isSelected
                            ? "border-primary/60 bg-primary/10"
                            : "border-border-strong/60 bg-background-card/70 hover:border-primary/40"
                        }`}
                      >
                        <input
                          type="radio"
                          name="theme"
                          value={option.value}
                          checked={isSelected}
                          onChange={handleThemeChange}
                          className="mt-1 h-4 w-4 shrink-0 accent-primary"
                        />
                        <span className="flex flex-col">
                          <span className="text-sm font-semibold text-text-primary">{option.title}</span>
                          <span className="text-xs text-text-secondary">{option.description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
              <section className="rounded-2xl border border-border-strong/60 bg-background-card/70 px-4 py-3 text-xs text-text-secondary">
                Изменения сохраняются автоматически и применяются при каждом запуске Kolibri на этом устройстве.
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default NavigationRail;
