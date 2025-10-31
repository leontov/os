import { useMemo } from "react";
import { Sparkles, Gauge, Target, Users, WifiOff, Activity, ArrowUpRight } from "lucide-react";
import { SegmentedControl } from "../ui/Segmented";
import { Badge } from "../ui/Badge";
import { useI18n } from "../../app/i18n";

export type ConversationMode = "balanced" | "creative" | "precise";

interface Participant {
  name: string;
  role: string;
}

interface ConversationMetric {
  label: string;
  value: string;
  delta?: string;
}

interface ConversationHeroProps {
  summary: string;
  mode: ConversationMode;
  onModeChange: (value: ConversationMode) => void;
  participants: ReadonlyArray<Participant>;
  metrics: ReadonlyArray<ConversationMetric>;
  isOffline: boolean;
  offlineLabel: string;
}

export function ConversationHero({
  summary,
  mode,
  onModeChange,
  participants,
  metrics,
  isOffline,
  offlineLabel,
}: ConversationHeroProps) {
  const { t } = useI18n();

  const options = useMemo(
    () => [
      { value: "balanced", label: t("hero.modes.balanced"), icon: <Gauge aria-hidden className="h-4 w-4" /> },
      { value: "creative", label: t("hero.modes.creative"), icon: <Sparkles aria-hidden className="h-4 w-4" /> },
      { value: "precise", label: t("hero.modes.precise"), icon: <Target aria-hidden className="h-4 w-4" /> },
    ],
    [t],
  );

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-2)]"
      aria-labelledby="conversation-hero-title"
    >
      <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[var(--surface-highlight)] opacity-60" aria-hidden />
      <div className="relative flex flex-col gap-6">
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="accent" className="text-xs">
                {t("hero.active")}
              </Badge>
              <SegmentedControl
                value={mode}
                options={options}
                onValueChange={(value: string) => {
                  if (value) {
                    onModeChange(value as ConversationMode);
                  }
                }}
                aria-label={t("hero.modeSwitch")}
              />
            </div>
            {isOffline ? (
              <Badge tone="warning" className="inline-flex items-center gap-2 text-xs">
                <WifiOff aria-hidden className="h-3.5 w-3.5" />
                {offlineLabel}
              </Badge>
            ) : null}
          </div>
          <p id="conversation-hero-title" className="max-w-3xl text-base text-[var(--text-subtle)]">
            {summary}
          </p>
        </header>
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {participants.map((participant) => (
              <div
                key={participant.name}
                className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-glass)] p-4"
              >
                <dt className="flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--muted)]">
                  <Users aria-hidden className="h-3.5 w-3.5" />
                  {participant.role}
                </dt>
                <dd className="mt-2 text-base font-semibold text-[var(--text)]">{participant.name}</dd>
              </div>
            ))}
          </dl>
          <dl className="grid gap-4">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-glass)] p-4"
              >
                <dt className="flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--muted)]">
                  <Activity aria-hidden className="h-3.5 w-3.5" />
                  {metric.label}
                </dt>
                <dd className="mt-2 flex items-baseline gap-2 text-2xl font-semibold text-[var(--text)]">
                  {metric.value}
                  {metric.delta ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(74,222,128,0.12)] px-2 py-0.5 text-xs font-medium text-[var(--brand)]">
                      <ArrowUpRight aria-hidden className="h-3 w-3" />
                      {metric.delta}
                    </span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
