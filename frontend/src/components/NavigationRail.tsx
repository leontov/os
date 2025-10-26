import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Plus, Settings, Volume2, X } from "lucide-react";
import type { ConversationMetrics } from "../core/useKolibriChat";
import { usePersonaTheme } from "../core/usePersonaTheme";
import type { MotionPreference, ThemeAppearancePreference } from "../core/personaThemeRegistry";
import { NAVIGATION_ITEMS, type NavigationSection } from "./navigation";

interface NavigationRailProps {
  onCreateConversation: () => void;
  isBusy: boolean;
  metrics: ConversationMetrics;
  activeSection: NavigationSection;
  onSectionChange: (section: NavigationSection) => void;
}

const appearanceOptions: Array<{ value: ThemeAppearancePreference; title: string; description: string }> = [
  {
    value: "system",
    title: "Как в системе",
    description: "Следовать настройкам операционной системы.",
  },
  {
    value: "dark",
    title: "Тёмная",
    description: "Высокий контраст и глубокие фоны.",
  },
  {
    value: "light",
    title: "Светлая",
    description: "Воздушная палитра и мягкий фон.",
  },
];

const motionOptions: Array<{ value: MotionPreference; title: string; description: string }> = [
  {
    value: "auto",
    title: "Авто",
    description: "Учитывать системную настройку по уменьшению движения.",
  },
  {
    value: "expressive",
    title: "Выразительная",
    description: "Плавные переходы и анимация жестов.",
  },
  {
    value: "reduced",
    title: "Минимальная",
    description: "Только необходимые визуальные изменения.",
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
  const [voiceAnnouncement, setVoiceAnnouncement] = useState("");

  const {
    personas,
    personaId,
    setPersona,
    appearance,
    setAppearance,
    motionPreference,
    setMotionPreference,
    voice,
    isSyncing,
    lastSyncedIso,
  } = usePersonaTheme();

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

  const totalMessages = useMemo(
    () => metrics.userMessages + metrics.assistantMessages,
    [metrics.assistantMessages, metrics.userMessages],
  );

  const handleAppearanceChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value as ThemeAppearancePreference;
    setAppearance(next);
  };

  const handleMotionChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value as MotionPreference;
    setMotionPreference(next);
  };

  const handleVoicePreview = () => {
    if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") {
      setVoiceAnnouncement("Прослушивание недоступно в этом окружении.");
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(voice.previewText);
      utterance.lang = voice.locale;
      utterance.pitch = Math.max(0.1, 1 + voice.pitch / 10);
      utterance.rate = Math.max(0.5, voice.rate);
      window.speechSynthesis.speak(utterance);
      setVoiceAnnouncement(`Воспроизводится голос ${voice.name}`);
    } catch (error) {
      console.warn("[persona-voice] Failed to preview voice", error);
      setVoiceAnnouncement("Не удалось воспроизвести голос.");
    }
  };

  const formattedSyncTime = useMemo(() => {
    if (!lastSyncedIso) {
      return "Синхронизация ещё не выполнялась";
    }
    try {
      return `Синхронизировано ${new Date(lastSyncedIso).toLocaleString("ru-RU")}`;
    } catch {
      return "Время синхронизации недоступно";
    }
  }, [lastSyncedIso]);

  return (
    <>
      <nav className="glass-panel-strong flex h-full w-20 flex-col items-center justify-between p-4" aria-label="Основная навигация">
        <div className="flex flex-col items-center gap-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/80 to-primary/60 text-lg font-semibold text-white shadow-lg" aria-label="Kolibri Persona">
            К
          </div>
          <button
            type="button"
            onClick={onCreateConversation}
            disabled={isBusy}
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border-strong bg-background-card/80 text-text-secondary transition-quick hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Новая беседа"
          >
            <Plus className="h-5 w-5" />
          </button>
          <div role="radiogroup" aria-label="Основные разделы Kolibri" className="flex flex-col items-center gap-3">
            {NAVIGATION_ITEMS.map((item) => {
              const isActive = activeSection === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl border transition-quick ease-gesture focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
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
          </div>
        </div>
        <div className="space-y-3 text-center text-[0.65rem] text-text-secondary">
          <div className="glass-panel px-2 py-2" aria-live="polite">
            <p className="font-semibold text-text-primary">{totalMessages}</p>
            <p>сообщений</p>
          </div>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border-strong bg-background-card/80 text-text-secondary transition-quick hover:text-text-primary"
            aria-label="Настройки оформления"
            aria-expanded={isSettingsOpen}
            aria-controls="kolibri-settings-panel"
            onClick={() => setIsSettingsOpen(true)}
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </nav>
      {isSettingsOpen && (
        <div
          id="kolibri-settings-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="kolibri-settings-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="w-full max-w-4xl rounded-3xl border border-border-strong bg-background-panel/95 p-6 text-left shadow-card backdrop-blur"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="kolibri-settings-title" className="text-lg font-semibold text-text-primary">
                  Персонализация Kolibri
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Выберите персону, визуальное оформление и интенсивность движения. Настройки синхронизируются через облачный профиль.
                </p>
                <p className="mt-2 text-xs text-text-secondary/80" aria-live="polite">
                  {isSyncing ? "Синхронизация…" : formattedSyncTime}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-strong bg-background-card/80 text-text-secondary transition-quick hover:text-text-primary"
                aria-label="Закрыть настройки"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-6 grid gap-6">
              <section aria-labelledby="kolibri-persona-section">
                <h3 id="kolibri-persona-section" className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
                  Персона Kolibri
                </h3>
                <p className="mt-2 text-sm text-text-secondary">
                  Персона влияет на цвета интерфейса, голос ассистента и паттерны движений.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {personas.map((persona) => {
                    const isSelected = persona.id === personaId;
                    return (
                      <button
                        key={persona.id}
                        type="button"
                        onClick={() => setPersona(persona.id)}
                        className={`flex w-full flex-col items-start gap-3 rounded-2xl border px-5 py-4 text-left transition-gentle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                          isSelected
                            ? "border-primary/70 bg-primary/10"
                            : "border-border-strong/60 bg-background-card/80 hover:border-primary/40"
                        }`}
                        aria-pressed={isSelected}
                      >
                        <span className="pill-badge">{persona.tags.join(" · ")}</span>
                        <div>
                          <p className="text-base font-semibold text-text-primary">{persona.name}</p>
                          <p className="mt-1 text-sm text-text-secondary">{persona.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
              <section aria-labelledby="kolibri-appearance-section" className="space-y-3">
                <div>
                  <h3 id="kolibri-appearance-section" className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
                    Внешний вид
                  </h3>
                  <p className="mt-1 text-sm text-text-secondary">
                    Переключайтесь между светлым и тёмным режимами или следуйте настройке системы.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {appearanceOptions.map((option) => {
                    const isSelected = appearance === option.value;
                    return (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer flex-col gap-2 rounded-2xl border px-4 py-3 transition-gentle focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary ${
                          isSelected
                            ? "border-primary/60 bg-primary/10"
                            : "border-border-strong/60 bg-background-card/70 hover:border-primary/40"
                        }`}
                      >
                        <span className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-text-primary">{option.title}</span>
                          <input
                            type="radio"
                            name="appearance"
                            value={option.value}
                            checked={isSelected}
                            onChange={handleAppearanceChange}
                            className="h-4 w-4 accent-primary"
                          />
                        </span>
                        <span className="text-xs text-text-secondary">{option.description}</span>
                      </label>
                    );
                  })}
                </div>
              </section>
              <section aria-labelledby="kolibri-motion-section" className="space-y-3">
                <div>
                  <h3 id="kolibri-motion-section" className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
                    Движение
                  </h3>
                  <p className="mt-1 text-sm text-text-secondary">
                    Настройте интенсивность анимации. Режим «Авто» учитывает системные предпочтения.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {motionOptions.map((option) => {
                    const isSelected = motionPreference === option.value;
                    return (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer flex-col gap-2 rounded-2xl border px-4 py-3 transition-gentle focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary ${
                          isSelected
                            ? "border-primary/60 bg-primary/10"
                            : "border-border-strong/60 bg-background-card/70 hover:border-primary/40"
                        }`}
                      >
                        <span className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-text-primary">{option.title}</span>
                          <input
                            type="radio"
                            name="motion"
                            value={option.value}
                            checked={isSelected}
                            onChange={handleMotionChange}
                            className="h-4 w-4 accent-primary"
                          />
                        </span>
                        <span className="text-xs text-text-secondary">{option.description}</span>
                      </label>
                    );
                  })}
                </div>
              </section>
              <section aria-labelledby="kolibri-voice-section" className="rounded-2xl border border-border-strong/60 bg-background-card/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 id="kolibri-voice-section" className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
                      Голос ассистента
                    </h3>
                    <p className="mt-1 text-sm text-text-secondary">
                      {voice.name} · {voice.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleVoicePreview}
                    className="inline-flex items-center gap-2 rounded-xl border border-border-strong bg-background-input/80 px-4 py-2 text-sm font-semibold text-text-primary transition-quick hover:border-primary hover:text-primary"
                  >
                    <Volume2 className="h-4 w-4" />
                    Прослушать
                  </button>
                </div>
                <p className="mt-3 text-xs text-text-secondary">{voice.previewText}</p>
                <span aria-live="polite" className="sr-only">
                  {voiceAnnouncement}
                </span>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default NavigationRail;
