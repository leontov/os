import { useMemo } from "react";
import type { DrawerSection } from "../../components/layout/RightDrawer";
import type { Translator } from "../../app/i18n";

type AnalyticsDependencies = {
  memoryEntries: readonly string[];
  parameterEntries: readonly string[];
  profileName: string;
  profileMetrics: ProfileMetrics;
  languages: readonly string[];
  conversationCount: number;
};

export function getAnalyticsEntries(t: Translator): readonly string[] {
  return [
    {
      id: "latency",
      label: t("drawer.analytics.latencyLabel"),
      value: `${Math.round(profileMetrics.latencyMs)} ${t("drawer.analytics.ms")}`,
      trend: profileMetrics.latencyTrend,
      description: `${t("drawer.analytics.latencyDescription")} ${profileName}`,
    },
    {
      id: "throughput",
      label: t("drawer.analytics.throughputLabel"),
      value: `${profileMetrics.throughputPerMinute} / ${t("drawer.analytics.minute")}`,
      trend: profileMetrics.throughputTrend,
      description: t("drawer.analytics.throughputDescription"),
    },
    {
      id: "nps",
      label: t("drawer.analytics.npsLabel"),
      value: `${profileMetrics.nps}`,
      trend: profileMetrics.npsTrend,
      description: t("drawer.analytics.npsDescription"),
    },
    {
      id: "conversations",
      label: t("drawer.analytics.conversationsLabel"),
      value: conversationValue,
      description: t("drawer.analytics.conversationsDescription"),
    },
    {
      id: "languages",
      label: t("drawer.analytics.languagesLabel"),
      value: languagesValue,
      description: t("drawer.analytics.languagesDescription"),
    },
    {
      id: "insight",
      label: t("drawer.analytics.recommendationLabel"),
      value: profileMetrics.recommendation,
    },
  ];
}

export function useDrawerSections(
  t: Translator,
  { memoryEntries, parameterEntries }: AnalyticsDependencies,
): { sections: DrawerSection[]; analyticsEntries: readonly string[] } {
  const analyticsEntries = useMemo(() => getAnalyticsEntries(t), [t]);

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
            {memoryEntries.map((entry) => (
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
            {parameterEntries.map((entry) => (
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
    [analyticsEntries, memoryEntries, parameterEntries, t],
  );

  return { sections, analyticsEntries };
}
