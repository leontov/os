import {
  AlertTriangle,
  Bug,
  Camera,
  CircleStop,
  Copy,
  Database,
  Download,
  ListTree,
  PlayCircle,
  RadioTower,
  Sparkles,
  Terminal,
  Timer,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { KernelCapabilities } from "../core/kolibri-bridge";
import type { ConversationMetrics } from "../core/useKolibriChat";
import type { InspectorSessionApi } from "../core/useInspectorSession";
import type { KnowledgeStatus } from "../core/knowledge";
import type { ChatMessage } from "../types/chat";

interface InspectorPanelProps {
  status: KnowledgeStatus | null;
  error?: string;
  isLoading: boolean;
  metrics: ConversationMetrics;
  capabilities: KernelCapabilities;
  latestAssistantMessage?: ChatMessage;
  onRefresh?: () => void;
  session: InspectorSessionApi;
}

const formatDateTime = (iso?: string): string => {
  if (!iso) {
    return "—";
  }
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "—";
  }
};

const formatTime = (iso?: string): string => {
  if (!iso) {
    return "—";
  }
  try {
    return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
};

const formatPercent = (value: number): string => `${Math.round(value * 100)}%`;

const StatCard = ({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Database;
  label: string;
  value: string;
}) => (
  <article className="glass-panel flex items-center gap-3 px-4 py-3">
    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-background-card/70 text-primary">
      <Icon className="h-4 w-4" />
    </span>
    <div>
      <p className="text-[0.7rem] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="text-sm font-semibold text-text-primary">{value}</p>
    </div>
  </article>
);

const InspectorPanel = ({
  status,
  error,
  isLoading,
  metrics,
  capabilities,
  latestAssistantMessage,
  onRefresh,
  session,
}: InspectorPanelProps) => {
  const {
    actions,
    consoleLogs,
    recordingState,
    startReplayRecording,
    stopReplayRecording,
    webrtcState,
    createWebRTCOffer,
    acceptWebRTCAnswer,
    closeWebRTC,
    screenshotState,
    captureScreenshot,
    resetScreenshots,
    bugReportStatus,
    generateBugReport,
  } = session;

  const [answerInput, setAnswerInput] = useState("");
  const [copyOfferFeedback, setCopyOfferFeedback] = useState<string | null>(null);
  const [copyScriptFeedback, setCopyScriptFeedback] = useState<string | null>(null);

  const context = latestAssistantMessage?.context;
  const laneWidth = Math.max(1, Math.floor(capabilities.laneWidth));
  const laneWidthLabel = laneWidth > 1 ? `${laneWidth}×` : "1× (скалярный)";
  const kernelMetrics: Array<{ label: string; value: string }> = [
    { label: "Conserved B/D", value: formatPercent(metrics.conservedRatio) },
    { label: "Stability@5", value: formatPercent(metrics.stability) },
    { label: "Auditability", value: formatPercent(metrics.auditability) },
    { label: "Return-to-Attractor", value: formatPercent(metrics.returnToAttractor) },
    { label: "Latency P50", value: `${metrics.latencyP50.toFixed(0)} мс` },
    { label: "WASM SIMD", value: capabilities.simd ? "активно" : "скалярный режим" },
    { label: "SIMD Lanes", value: laneWidthLabel },
  ];

  const latestActions = useMemo(() => actions.slice(-6).reverse(), [actions]);
  const latestLogs = useMemo(() => consoleLogs.slice(-4).reverse(), [consoleLogs]);

  const recordingStatusLabel = useMemo(() => {
    switch (recordingState.status) {
      case "preparing":
        return "подготовка";
      case "recording":
        return "идёт запись";
      case "ready":
        return "готово";
      case "error":
        return recordingState.error ?? "ошибка";
      default:
        return "ожидание";
    }
  }, [recordingState.error, recordingState.status]);

  const handleCopyOffer = useCallback(async () => {
    if (!webrtcState.offerSdp || typeof navigator === "undefined" || !navigator.clipboard) {
      setCopyOfferFeedback("Копирование недоступно");
      return;
    }
    try {
      await navigator.clipboard.writeText(webrtcState.offerSdp);
      setCopyOfferFeedback("SDP предложение скопировано");
    } catch (copyError) {
      console.warn("[inspector] Не удалось скопировать SDP", copyError);
      setCopyOfferFeedback("Не удалось скопировать");
    }
  }, [webrtcState.offerSdp]);

  const handleCopyReproduction = useCallback(async () => {
    if (!bugReportStatus.reproductionScript || typeof navigator === "undefined" || !navigator.clipboard) {
      setCopyScriptFeedback("Буфер обмена недоступен");
      return;
    }
    try {
      await navigator.clipboard.writeText(bugReportStatus.reproductionScript);
      setCopyScriptFeedback("Сценарий скопирован");
    } catch (copyError) {
      console.warn("[inspector] Не удалось скопировать сценарий", copyError);
      setCopyScriptFeedback("Не удалось скопировать");
    }
  }, [bugReportStatus.reproductionScript]);

  const resetCopyFeedback = useCallback(() => {
    setTimeout(() => {
      setCopyOfferFeedback(null);
      setCopyScriptFeedback(null);
    }, 1800);
  }, []);

  const handleAcceptAnswer = useCallback(async () => {
    if (!answerInput.trim()) {
      setCopyOfferFeedback("Введите SDP ответа");
      resetCopyFeedback();
      return;
    }
    await acceptWebRTCAnswer(answerInput.trim());
  }, [acceptWebRTCAnswer, answerInput, resetCopyFeedback]);

  const handleGenerateReport = useCallback(async () => {
    try {
      await generateBugReport();
    } catch (reportError) {
      console.warn("[inspector] Ошибка генерации отчёта", reportError);
    }
  }, [generateBugReport]);

  return (
    <section className="glass-panel flex h-full flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-text-secondary">Мониторинг</p>
          <h2 className="mt-2 text-lg font-semibold text-text-primary">Пульс Колибри</h2>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="rounded-xl border border-border-strong bg-background-input/70 px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Обновить
          </button>
        )}
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard icon={Database} label="Документов в геноме" value={status ? String(status.documents) : "—"} />
        <StatCard icon={Sparkles} label="Ответов с контекстом" value={String(metrics.knowledgeReferences)} />
        <StatCard icon={ListTree} label="Сообщений в беседе" value={String(metrics.userMessages + metrics.assistantMessages)} />
        <StatCard icon={Timer} label="Последний ответ" value={formatDateTime(metrics.lastUpdatedIso)} />
      </div>

      <section className="space-y-3">
        <h3 className="text-xs uppercase tracking-[0.35em] text-text-secondary">Запись сессии и Replay</h3>
        <article className="glass-panel space-y-3 p-4 text-xs text-text-secondary">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Статус записи: <span className="font-semibold text-text-primary">{recordingStatusLabel}</span>
            </span>
            {recordingState.startedAtIso ? <span>Начато: {formatDateTime(recordingState.startedAtIso)}</span> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void startReplayRecording();
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:text-text"
              disabled={recordingState.status === "recording" || recordingState.status === "preparing"}
            >
              <PlayCircle className="h-4 w-4" />
              Записать экран
            </button>
            <button
              type="button"
              onClick={stopReplayRecording}
              className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
              disabled={recordingState.status !== "recording"}
            >
              <CircleStop className="h-4 w-4" />
              Остановить
            </button>
            {recordingState.status === "ready" && recordingState.downloadUrl ? (
              <a
                href={recordingState.downloadUrl}
                download="kolibri-replay.webm"
                className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:text-text"
              >
                <Download className="h-4 w-4" />
                Скачать запись
              </a>
            ) : null}
          </div>
          {recordingState.status === "error" && recordingState.error ? (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-red-200">{recordingState.error}</p>
          ) : null}
        </article>

        <article className="glass-panel space-y-3 p-4 text-xs text-text-secondary">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-[0.7rem] uppercase tracking-[0.3em] text-text-secondary">WebRTC SDP</h4>
            <button
              type="button"
              onClick={() => {
                void createWebRTCOffer();
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:text-text"
              disabled={webrtcState.status === "creating-offer"}
            >
              <RadioTower className="h-4 w-4" />
              Сформировать SDP
            </button>
          </div>
          <textarea
            value={webrtcState.offerSdp ?? ""}
            readOnly
            className="soft-scroll h-24 w-full resize-none rounded-lg border border-border/60 bg-background-input/70 p-2 font-mono text-[0.65rem] text-text-secondary"
            placeholder="SDP предложение появится после генерации"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void handleCopyOffer();
                resetCopyFeedback();
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!webrtcState.offerSdp}
            >
              <Copy className="h-4 w-4" />
              Копировать предложение
            </button>
            <button
              type="button"
              onClick={closeWebRTC}
              className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
              disabled={webrtcState.status === "idle"}
            >
              <CircleStop className="h-4 w-4" />
              Сбросить соединение
            </button>
          </div>
          <textarea
            value={answerInput}
            onChange={(event) => setAnswerInput(event.target.value)}
            className="soft-scroll h-24 w-full resize-none rounded-lg border border-border/60 bg-background-input/70 p-2 font-mono text-[0.65rem] text-text-secondary"
            placeholder="Вставьте SDP ответа для завершения WebRTC"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void handleAcceptAnswer();
                resetCopyFeedback();
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:text-text"
            >
              <PlayCircle className="h-4 w-4" />
              Подтвердить ответ
            </button>
            {copyOfferFeedback ? <span className="text-xs text-text-secondary">{copyOfferFeedback}</span> : null}
          </div>
          {webrtcState.error ? (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-red-200">{webrtcState.error}</p>
          ) : null}
        </article>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs uppercase tracking-[0.35em] text-text-secondary">Скриншоты интерфейса</h3>
        <article className="glass-panel space-y-4 p-4 text-xs text-text-secondary">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void captureScreenshot("baseline", "Базовый снимок");
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
              disabled={screenshotState.status === "capturing"}
            >
              <Camera className="h-4 w-4" />
              Базовый
            </button>
            <button
              type="button"
              onClick={() => {
                void captureScreenshot("comparison", "Сравнение");
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
              disabled={screenshotState.status === "capturing"}
            >
              <Camera className="h-4 w-4" />
              Сравнение
            </button>
            <button
              type="button"
              onClick={resetScreenshots}
              className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:text-text"
            >
              <CircleStop className="h-4 w-4" />
              Сбросить
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <figure className="space-y-2">
              <figcaption className="text-[0.65rem] uppercase tracking-[0.3em] text-text-secondary">Базовый</figcaption>
              {screenshotState.baseline ? (
                <img
                  src={screenshotState.baseline.dataUrl}
                  alt="Базовый скриншот"
                  className="max-h-48 w-full rounded-xl border border-border/60 object-cover"
                />
              ) : (
                <p className="rounded-xl border border-dashed border-border/60 p-4 text-center">Ещё не снят.</p>
              )}
            </figure>
            <figure className="space-y-2">
              <figcaption className="text-[0.65rem] uppercase tracking-[0.3em] text-text-secondary">Сравнение</figcaption>
              {screenshotState.comparison ? (
                <img
                  src={screenshotState.comparison.dataUrl}
                  alt="Скриншот для сравнения"
                  className="max-h-48 w-full rounded-xl border border-border/60 object-cover"
                />
              ) : (
                <p className="rounded-xl border border-dashed border-border/60 p-4 text-center">Сделайте снимок для сравнения.</p>
              )}
            </figure>
          </div>
          <p className="text-xs text-text-secondary">
            Различия: {screenshotState.diffPercentage != null ? `${screenshotState.diffPercentage}%` : "недоступно"}
          </p>
          {screenshotState.error ? (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-red-200">{screenshotState.error}</p>
          ) : null}
        </article>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs uppercase tracking-[0.35em] text-text-secondary">Bug Report</h3>
        <article className="glass-panel space-y-4 p-4 text-xs text-text-secondary">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void handleGenerateReport();
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
              disabled={bugReportStatus.isGenerating}
            >
              <Bug className="h-4 w-4" />
              Сформировать отчёт
            </button>
            {bugReportStatus.downloadUrl ? (
              <a
                href={bugReportStatus.downloadUrl}
                download={bugReportStatus.filename ?? "kolibri-bug-report.json"}
                className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:text-text"
              >
                <Download className="h-4 w-4" />
                Скачать JSON
              </a>
            ) : null}
            {bugReportStatus.reproductionScript ? (
              <button
                type="button"
                onClick={() => {
                  void handleCopyReproduction();
                  resetCopyFeedback();
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:text-text"
              >
                <Copy className="h-4 w-4" />
                Скопировать сценарий
              </button>
            ) : null}
            {copyScriptFeedback ? <span className="text-xs text-text-secondary">{copyScriptFeedback}</span> : null}
          </div>
          {bugReportStatus.summary ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              <li>Действий: {bugReportStatus.summary.actionCount}</li>
              <li>Сообщений: {bugReportStatus.summary.messageCount}</li>
              <li>Есть запись: {bugReportStatus.summary.hasRecording ? "да" : "нет"}</li>
              <li>
                Различия UI: {bugReportStatus.summary.screenshotDiff != null ? `${bugReportStatus.summary.screenshotDiff}%` : "—"}
              </li>
            </ul>
          ) : (
            <p>Сформируйте отчёт, чтобы получить сводку и сценарий воспроизведения.</p>
          )}
          {bugReportStatus.reproductionScript ? (
            <pre className="soft-scroll max-h-32 whitespace-pre-wrap rounded-xl border border-border/60 bg-background-input/70 p-3 font-mono text-[0.65rem]">
              {bugReportStatus.reproductionScript}
            </pre>
          ) : null}
          {bugReportStatus.error ? (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-red-200">{bugReportStatus.error}</p>
          ) : null}
        </article>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs uppercase tracking-[0.35em] text-text-secondary">Журнал действий</h3>
        <article className="glass-panel space-y-2 p-4 text-xs text-text-secondary">
          {latestActions.length ? (
            <ul className="space-y-2">
              {latestActions.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-text-primary">{item.summary}</p>
                    <p className="text-[0.65rem] text-text-secondary/80">{item.type}</p>
                  </div>
                  <span className="text-[0.65rem] text-text-secondary/70">{formatTime(item.timestampIso)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Действия ещё не зафиксированы.</p>
          )}
        </article>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs uppercase tracking-[0.35em] text-text-secondary">Консоль</h3>
        <article className="glass-panel space-y-2 p-4 text-xs text-text-secondary">
          {latestLogs.length ? (
            <ul className="space-y-2">
              {latestLogs.map((log) => (
                <li key={log.id} className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-text-primary">{log.message}</p>
                    <p className="inline-flex items-center gap-1 text-[0.65rem] uppercase tracking-[0.3em] text-text-secondary/80">
                      <Terminal className="h-3 w-3" />
                      {log.level}
                    </p>
                  </div>
                  <span className="text-[0.65rem] text-text-secondary/70">{formatTime(log.timestampIso)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Логи консоли отсутствуют.</p>
          )}
        </article>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs uppercase tracking-[0.35em] text-text-secondary">Контекст последнего ответа</h3>
        {context && context.length ? (
          <div className="space-y-3">
            {context.map((snippet, index) => (
              <article key={snippet.id} className="glass-panel p-3">
                <p className="flex items-center justify-between text-[0.7rem] font-semibold text-text-secondary">
                  <span className="uppercase tracking-wide text-text-primary">Источник {index + 1}</span>
                  <span>Релевантность: {snippet.score.toFixed(2)}</span>
                </p>
                <p className="mt-2 text-sm font-semibold text-text-primary">{snippet.title}</p>
                <p className="mt-2 whitespace-pre-line text-sm text-text-secondary">{snippet.content}</p>
                {snippet.source ? (
                  <p className="mt-2 text-[0.65rem] uppercase tracking-wide text-primary/80">{snippet.source}</p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-border-strong/70 px-3 py-4 text-xs text-text-secondary">
            Колибри ещё не использовал внешние знания в этой беседе.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-xs uppercase tracking-[0.35em] text-text-secondary">Метрики ядра</h3>
        <div className="overflow-hidden rounded-2xl border border-border-strong/70 bg-background-input/80">
          <table className="w-full border-collapse text-[0.7rem] text-text-secondary">
            <tbody>
              {kernelMetrics.map((entry) => (
                <tr key={entry.label} className="border-b border-border-strong/60 last:border-b-0">
                  <th scope="row" className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-text-secondary">
                    {entry.label}
                  </th>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-text-primary">{entry.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-auto space-y-3">
        <h3 className="text-xs uppercase tracking-[0.35em] text-text-secondary">Диагностика</h3>
        <article className="glass-panel p-3 text-xs text-text-secondary">
          <p>
            Статус сервиса: <span className="font-semibold text-text-primary">{status ? status.status : "unknown"}</span>
          </p>
          {status?.timestamp ? <p className="mt-1">Снимок от: {formatDateTime(status.timestamp)}</p> : null}
        </article>
        {error ? (
          <p className="flex items-start gap-2 rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
};

export default InspectorPanel;
