import { useCallback, useEffect, useMemo, useState } from "react";

export interface ProfileSettings {
  theme: string;
  timezone: string;
  notificationsEnabled: boolean;
  defaultLanguage: string | null;
}

export interface ProfileMetrics {
  latencyMs: number;
  latencyTrend: string;
  throughputPerMinute: number;
  throughputTrend: string;
  nps: number;
  npsTrend: string;
  recommendation: string;
}

export interface ProfileDefinition {
  id: string;
  name: string;
  role: string;
  languages: readonly string[];
  settings: ProfileSettings;
  metrics: ProfileMetrics;
}

interface ServerProfileMetrics {
  latency_ms?: number;
  latency_trend?: string;
  throughput_per_minute?: number;
  throughput_trend?: string;
  nps?: number;
  nps_trend?: string;
  recommendation?: string;
}

interface ServerProfileSettings {
  theme?: string;
  timezone?: string;
  notifications_enabled?: boolean;
  default_language?: string | null;
}

interface ServerProfile {
  id: string;
  name?: string;
  role?: string;
  languages?: string[];
  settings?: ServerProfileSettings;
  metrics?: ServerProfileMetrics;
}

const DEFAULT_SETTINGS: ProfileSettings = {
  theme: "system",
  timezone: "Europe/Moscow",
  notificationsEnabled: true,
  defaultLanguage: "ru",
};

const DEFAULT_METRICS: ProfileMetrics = {
  latencyMs: 1800,
  latencyTrend: "-6%",
  throughputPerMinute: 60,
  throughputTrend: "+4%",
  nps: 74,
  npsTrend: "+2",
  recommendation: "Проверьте, насколько команды готовы к следующему релизу",
};

const bootstrapProfiles: ProfileDefinition[] = [
  {
    id: "product",
    name: "Продуктовые инициативы",
    role: "Product lead",
    languages: ["ru", "en"],
    settings: { ...DEFAULT_SETTINGS, defaultLanguage: "ru" },
    metrics: {
      latencyMs: 1450,
      latencyTrend: "-12%",
      throughputPerMinute: 72,
      throughputTrend: "+8%",
      nps: 78,
      npsTrend: "+5",
      recommendation: "Сфокусируйтесь на фичах для удержания ключевых аккаунтов",
    },
  },
  {
    id: "support",
    name: "Клиентская поддержка",
    role: "Support manager",
    languages: ["ru"],
    settings: { ...DEFAULT_SETTINGS, notificationsEnabled: false, defaultLanguage: "ru" },
    metrics: {
      latencyMs: 2100,
      latencyTrend: "-4%",
      throughputPerMinute: 54,
      throughputTrend: "+3%",
      nps: 69,
      npsTrend: "+2",
      recommendation: "Расширьте базу знаний для снижения нагрузки на команду",
    },
  },
];

const bootstrapById = new Map(bootstrapProfiles.map((profile) => [profile.id, profile]));

function normaliseLanguages(languages: readonly string[] | undefined): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const language of languages ?? []) {
    const normalised = language.trim().toLowerCase();
    if (!normalised) {
      continue;
    }
    if (!seen.has(normalised)) {
      seen.add(normalised);
      result.push(normalised);
    }
  }
  return result;
}

function mergeSettings(settings: ServerProfileSettings | undefined, fallback: ProfileSettings): ProfileSettings {
  const merged: ProfileSettings = {
    theme: settings?.theme?.trim() || fallback.theme,
    timezone: settings?.timezone?.trim() || fallback.timezone,
    notificationsEnabled:
      typeof settings?.notifications_enabled === "boolean"
        ? settings.notifications_enabled
        : fallback.notificationsEnabled,
    defaultLanguage:
      settings?.default_language !== undefined ? settings.default_language : fallback.defaultLanguage,
  };
  if (merged.defaultLanguage) {
    merged.defaultLanguage = merged.defaultLanguage.trim().toLowerCase();
  }
  return merged;
}

function mergeMetrics(metrics: ServerProfileMetrics | undefined, fallback: ProfileMetrics): ProfileMetrics {
  return {
    latencyMs: typeof metrics?.latency_ms === "number" ? metrics.latency_ms : fallback.latencyMs,
    latencyTrend: metrics?.latency_trend ?? fallback.latencyTrend,
    throughputPerMinute:
      typeof metrics?.throughput_per_minute === "number"
        ? metrics.throughput_per_minute
        : fallback.throughputPerMinute,
    throughputTrend: metrics?.throughput_trend ?? fallback.throughputTrend,
    nps: typeof metrics?.nps === "number" ? metrics.nps : fallback.nps,
    npsTrend: metrics?.nps_trend ?? fallback.npsTrend,
    recommendation: metrics?.recommendation ?? fallback.recommendation,
  };
}

function ensureLanguages(languages: readonly string[], defaultLanguage: string | null): string[] {
  const normalised = normaliseLanguages(languages);
  if (defaultLanguage) {
    const preferred = defaultLanguage.trim().toLowerCase();
    if (preferred) {
      const filtered = normalised.filter((language) => language !== preferred);
      return [preferred, ...filtered];
    }
  }
  return normalised;
}

function toProfileDefinition(payload: ServerProfile): ProfileDefinition {
  const fallback = bootstrapById.get(payload.id);
  const settings = mergeSettings(payload.settings, fallback?.settings ?? DEFAULT_SETTINGS);
  const baseLanguages = payload.languages ?? fallback?.languages ?? [];
  const languages = ensureLanguages(baseLanguages, settings.defaultLanguage);
  const metrics = mergeMetrics(payload.metrics, fallback?.metrics ?? DEFAULT_METRICS);
  const normalisedLanguages = normaliseLanguages(languages);
  const resolvedLanguages =
    normalisedLanguages.length
      ? normalisedLanguages
      : [settings.defaultLanguage ?? DEFAULT_SETTINGS.defaultLanguage ?? "ru"];

  const defaultLanguage = settings.defaultLanguage ?? resolvedLanguages[0] ?? null;

  return {
    id: payload.id,
    name: payload.name?.trim() || fallback?.name || "Профиль",
    role: payload.role?.trim() || fallback?.role || "Member",
    languages: resolvedLanguages,
    settings: {
      theme: settings.theme,
      timezone: settings.timezone,
      notificationsEnabled: settings.notificationsEnabled,
      defaultLanguage,
    },
    metrics,
  };
}

export interface ProfileState {
  profiles: ReadonlyArray<ProfileDefinition>;
  activeProfileId: string;
  activeProfile: ProfileDefinition | null;
  selectProfile: (id: string) => void;
  updateLanguages: (id: string, languages: readonly string[]) => void;
}

export function useProfileState(): ProfileState {
  const [profiles, setProfiles] = useState<ProfileDefinition[]>(bootstrapProfiles);
  const [activeProfileId, setActiveProfileId] = useState<string>(bootstrapProfiles[0]?.id ?? "");

  const selectProfile = useCallback(
    (id: string) => {
      setActiveProfileId((current) => {
        if (profiles.some((profile) => profile.id === id)) {
          return id;
        }
        return current;
      });
    },
    [profiles],
  );

  const updateLanguages = useCallback((id: string, languages: readonly string[]) => {
    const normalised = normaliseLanguages(languages);
    setProfiles((current) =>
      current.map((profile) => {
        if (profile.id !== id) {
          return profile;
        }
        const resolved = normalised.length ? normalised : [...profile.languages];
        const defaultLanguage =
          profile.settings.defaultLanguage && resolved.includes(profile.settings.defaultLanguage)
            ? profile.settings.defaultLanguage
            : resolved[0] ?? profile.settings.defaultLanguage;
        return {
          ...profile,
          languages: resolved,
          settings: {
            ...profile.settings,
            defaultLanguage: defaultLanguage ?? null,
          },
        };
      }),
    );
  }, []);

  const syncFromServer = useCallback((items: readonly ServerProfile[]) => {
    if (!items.length) {
      return;
    }
    setProfiles((current) => {
      const index = new Map(current.map((profile, idx) => [profile.id, idx]));
      const next = [...current];
      items.forEach((item) => {
        const normalised = toProfileDefinition(item);
        const existingIndex = index.get(normalised.id);
        if (existingIndex !== undefined) {
          next[existingIndex] = {
            ...next[existingIndex],
            name: normalised.name || next[existingIndex].name,
            role: normalised.role || next[existingIndex].role,
            languages: normalised.languages,
            settings: normalised.settings,
            metrics: normalised.metrics,
          };
        } else {
          next.push(normalised);
        }
      });
      return next;
    });
    setActiveProfileId((current) => {
      if (items.some((item) => item.id === current)) {
        return current;
      }
      return items[0]?.id ?? current;
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof fetch === "undefined") {
      return;
    }
    let cancelled = false;
    const loadProfiles = async () => {
      try {
        const response = await fetch("/api/v1/profiles");
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { items?: ServerProfile[] };
        if (!cancelled && Array.isArray(payload.items)) {
          syncFromServer(payload.items);
        }
      } catch {
        // Offline or network error; keep bootstrap profiles.
      }
    };
    void loadProfiles();
    return () => {
      cancelled = true;
    };
  }, [syncFromServer]);

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? null,
    [profiles, activeProfileId],
  );

  return {
    profiles,
    activeProfileId,
    activeProfile,
    selectProfile,
    updateLanguages,
  };
}
