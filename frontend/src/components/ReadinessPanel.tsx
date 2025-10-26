import { AlertTriangle, BadgeCheck, Cpu, Loader2, Server, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import type { BackendHealthSnapshot, BackendHealthStatus } from "../core/health";
import type { KernelCapabilities } from "../core/kolibri-bridge";
import type { KnowledgeStatus } from "../types/knowledge-service";

interface ReadinessPanelProps {
  backend: BackendHealthSnapshot | null;
  backendError: string | null;
  backendCheckedAt: string | null;
  isBackendLoading: boolean;
  onBackendRefresh: () => void;
  knowledgeStatus: KnowledgeStatus | null;
  knowledgeError?: string;
  isKnowledgeLoading: boolean;
  onKnowledgeRefresh: () => void;
  bridgeReady: boolean;
  kernelCapabilities: KernelCapabilities;
}

const STATUS_BADGES: Record<BackendHealthStatus, { label: string; tone: string }> = {
  ok: { label: "Готов", tone: "bg-emerald-500/10 text-emerald-400 border-emerald-400/40" },
  warning: { label: "Требует внимания", tone: "bg-amber-500/10 text-amber-400 border-amber-400/40" },
  error: { label: "Ошибка", tone: "bg-rose-500/10 text-rose-400 border-rose-400/40" },
};

const formatTimestamp = (iso: string | null): string => {
  if (!iso) {
    return "—";
  }

  try {
    return new Date(iso).toLocaleString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
};

const StatusPill = ({
  status,
  icon: Icon,
}: {
  status: BackendHealthStatus;
  icon: typeof Server;
}) => {
  const badge = STATUS_BADGES[status];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.32em] ${badge.tone}`}>
      <Icon className="h-3.5 w-3.5" />
      {badge.label}
    </span>
  );
};

const SectionCard = ({
  title,
  icon: Icon,
  children,
  footer,
}: {
  title: string;
  icon: typeof Server;
  children: ReactNode;
  footer?: ReactNode;
}) => (
  <section className="rounded-3xl border border-border/60 bg-surface px-6 py-6 shadow-sm">
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="text-lg font-semibold text-text">{title}</h3>
    </div>
    <div className="mt-4 space-y-3 text-sm text-text-muted">{children}</div>
    {footer ? <div className="mt-4 border-t border-border/60 pt-4 text-xs text-text-muted">{footer}</div> : null}
  </section>
);

const ReadinessPanel = ({
  backend,
  backendError,
  backendCheckedAt,
  isBackendLoading,
  onBackendRefresh,
  knowledgeStatus,
  knowledgeError,
  isKnowledgeLoading,
  onKnowledgeRefresh,
  bridgeReady,
  kernelCapabilities,
}: ReadinessPanelProps) => {
  const backendStatus = backend?.status ?? "warning";
  const backendDetails = backend
    ? [
        { label: "Режим ответов", value: backend.responseMode },
        { label: "SSO", value: backend.ssoEnabled ? "включено" : "отключено" },
        {
          label: "Prometheus",
          value: backend.prometheusNamespace ? backend.prometheusNamespace : "не настроен",
        },
      ]
    : [];

  const knowledgeSummary = knowledgeStatus
    ? [
        { label: "Документы", value: knowledgeStatus.documents.toString() },
        { label: "Статус", value: knowledgeStatus.status },
        {
          label: "Обновлено",
          value: knowledgeStatus.timestamp ? formatTimestamp(knowledgeStatus.timestamp) : "—",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <SectionCard
        title="Backend Kolibri"
        icon={Server}
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={backendStatus} icon={backendStatus === "ok" ? BadgeCheck : backendStatus === "error" ? AlertTriangle : ShieldCheck} />
            <span>
              Последняя проверка: <span className="font-semibold text-text">{formatTimestamp(backendCheckedAt)}</span>
            </span>
          </div>
        }
      >
        {backendError ? (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold">Не удалось получить статус бекенда</p>
              <p className="text-xs text-rose-100/80">{backendError}</p>
            </div>
          </div>
        ) : null}
        {backendDetails.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {backendDetails.map(({ label, value }) => (
              <li key={label} className="rounded-2xl border border-border/50 bg-background-card/60 px-4 py-3 text-sm">
                <p className="text-[0.65rem] uppercase tracking-[0.28em] text-text-muted/80">{label}</p>
                <p className="mt-1 font-semibold text-text">{value}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted/80">Статус сервиса будет показан после первой проверки.</p>
        )}
        <button
          type="button"
          onClick={onBackendRefresh}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-text transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBackendLoading}
        >
          {isBackendLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          Проверить сейчас
        </button>
      </SectionCard>

      <SectionCard
        title="Память и знания"
        icon={Sparkles}
        footer={
          <div className="flex flex-wrap items-center gap-2">
            {knowledgeError ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-rose-200">
                <AlertTriangle className="h-3.5 w-3.5" /> Ошибка памяти
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
                <Sparkles className="h-3.5 w-3.5" /> {knowledgeStatus ? "Знания активны" : "Нет данных"}
              </span>
            )}
          </div>
        }
      >
        {knowledgeError ? (
          <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-100">
            {knowledgeError}
          </div>
        ) : null}
        {knowledgeSummary.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-3">
            {knowledgeSummary.map(({ label, value }) => (
              <li key={label} className="rounded-2xl border border-border/50 bg-background-card/60 px-4 py-3 text-sm">
                <p className="text-[0.65rem] uppercase tracking-[0.28em] text-text-muted/80">{label}</p>
                <p className="mt-1 font-semibold text-text">{value}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted/80">Данные памяти появятся после первой синхронизации.</p>
        )}
        <button
          type="button"
          onClick={onKnowledgeRefresh}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-text transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isKnowledgeLoading}
        >
          {isKnowledgeLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Синхронизировать
        </button>
      </SectionCard>

      <SectionCard
        title="WASM ядро"
        icon={Cpu}
        footer={
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-semibold uppercase tracking-[0.3em] ${bridgeReady ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300" : "border-border/60 bg-background-card text-text-muted"}`}>
              <BadgeCheck className="h-3.5 w-3.5" /> {bridgeReady ? "Ядро готово" : "Инициализация"}
            </span>
            <span>
              SIMD: <span className="font-semibold text-text">{kernelCapabilities.simd ? "доступен" : "нет"}</span>
            </span>
            <span>
              Lane width: <span className="font-semibold text-text">{kernelCapabilities.laneWidth}</span>
            </span>
          </div>
        }
      >
        <p>
          KolibriScript выполняется в браузере. При сбоях интерфейс переключится на деградационный режим, поэтому проверяйте,
          что WebAssembly загружен и доступен.
        </p>
        {!bridgeReady ? (
          <p className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
            Ядро ещё загружается. Проверьте размер бандла и политику Content-Security-Policy, если инициализация зависла.
          </p>
        ) : null}
      </SectionCard>
    </div>
  );
};

export default ReadinessPanel;
