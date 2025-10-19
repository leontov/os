import { BrainCircuit, CheckCircle2, Flame, Gauge, Loader2, Save, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { KernelCapabilities } from "../core/kolibri-bridge";
import type { KernelControlsState } from "../core/useKolibriChat";
import type { ConversationMetrics } from "../core/useKolibriChat";
import { MODE_OPTIONS, findModeLabel } from "../core/modes";

interface SwarmProfile {
  id: string;
  name: string;
  description: string;
  mode: string;
  controls: KernelControlsState;
  createdAtIso: string;
  updatedAtIso: string;
  lastUsedIso?: string;
}

interface SwarmViewProps {
  kernelControls: KernelControlsState;
  kernelCapabilities: KernelCapabilities;
  onApplyControls: (controls: Partial<KernelControlsState>) => void;
  onModeChange: (mode: string) => void;
  activeMode: string;
  metrics: ConversationMetrics;
  isBusy: boolean;
}

interface ProfileEditorState {
  name: string;
  description: string;
  mode: string;
  controls: KernelControlsState;
}

const STORAGE_KEY = "kolibri:swarm-profiles";

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const normaliseControls = (controls: KernelControlsState): KernelControlsState => ({
  b0: clamp(Number(controls.b0) || 0.5, 0, 1),
  d0: clamp(Number(controls.d0) || 0.5, 0, 1),
  temperature: clamp(Number(controls.temperature) || 0.85, 0.1, 2),
  topK: clamp(Math.round(Number(controls.topK) || 4), 1, 12),
  cfBeam: Boolean(controls.cfBeam),
});

const createProfile = (
  name: string,
  description: string,
  mode: string,
  controls: KernelControlsState,
): SwarmProfile => ({
  id: (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `profile-${Math.random().toString(16).slice(2)}`),
  name,
  description,
  mode,
  controls: normaliseControls(controls),
  createdAtIso: new Date().toISOString(),
  updatedAtIso: new Date().toISOString(),
});

const buildDefaultProfiles = (controls: KernelControlsState, mode: string): SwarmProfile[] => {
  const balanced = createProfile(
    "Текущий оператор",
    "Клонирует активные настройки диалога",
    mode,
    controls,
  );

  const analystControls: KernelControlsState = {
    ...controls,
    temperature: clamp(controls.temperature - 0.1, 0.1, 2),
    topK: clamp(controls.topK + 2, 1, 12),
    cfBeam: true,
  };
  const analyst = createProfile("Аналитик", "Максимизирует точность и глубину ответа", "analytics", analystControls);

  const fastControls: KernelControlsState = {
    ...controls,
    temperature: clamp(controls.temperature - 0.3, 0.1, 2),
    topK: clamp(controls.topK - 1, 1, 12),
    cfBeam: false,
  };
  const fast = createProfile("Экспресс", "Быстрые ответы без каскада CF", "neutral", fastControls);

  return [balanced, analyst, fast];
};

const loadProfiles = (controls: KernelControlsState, mode: string): SwarmProfile[] => {
  if (typeof window === "undefined") {
    return buildDefaultProfiles(controls, mode);
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const profiles = parsed
          .map((entry) => {
            if (!entry || typeof entry !== "object") {
              return null;
            }
            const record = entry as SwarmProfile;
            if (!record.name || !record.mode || !record.controls) {
              return null;
            }
            return {
              ...record,
              id: record.id || `profile-${Math.random().toString(16).slice(2)}`,
              controls: normaliseControls(record.controls),
            };
          })
          .filter((profile): profile is SwarmProfile => Boolean(profile));
        if (profiles.length) {
          return profiles;
        }
      }
    }
  } catch (storageError) {
    console.warn("Не удалось загрузить профили роя", storageError);
  }
  return buildDefaultProfiles(controls, mode);
};

const toEditorState = (profile: SwarmProfile): ProfileEditorState => ({
  name: profile.name,
  description: profile.description,
  mode: profile.mode,
  controls: { ...profile.controls },
});

const describeCapability = (capabilities: KernelCapabilities): string => {
  const parts = [];
  parts.push(capabilities.simd ? "SIMD активен" : "SIMD недоступен");
  parts.push(`Ширина векторов: ${Math.max(1, Math.floor(capabilities.laneWidth))}×`);
  parts.push(capabilities.wasm ? "WASM-движок загружен" : "используется запасной режим");
  return parts.join(" · ");
};

const SwarmView = ({
  kernelControls,
  kernelCapabilities,
  onApplyControls,
  onModeChange,
  activeMode,
  metrics,
  isBusy,
}: SwarmViewProps) => {
  const [profiles, setProfiles] = useState<SwarmProfile[]>(() => loadProfiles(kernelControls, activeMode));
  const [selectedId, setSelectedId] = useState<string | null>(profiles[0]?.id ?? null);
  const selectedProfile = useMemo(
    () => (selectedId ? profiles.find((profile) => profile.id === selectedId) ?? null : null),
    [profiles, selectedId],
  );
  const [editor, setEditor] = useState<ProfileEditorState>(() =>
    toEditorState(profiles[0] ?? createProfile("Новый агент", "", activeMode, kernelControls)),
  );

  useEffect(() => {
    if (selectedProfile) {
      setEditor(toEditorState(selectedProfile));
    }
  }, [selectedProfile]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    } catch (storageError) {
      console.warn("Не удалось сохранить профили роя", storageError);
    }
  }, [profiles]);

  const efficiencyScore = useMemo(() => {
    const score = (metrics.conservedRatio + metrics.stability + metrics.auditability + metrics.returnToAttractor) / 4;
    return Math.round(score * 100);
  }, [metrics]);

  const knowledgeUsage = useMemo(() => {
    if (!metrics.assistantMessages) {
      return 0;
    }
    return Math.round((metrics.knowledgeReferences / Math.max(metrics.assistantMessages, 1)) * 100);
  }, [metrics]);

  const handleControlChange = <K extends keyof KernelControlsState>(key: K, value: KernelControlsState[K]) => {
    setEditor((prev) => ({
      ...prev,
      controls: {
        ...prev.controls,
        [key]: value,
      },
    }));
  };

  const handleSaveProfile = () => {
    const trimmedName = editor.name.trim();
    if (!trimmedName) {
      return;
    }
    const base: SwarmProfile = selectedProfile
      ? { ...selectedProfile }
      : createProfile(trimmedName, editor.description, editor.mode, editor.controls);

    const updated: SwarmProfile = {
      ...base,
      name: trimmedName,
      description: editor.description.trim(),
      mode: editor.mode,
      controls: normaliseControls(editor.controls),
      updatedAtIso: new Date().toISOString(),
    };

    setProfiles((prev) => {
      const existingIndex = prev.findIndex((profile) => profile.id === updated.id);
      if (existingIndex === -1) {
        return [updated, ...prev];
      }
      const next = [...prev];
      next[existingIndex] = updated;
      return next;
    });
    setSelectedId(updated.id);
  };

  const handleDeleteProfile = (id: string) => {
    setProfiles((prev) => {
      const next = prev.filter((profile) => profile.id !== id);
      if (selectedId === id) {
        setSelectedId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const handleApplyProfile = (profile: SwarmProfile) => {
    onApplyControls(profile.controls);
    onModeChange(profile.mode);
    const timestamp = new Date().toISOString();
    setProfiles((prev) =>
      prev.map((item) =>
        item.id === profile.id
          ? {
              ...item,
              lastUsedIso: timestamp,
            }
          : item,
      ),
    );
  };

  const startNewProfile = () => {
    setSelectedId(null);
    setEditor({
      name: "Новый агент",
      description: "",
      mode: activeMode,
      controls: { ...kernelControls },
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <section className="grid gap-4 md:grid-cols-3">
        <article className="glass-panel flex items-center gap-3 px-4 py-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <BrainCircuit className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-text-secondary">Эффективность</p>
            <p className="text-lg font-semibold text-text-primary">{efficiencyScore}%</p>
          </div>
        </article>
        <article className="glass-panel flex items-center gap-3 px-4 py-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-text-secondary">Контекст</p>
            <p className="text-lg font-semibold text-text-primary">{knowledgeUsage}%</p>
          </div>
        </article>
        <article className="glass-panel flex items-center gap-3 px-4 py-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-background-input/60 text-text-secondary">
            <Gauge className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-text-secondary">Latency P50</p>
            <p className="text-lg font-semibold text-text-primary">{metrics.latencyP50} мс</p>
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,3fr),minmax(0,2fr)]">
        <article className="glass-panel flex flex-col gap-6 p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-text-secondary">Редактор профиля</p>
              <h2 className="mt-1 text-lg font-semibold text-text-primary">
                {selectedProfile ? `Профиль «${selectedProfile.name}»` : "Новый профиль"}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={startNewProfile}
                className="ghost-button text-xs"
              >
                Создать новый
              </button>
              <button
                type="button"
                onClick={handleSaveProfile}
                className="glass-panel flex items-center gap-2 px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:text-primary"
              >
                <Save className="h-4 w-4" />
                Сохранить
              </button>
            </div>
          </header>

          <div className="grid gap-4">
            <label className="grid gap-2 text-sm text-text-secondary">
              Название
              <input
                value={editor.name}
                onChange={(event) => setEditor((prev) => ({ ...prev, name: event.target.value }))}
                className="rounded-2xl border border-border-strong/60 bg-background-input/80 px-4 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                placeholder="Например, Поддержка или Исследователь"
              />
            </label>
            <label className="grid gap-2 text-sm text-text-secondary">
              Описание
              <textarea
                value={editor.description}
                onChange={(event) => setEditor((prev) => ({ ...prev, description: event.target.value }))}
                rows={2}
                className="rounded-2xl border border-border-strong/60 bg-background-input/80 px-4 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                placeholder="Чем занимается агент"
              />
            </label>
            <label className="grid gap-2 text-sm text-text-secondary">
              Режим общения
              <select
                value={editor.mode}
                onChange={(event) => setEditor((prev) => ({ ...prev, mode: event.target.value }))}
                className="rounded-2xl border border-border-strong/60 bg-background-input/80 px-4 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
              >
                {MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-xs uppercase tracking-[0.35em] text-text-secondary">
              Стартовое B0
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={editor.controls.b0}
                onChange={(event) => handleControlChange("b0", Number(event.target.value))}
                className="w-full accent-primary"
              />
              <span className="text-sm font-semibold text-text-primary">{editor.controls.b0.toFixed(2)}</span>
            </label>
            <label className="grid gap-2 text-xs uppercase tracking-[0.35em] text-text-secondary">
              Дампинг D0
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={editor.controls.d0}
                onChange={(event) => handleControlChange("d0", Number(event.target.value))}
                className="w-full accent-primary"
              />
              <span className="text-sm font-semibold text-text-primary">{editor.controls.d0.toFixed(2)}</span>
            </label>
            <label className="grid gap-2 text-xs uppercase tracking-[0.35em] text-text-secondary">
              Temperature
              <input
                type="range"
                min={0.1}
                max={2}
                step={0.01}
                value={editor.controls.temperature}
                onChange={(event) => handleControlChange("temperature", Number(event.target.value))}
                className="w-full accent-primary"
              />
              <span className="text-sm font-semibold text-text-primary">{editor.controls.temperature.toFixed(2)}</span>
            </label>
            <label className="grid gap-2 text-xs uppercase tracking-[0.35em] text-text-secondary">
              Top-K
              <input
                type="range"
                min={1}
                max={12}
                step={1}
                value={editor.controls.topK}
                onChange={(event) => handleControlChange("topK", Number(event.target.value))}
                className="w-full accent-primary"
              />
              <span className="text-sm font-semibold text-text-primary">{editor.controls.topK}</span>
            </label>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-border-strong/60 bg-background-input/80 px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-text-secondary">CF Beam</p>
              <p className="text-sm text-text-secondary/80">Управляет каскадом коллективного фильтра</p>
            </div>
            <button
              type="button"
              onClick={() => handleControlChange("cfBeam", !editor.controls.cfBeam)}
              className={`rounded-2xl px-4 py-2 text-xs font-semibold transition-colors ${
                editor.controls.cfBeam
                  ? "bg-primary/20 text-primary"
                  : "bg-background-card/80 text-text-secondary hover:text-text-primary"
              }`}
            >
              {editor.controls.cfBeam ? "Включено" : "Выключено"}
            </button>
          </div>
        </article>

        <aside className="glass-panel flex flex-col gap-4 p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-text-secondary">Текущий узел</p>
              <h3 className="mt-1 text-lg font-semibold text-text-primary">{findModeLabel(activeMode)}</h3>
            </div>
            {isBusy ? <Loader2 className="h-5 w-5 animate-spin text-text-secondary" /> : <CheckCircle2 className="h-5 w-5 text-primary" />}
          </header>
          <div className="grid gap-2 text-sm text-text-secondary">
            <div className="glass-panel flex items-center justify-between px-4 py-2">
              <span>B0</span>
              <span className="font-semibold text-text-primary">{kernelControls.b0.toFixed(2)}</span>
            </div>
            <div className="glass-panel flex items-center justify-between px-4 py-2">
              <span>D0</span>
              <span className="font-semibold text-text-primary">{kernelControls.d0.toFixed(2)}</span>
            </div>
            <div className="glass-panel flex items-center justify-between px-4 py-2">
              <span>Temperature</span>
              <span className="font-semibold text-text-primary">{kernelControls.temperature.toFixed(2)}</span>
            </div>
            <div className="glass-panel flex items-center justify-between px-4 py-2">
              <span>Top-K</span>
              <span className="font-semibold text-text-primary">{kernelControls.topK}</span>
            </div>
            <div className="glass-panel flex items-center justify-between px-4 py-2">
              <span>CF Beam</span>
              <span className="font-semibold text-text-primary">{kernelControls.cfBeam ? "ON" : "OFF"}</span>
            </div>
          </div>
          <div className="rounded-2xl border border-border-strong/60 bg-background-input/80 px-4 py-3 text-xs text-text-secondary">
            <p className="font-semibold text-text-primary">Возможности ядра</p>
            <p className="mt-1">{describeCapability(kernelCapabilities)}</p>
          </div>
        </aside>
      </section>

      <section className="glass-panel p-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-text-secondary">Профили</p>
            <h3 className="mt-1 text-lg font-semibold text-text-primary">Управление роем</h3>
          </div>
        </header>
        <div className="mt-4 grid gap-3">
          {profiles.map((profile) => (
            <article
              key={profile.id}
              className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors ${
                profile.id === selectedId
                  ? "border-primary/40 bg-primary/10"
                  : "border-border-strong/60 bg-background-input/70 hover:border-primary/40"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-text-primary">{profile.name}</p>
                  <p className="text-xs uppercase tracking-[0.35em] text-text-secondary">{findModeLabel(profile.mode)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedId(profile.id)}
                    className="ghost-button text-xs"
                  >
                    Редактировать
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyProfile(profile)}
                    className="glass-panel flex items-center gap-2 px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:text-primary"
                  >
                    <Flame className="h-4 w-4" />
                    Активировать
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProfile(profile.id)}
                    className="rounded-2xl border border-red-500/40 px-3 py-2 text-xs text-red-200 transition-colors hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {profile.description ? <p className="text-text-secondary/80">{profile.description}</p> : null}
              <div className="flex flex-wrap gap-2 text-[0.7rem] uppercase tracking-wide text-text-secondary/80">
                <span className="rounded-xl bg-background-card/70 px-3 py-1">B0 {profile.controls.b0.toFixed(2)}</span>
                <span className="rounded-xl bg-background-card/70 px-3 py-1">D0 {profile.controls.d0.toFixed(2)}</span>
                <span className="rounded-xl bg-background-card/70 px-3 py-1">Temp {profile.controls.temperature.toFixed(2)}</span>
                <span className="rounded-xl bg-background-card/70 px-3 py-1">TopK {profile.controls.topK}</span>
                <span className="rounded-xl bg-background-card/70 px-3 py-1">CF {profile.controls.cfBeam ? "ON" : "OFF"}</span>
                {profile.lastUsedIso ? (
                  <span className="rounded-xl bg-background-card/70 px-3 py-1 text-text-secondary/60">
                    Последний запуск: {new Date(profile.lastUsedIso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
export default SwarmView;
