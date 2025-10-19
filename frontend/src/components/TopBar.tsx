import { CheckCircle2, CircleDashed, Globe2, History, MessageSquare, RefreshCcw, Sparkles } from "lucide-react";
import { useId } from "react";
import type { ConversationMetrics } from "../core/useKolibriChat";
import type { KnowledgeStatus } from "../core/knowledge";

interface TopBarProps {
  title: string;
  onTitleChange: (value: string) => void;
  isProcessing: boolean;
  bridgeReady: boolean;
  knowledgeStatus: KnowledgeStatus | null;
  metrics: ConversationMetrics;
  onRefreshKnowledge: () => void;
  isKnowledgeLoading: boolean;
  showMobileActions?: boolean;
  onOpenHistory?: () => void;
  onOpenControls?: () => void;
  onlineAllowed: boolean;
}

const formatIsoTime = (iso?: string): string => {
  if (!iso) {
    return "—";
  }
  try {
    return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
};

const StatusBadge = ({ icon: Icon, label, value }: { icon: typeof MessageSquare; label: string; value: string }) => (
  <div className="glass-panel flex items-center gap-2 px-4 py-2">
    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary">
      <Icon className="h-4 w-4" />
    </span>
    <div className="flex flex-col text-left">
      <span className="text-[0.65rem] uppercase tracking-wide text-text-secondary">{label}</span>
      <span className="text-sm font-semibold text-text-primary">{value}</span>
    </div>
  </div>
);

const TopBar = ({
  title,
  onTitleChange,
  isProcessing,
  bridgeReady,
  knowledgeStatus,
  metrics,
  onRefreshKnowledge,
  isKnowledgeLoading,
  showMobileActions,
  onOpenHistory,
  onOpenControls,
  onlineAllowed,
}: TopBarProps) => {
  const inputId = useId();

  const connectionBadge = bridgeReady
    ? { icon: CheckCircle2, label: "Статус ядра", value: "Подключено" }
    : { icon: CircleDashed, label: "Статус ядра", value: "Ожидание" };

  const knowledgeBadge = {
    icon: Sparkles,
    label: "Документов",
    value: knowledgeStatus ? `${knowledgeStatus.documents}` : "—",
  };

  const onlineBadge = {
    icon: Globe2,
    label: "Режим",
    value: onlineAllowed ? "ONLINE" : "OFFLINE",
  };

  const activityBadge = {
    icon: MessageSquare,
    label: "Диалог",
    value: `${metrics.userMessages + metrics.assistantMessages} сообщений`,
  };

  return (
    <header className="glass-panel flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.35em] text-text-secondary">
              <span className="pill-badge !tracking-[0.35em]">Текущая беседа</span>
              <span className="hidden lg:inline text-text-secondary/70">Колибри Σ</span>
            </div>
            <input
              id={inputId}
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="Назови беседу"
              className="w-full rounded-2xl border border-border-strong/70 bg-background-input/80 px-4 py-3 text-lg font-semibold text-text-primary shadow-inner focus:border-primary focus:outline-none"
            />
            <p className="text-xs text-text-secondary">
              Последнее обновление: {formatIsoTime(metrics.lastUpdatedIso)}
            </p>
          </div>
          <div className="hidden flex-1 flex-wrap items-center justify-end gap-3 lg:flex">
            <StatusBadge {...connectionBadge} />
            <StatusBadge {...knowledgeBadge} />
            <StatusBadge {...onlineBadge} />
          <StatusBadge {...activityBadge} />
          <button
            type="button"
            onClick={onRefreshKnowledge}
            disabled={isKnowledgeLoading || isProcessing}
            className="ghost-button disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCcw className="h-4 w-4" />
            Обновить память
          </button>
        </div>
        </div>
        <div className="grid gap-3 lg:hidden">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge {...connectionBadge} />
            <StatusBadge {...knowledgeBadge} />
            <StatusBadge {...onlineBadge} />
            <StatusBadge {...activityBadge} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
            <button
              type="button"
              onClick={onRefreshKnowledge}
              disabled={isKnowledgeLoading || isProcessing}
              className="glass-panel flex flex-1 items-center justify-center gap-2 px-3 py-2 font-semibold transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw className="h-4 w-4" />
              Обновить память
            </button>
            {showMobileActions ? (
              <>
                <button
                  type="button"
                  onClick={() => onOpenHistory?.()}
                  className="glass-panel flex items-center gap-2 px-3 py-2 font-semibold transition-colors hover:text-text-primary"
                >
                  <History className="h-4 w-4" />
                  История
                </button>
                <button
                  type="button"
                  onClick={() => onOpenControls?.()}
                  className="glass-panel flex items-center gap-2 px-3 py-2 font-semibold transition-colors hover:text-text-primary"
                >
                  <Sparkles className="h-4 w-4" />
                  Настройки
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
