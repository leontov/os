import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  MotionPreference,
  PersonaTheme,
  PersonaThemeRegistry,
  ThemeAppearance,
  ThemeAppearancePreference,
  personaThemeRegistry,
  type MotionPattern,
} from "./personaThemeRegistry";
import {
  clearCachedProfile,
  fetchCloudProfile,
  updateCloudProfile,
  type CloudPersonaProfile,
} from "./cloudProfile";

const detachNoop = () => {};

interface PersonaThemeSnapshot {
  personaId: string;
  appearance: ThemeAppearancePreference;
  resolvedAppearance: ThemeAppearance;
  motionPreference: MotionPreference;
  resolvedMotion: "expressive" | "reduced";
  voiceId: string;
  activePersona: PersonaTheme;
  motion: MotionPattern;
  voice: PersonaTheme["voice"];
  isReady: boolean;
  isSyncing: boolean;
  lastSyncedIso?: string;
}

type PersonaThemeListener = () => void;

const resolveSystemAppearance = (): ThemeAppearance => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
};

const resolveSystemMotion = (): "expressive" | "reduced" => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "expressive";
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "expressive";
};

const buildInitialSnapshot = (registry: PersonaThemeRegistry): PersonaThemeSnapshot => {
  const [firstPersona] = registry.list();
  if (!firstPersona) {
    throw new Error("PersonaThemeRegistry must contain at least one persona");
  }
  const resolvedMotion = resolveSystemMotion();
  const motion = resolvedMotion === "reduced" ? firstPersona.motion.reduced : firstPersona.motion.expressive;
  registry.apply(firstPersona.id, resolveSystemAppearance(), motion);
  return {
    personaId: firstPersona.id,
    appearance: "system",
    resolvedAppearance: resolveSystemAppearance(),
    motionPreference: "auto",
    resolvedMotion,
    voiceId: firstPersona.voice.id,
    activePersona: firstPersona,
    motion,
    voice: firstPersona.voice,
    isReady: false,
    isSyncing: false,
  };
};

class PersonaThemeStore {
  private state: PersonaThemeSnapshot;

  private readonly listeners = new Set<PersonaThemeListener>();

  private hasInitialized = false;

  private appearanceMedia: MediaQueryList | null = null;

  private reducedMotionMedia: MediaQueryList | null = null;

  constructor(private readonly registry: PersonaThemeRegistry) {
    this.state = buildInitialSnapshot(registry);
  }

  subscribe(listener: PersonaThemeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot = (): PersonaThemeSnapshot => this.state;

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private resolveAppearance(preference: ThemeAppearancePreference): ThemeAppearance {
    return preference === "system" ? resolveSystemAppearance() : preference;
  }

  private resolveMotion(preference: MotionPreference): "expressive" | "reduced" {
    if (preference === "auto") {
      return resolveSystemMotion();
    }
    return preference;
  }

  private computeState(partial: Partial<CloudPersonaProfile>): PersonaThemeSnapshot {
    const previous = this.state;
    const persona =
      this.registry.get(partial.personaId ?? previous.personaId) ?? this.registry.get(previous.personaId) ?? previous.activePersona;
    const appearancePreference = partial.appearance ?? previous.appearance;
    const motionPreference = partial.motionPreference ?? previous.motionPreference;
    const voiceId = partial.voiceId ?? previous.voiceId ?? persona.voice.id;

    const resolvedAppearance = this.resolveAppearance(appearancePreference);
    const resolvedMotion = this.resolveMotion(motionPreference);
    const motion = resolvedMotion === "reduced" ? persona.motion.reduced : persona.motion.expressive;

    const next: PersonaThemeSnapshot = {
      personaId: persona.id,
      appearance: appearancePreference,
      resolvedAppearance,
      motionPreference,
      resolvedMotion,
      voiceId,
      activePersona: persona,
      motion,
      voice: persona.voice,
      isReady: previous.isReady,
      isSyncing: previous.isSyncing,
      lastSyncedIso: partial.updatedAtIso ?? previous.lastSyncedIso,
    };

    this.registry.apply(persona.id, resolvedAppearance, motion);
    if (typeof document !== "undefined") {
      document.documentElement.dataset.motion = resolvedMotion;
    }

    return next;
  }

  private setState(next: PersonaThemeSnapshot, options: { notify?: boolean } = {}) {
    this.state = next;
    if (options.notify !== false) {
      this.notify();
    }
  }

  async ensureInitialized() {
    if (this.hasInitialized) {
      return;
    }
    this.hasInitialized = true;
    this.setState({ ...this.state, isSyncing: true }, { notify: true });
    try {
      const profile = await fetchCloudProfile();
      if (profile) {
        const next = this.computeState(profile);
        this.setState({ ...next, isReady: true, isSyncing: false, lastSyncedIso: profile.updatedAtIso ?? new Date().toISOString() });
      } else {
        this.setState({ ...this.state, isReady: true, isSyncing: false });
      }
    } catch (error) {
      console.warn("[persona-theme] Failed to load profile", error);
      this.setState({ ...this.state, isReady: true, isSyncing: false });
    }
  }

  attachSystemListeners() {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return detachNoop;
    }

    this.appearanceMedia = window.matchMedia("(prefers-color-scheme: light)");
    const handleAppearance = () => {
      if (this.state.appearance === "system") {
        const next = this.computeState({ appearance: "system" });
        this.setState(next);
      }
    };

    if (typeof this.appearanceMedia.addEventListener === "function") {
      this.appearanceMedia.addEventListener("change", handleAppearance);
    } else {
      this.appearanceMedia.addListener(handleAppearance);
    }

    this.reducedMotionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleMotion = () => {
      if (this.state.motionPreference === "auto") {
        const next = this.computeState({ motionPreference: "auto" });
        this.setState(next);
      }
    };

    if (typeof this.reducedMotionMedia.addEventListener === "function") {
      this.reducedMotionMedia.addEventListener("change", handleMotion);
    } else {
      this.reducedMotionMedia.addListener(handleMotion);
    }

    return () => {
      if (this.appearanceMedia) {
        if (typeof this.appearanceMedia.removeEventListener === "function") {
          this.appearanceMedia.removeEventListener("change", handleAppearance);
        } else {
          this.appearanceMedia.removeListener(handleAppearance);
        }
      }
      if (this.reducedMotionMedia) {
        if (typeof this.reducedMotionMedia.removeEventListener === "function") {
          this.reducedMotionMedia.removeEventListener("change", handleMotion);
        } else {
          this.reducedMotionMedia.removeListener(handleMotion);
        }
      }
    };
  }

  private async syncProfile() {
    try {
      const payload: CloudPersonaProfile = {
        personaId: this.state.personaId,
        appearance: this.state.appearance,
        motionPreference: this.state.motionPreference,
        voiceId: this.state.voiceId,
      };
      this.setState({ ...this.state, isSyncing: true });
      const updated = await updateCloudProfile(payload);
      const next = this.computeState(updated);
      this.setState({ ...next, isReady: true, isSyncing: false, lastSyncedIso: updated.updatedAtIso ?? new Date().toISOString() });
    } catch (error) {
      console.warn("[persona-theme] Failed to update cloud profile", error);
      this.setState({ ...this.state, isSyncing: false });
    }
  }

  setPersona(personaId: string) {
    const next = this.computeState({ personaId });
    this.setState({ ...next, isReady: true });
    void this.syncProfile();
  }

  setAppearance(appearance: ThemeAppearancePreference) {
    const next = this.computeState({ appearance });
    this.setState(next);
    void this.syncProfile();
  }

  setMotionPreference(motionPreference: MotionPreference) {
    const next = this.computeState({ motionPreference });
    this.setState(next);
    void this.syncProfile();
  }

  forceRefresh() {
    clearCachedProfile();
    this.hasInitialized = false;
  }

  applyProfileForStory(profile: Partial<CloudPersonaProfile>) {
    const next = this.computeState(profile);
    this.setState({ ...next, isReady: true, isSyncing: false });
  }
}

const personaThemeStore = new PersonaThemeStore(personaThemeRegistry);

export const usePersonaTheme = () => {
  const snapshot = useSyncExternalStore(
    (listener) => personaThemeStore.subscribe(listener),
    personaThemeStore.getSnapshot,
    personaThemeStore.getSnapshot,
  );

  useEffect(() => {
    void personaThemeStore.ensureInitialized();
  }, []);

  useEffect(() => {
    const detach = personaThemeStore.attachSystemListeners();
    return () => {
      detach();
    };
  }, []);

  const personas = useMemo(() => personaThemeRegistry.list(), []);

  return {
    personas,
    personaId: snapshot.personaId,
    appearance: snapshot.appearance,
    resolvedAppearance: snapshot.resolvedAppearance,
    motionPreference: snapshot.motionPreference,
    motion: snapshot.motion,
    resolvedMotion: snapshot.resolvedMotion,
    voiceId: snapshot.voiceId,
    voice: snapshot.voice,
    activePersona: snapshot.activePersona,
    isReady: snapshot.isReady,
    isSyncing: snapshot.isSyncing,
    lastSyncedIso: snapshot.lastSyncedIso,
    setPersona: (id: string) => personaThemeStore.setPersona(id),
    setAppearance: (appearance: ThemeAppearancePreference) => personaThemeStore.setAppearance(appearance),
    setMotionPreference: (motion: MotionPreference) => personaThemeStore.setMotionPreference(motion),
    refreshFromCloud: () => {
      personaThemeStore.forceRefresh();
      void personaThemeStore.ensureInitialized();
    },
  };
};

export type PersonaThemeState = ReturnType<typeof usePersonaTheme>;

export const __dangerousOverridePersonaProfileForStory = (profile: Partial<CloudPersonaProfile>) => {
  personaThemeStore.applyProfileForStory(profile);
};
