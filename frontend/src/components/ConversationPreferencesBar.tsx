import { Globe2, Lock, ShieldCheck, Sparkles, SwitchCamera } from "lucide-react";
import type { ChangeEvent } from "react";
import type { ConversationPreferences, ProfilePreset } from "../core/useKolibriChat";

interface ConversationPreferencesBarProps {
  preferences: ConversationPreferences;
  onChange: (update: Partial<ConversationPreferences>) => void;
}

const PROFILE_OPTIONS: Array<{ value: ProfilePreset; label: string }> = [
  { value: "balanced", label: "Сбалансированный" },
  { value: "concise", label: "Краткий" },
  { value: "detailed", label: "Подробный" },
  { value: "technical", label: "Технический" },
  { value: "friendly", label: "Дружелюбный" },
];

const ConversationPreferencesBar = ({ preferences, onChange }: ConversationPreferencesBarProps) => {
  const handleToggleLearning = () => {
    onChange({ learningEnabled: !preferences.learningEnabled });
  };

  const handleTogglePrivate = () => {
    onChange({ privateMode: !preferences.privateMode });
  };

  const handleToggleOnline = () => {
    onChange({ allowOnline: !preferences.allowOnline });
  };

  const handleToggleSafeTone = () => {
    onChange({ safeTone: !preferences.safeTone });
  };

  const handleProfileChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange({ profilePreset: event.target.value as ProfilePreset });
  };

  return (
    <section className="rounded-3xl border border-border-strong bg-background-card/80 p-4 backdrop-blur md:flex md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.3em] text-text-secondary">
        <span className="rounded-xl border border-border-strong bg-background-input/70 px-3 py-1 text-[0.65rem] font-semibold">
          Параметры беседы
        </span>
        <button
          type="button"
          onClick={handleToggleLearning}
          className={`flex items-center gap-2 rounded-xl border px-3 py-1 text-[0.7rem] font-semibold transition-colors ${
            preferences.learningEnabled
              ? "border-primary/60 bg-primary/15 text-primary"
              : "border-border-strong bg-background-input/80 text-text-secondary hover:text-text-primary"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Обучение {preferences.learningEnabled ? "on" : "off"}
        </button>
        <button
          type="button"
          onClick={handleTogglePrivate}
          className={`flex items-center gap-2 rounded-xl border px-3 py-1 text-[0.7rem] font-semibold transition-colors ${
            preferences.privateMode
              ? "border-amber-500/60 bg-amber-500/10 text-amber-500"
              : "border-border-strong bg-background-input/80 text-text-secondary hover:text-text-primary"
          }`}
        >
          <Lock className="h-3.5 w-3.5" />
          Приватно {preferences.privateMode ? "on" : "off"}
        </button>
        <button
          type="button"
          onClick={handleToggleOnline}
          className={`flex items-center gap-2 rounded-xl border px-3 py-1 text-[0.7rem] font-semibold transition-colors ${
            preferences.allowOnline
              ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-500"
              : "border-border-strong bg-background-input/80 text-text-secondary hover:text-text-primary"
          }`}
        >
          <Globe2 className="h-3.5 w-3.5" />
          Онлайн {preferences.allowOnline ? "on" : "off"}
        </button>
        <button
          type="button"
          onClick={handleToggleSafeTone}
          className={`flex items-center gap-2 rounded-xl border px-3 py-1 text-[0.7rem] font-semibold transition-colors ${
            preferences.safeTone
              ? "border-sky-500/60 bg-sky-500/10 text-sky-500"
              : "border-border-strong bg-background-input/80 text-text-secondary hover:text-text-primary"
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Тон {preferences.safeTone ? "safe" : "std"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 md:mt-0">
        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-text-secondary">
          <SwitchCamera className="h-4 w-4 text-primary" />
          Профиль
          <select
            value={preferences.profilePreset}
            onChange={handleProfileChange}
            className="rounded-xl border border-border-strong bg-background-input/80 px-3 py-1 text-[0.75rem] font-semibold text-text-primary focus:border-primary focus:outline-none"
          >
            {PROFILE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
};

export default ConversationPreferencesBar;
