import { useMemo } from "react";
import type { DrawerSection } from "../../components/layout/RightDrawer";
import type { Translator } from "../../app/i18n";
import type { ProfileMetrics } from "../profile";

type AnalyticsDependencies = {
  memoryEntries: readonly string[];
  parameterEntries: readonly string[];
  profileName: string | null;
  profileMetrics: ProfileMetrics | null;
  languages: readonly string[];
  conversationCount: number;
};

type AnalyticsEntry = {
  id: string;
  label: string;
  value: string;
  trend?: string | null;
  description?: string | null;
};

function formatConversationValue(count: number): string {
  return new Intl.NumberFormat().format(Math.max(0, count));
}

function formatLanguages(t: Translator, languages: readonly string[]): string {
  if (!languages.length) {
    return t("drawer.analytics.languagesEmpty");
  }
  return languages.join(", ");
}

export function getAnalyticsEntries(
  t: Translator,
  { profileMetrics, profileName, languages, conversationCount }: AnalyticsDependencies,
): readonly AnalyticsEntry[] {
  const metrics = profileMetrics;
  const hasMetrics = Boolean(metrics);
  const latencyValue = hasMetrics
    ? `${Math.round(metrics!.latencyMs)} ${t("drawer.analytics.ms")}`
    : "—";
  const throughputValue = hasMetrics
    ? `${metrics!.throughputPerMinute} / ${t("drawer.analytics.minute")}`
    : "—";
  const npsValue = hasMetrics ? `${metrics!.nps}` : "—";
  const latencyDescription = profileName
    ? `${t("drawer.analytics.latencyDescription")} ${profileName}`
    : t("drawer.analytics.latencyDescription");

  return [
    {
      id: "latency",
      label: t("drawer.analytics.latencyLabel"),
      value: latencyValue,
      trend: metrics?.latencyTrend,
      description: latencyDescription,
    },
    {
      id: "throughput",
      label: t("drawer.analytics.throughputLabel"),
      value: throughputValue,
      trend: metrics?.throughputTrend,
      description: t("drawer.analytics.throughputDescription"),
    },
    {
      id: "nps",
      label: t("drawer.analytics.npsLabel"),
      value: npsValue,
      trend: metrics?.npsTrend,
      description: t("drawer.analytics.npsDescription"),
    },
    {
      id: "conversations",
      label: t("drawer.analytics.conversationsLabel"),
      value: formatConversationValue(conversationCount),
      description: t("drawer.analytics.conversationsDescription"),
    },
    {
      id: "languages",
      label: t("drawer.analytics.languagesLabel"),
      value: formatLanguages(t, languages),
      description: t("drawer.analytics.languagesDescription"),
    },
    {
      id: "insight",
      label: t("drawer.analytics.recommendationLabel"),
      value: metrics?.recommendation ?? "—",
    },
  ];
}

export function useDrawerSections(
  t: Translator,
  dependencies: AnalyticsDependencies,
): { sections: DrawerSection[]; analyticsEntries: readonly AnalyticsEntry[] } {
  const analyticsEntries = useMemo(
    () => getAnalyticsEntries(t, dependencies),
    [dependencies, t],
  );

  const sections = useMemo<DrawerSection[]>(
    () => [
      {
        value: "analytics",
        label: t("drawer.analytics"),
        content: (
          <div className="space-y-3">
            {analyticsEntries.map((entry) => (
              <div
                key={entry.id}
                className="space-y-2 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-glass)] p-4 text-sm text-[var(--text)]"
              >
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  <span>{entry.label}</span>
                  {entry.trend ? <span className="text-[var(--brand)]">{entry.trend}</span> : null}
                </div>
                <div className="text-xl font-semibold text-[var(--text)]">{entry.value}</div>
                {entry.description ? (
                  <p className="text-xs text-[var(--muted)]">{entry.description}</p>
                ) : null}
              </div>
            ))}
          </div>
        ),
      },
      {
        value: "memory",
        label: t("drawer.memory"),
        content: (
          <div className="space-y-3">
            {dependencies.memoryEntries.map((entry) => (
              <div
                key={entry}
                className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-glass)] p-4 text-sm text-[var(--text)]"
              >
                {entry}
              </div>
            ))}
          </div>
        ),
      },
      {
        value: "parameters",
        label: t("drawer.parameters"),
        content: (
          <div className="space-y-3">
            {dependencies.parameterEntries.map((entry) => (
              <div
                key={entry}
                className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-glass)] p-4 text-sm text-[var(--text)]"
              >
                {entry}
              </div>
            ))}
          </div>
        ),
      },
    ],
    [analyticsEntries, dependencies.memoryEntries, dependencies.parameterEntries, t],
  );

  return { sections, analyticsEntries };
}
