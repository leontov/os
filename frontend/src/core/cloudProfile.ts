import type { MotionPreference, ThemeAppearancePreference } from "./personaThemeRegistry";

export interface CloudPersonaProfile {
  personaId: string;
  appearance: ThemeAppearancePreference;
  motionPreference: MotionPreference;
  voiceId: string;
  updatedAtIso?: string;
}

const STORAGE_KEY = "kolibri:persona-profile";
const DEFAULT_ENDPOINT = "/api/profile/theme";

const resolveApiBase = (): string => {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) {
    const base = String(import.meta.env.VITE_API_BASE_URL).trim();
    if (base) {
      return base.endsWith("/") ? base.slice(0, -1) : base;
    }
  }
  return "";
};

const API_BASE = resolveApiBase();

const buildProfileUrl = () => `${API_BASE}${DEFAULT_ENDPOINT}`;

const safeParseJson = (value: string | null): unknown => {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const normalizeAppearance = (value: unknown): ThemeAppearancePreference => {
  if (value === "dark" || value === "light" || value === "system") {
    return value;
  }
  return "system";
};

const normalizeMotion = (value: unknown): MotionPreference => {
  if (value === "expressive" || value === "reduced" || value === "auto") {
    return value;
  }
  return "auto";
};

const normalizeProfile = (input: Partial<CloudPersonaProfile>): CloudPersonaProfile => ({
  personaId: input.personaId || "aurora",
  appearance: normalizeAppearance(input.appearance),
  motionPreference: normalizeMotion(input.motionPreference),
  voiceId: input.voiceId || "aurora-voice",
  updatedAtIso: input.updatedAtIso,
});

const readFromStorage = (): CloudPersonaProfile | null => {
  if (typeof window === "undefined" || !("localStorage" in window)) {
    return null;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  return normalizeProfile(parsed as Partial<CloudPersonaProfile>);
};

const writeToStorage = (profile: CloudPersonaProfile) => {
  if (typeof window === "undefined" || !("localStorage" in window)) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (error) {
    console.warn("[persona-profile] Unable to persist profile to storage", error);
  }
};

export const fetchCloudProfile = async (): Promise<CloudPersonaProfile | null> => {
  const url = buildProfileUrl();
  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Unexpected status ${response.status}`);
    }
    const data = (await response.json()) as Partial<CloudPersonaProfile>;
    const profile = normalizeProfile(data);
    writeToStorage(profile);
    return profile;
  } catch (error) {
    console.warn("[persona-profile] Falling back to local profile", error);
    return readFromStorage();
  }
};

export const updateCloudProfile = async (profile: CloudPersonaProfile): Promise<CloudPersonaProfile> => {
  const normalized = normalizeProfile(profile);
  writeToStorage({ ...normalized, updatedAtIso: new Date().toISOString() });
  const url = buildProfileUrl();
  try {
    const response = await fetch(url, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(normalized),
    });
    if (!response.ok) {
      throw new Error(`Unexpected status ${response.status}`);
    }
    const data = (await response.json()) as Partial<CloudPersonaProfile>;
    const updated = normalizeProfile({ ...normalized, ...data, updatedAtIso: new Date().toISOString() });
    writeToStorage(updated);
    return updated;
  } catch (error) {
    console.warn("[persona-profile] Failed to persist profile to cloud", error);
    return normalized;
  }
};

export const clearCachedProfile = () => {
  if (typeof window === "undefined" || !("localStorage" in window)) {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
};
