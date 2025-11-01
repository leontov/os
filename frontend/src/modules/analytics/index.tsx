import { useMemo } from "react";
import type { MessageKey } from "../../app/i18n";
import type { DrawerSection } from "../../components/layout/RightDrawer";
import type { Translate } from "../../app/i18n";

type AnalyticsDependencies = {
  memoryEntries: readonly string[];
  parameterEntries: readonly string[];
};

export function getAnalyticsEntries(t: Translate): readonly string[] {
  return [
    t("drawer.analytics.latency"),
    t("drawer.analytics.throughput"),
    t("drawer.analytics.nps"),
    t("drawer.analytics.recommendation"),
  ];
}

export function useDrawerSections(
  t: Translate,
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
