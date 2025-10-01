import { useEffect, useMemo, useState } from "react";
import { Activity, GaugeCircle, RefreshCcw, TrendingUp } from "lucide-react";
import type {
  MetricsResponse,
  NormalizedMetrics,
  RawMetricsEntry,
} from "../types/metrics";

const POLL_INTERVAL_MS = 5000;

const numberFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
});

const decimalFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
});

const normalizeEntry = (entry: RawMetricsEntry, draft: NormalizedMetrics) => {
  const key = entry.key ?? entry.name ?? entry.label;
  if (!key) {
    return;
  }

  const normalizedKey = key.toString().toLowerCase();
  const value = typeof entry.value === "number" ? entry.value : Number(entry.value);
  if (Number.isNaN(value)) {
    return;
  }

  if (normalizedKey.includes("latency")) {
    draft.latencyMs = value;
  }

  if (normalizedKey.includes("success") && normalizedKey.includes("rate")) {
    draft.successRate = value > 1 ? value / 100 : value;
  }

  if (normalizedKey.includes("success") && !normalizedKey.includes("rate")) {
    draft.successCount = value;
  }

  if (normalizedKey.includes("total")) {
    draft.totalRequests = value;
  }
};

const normalizeMetrics = (payload: MetricsResponse | null | undefined): NormalizedMetrics => {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const draft: NormalizedMetrics = {};

  if (typeof payload.latency_ms === "number") {
    draft.latencyMs = payload.latency_ms;
  } else if (typeof payload.latency === "number") {
    draft.latencyMs = payload.latency;
  } else if (typeof payload.latencyMs === "number") {
    draft.latencyMs = payload.latencyMs;
  }

  const successRateCandidates = [
    payload.success_rate,
    payload.successRate,
    payload.success_ratio,
  ].find((value) => typeof value === "number");

  if (typeof successRateCandidates === "number") {
    draft.successRate = successRateCandidates > 1 ? successRateCandidates / 100 : successRateCandidates;
  }

  const successCountCandidates = [
    payload.success_count,
    payload.successCount,
    payload.successes,
  ].find((value) => typeof value === "number");

  if (typeof successCountCandidates === "number") {
    draft.successCount = successCountCandidates;
  }

  const totalRequestsCandidates = [
    payload.total_requests,
    payload.totalRequests,
  ].find((value) => typeof value === "number");

  if (typeof totalRequestsCandidates === "number") {
    draft.totalRequests = totalRequestsCandidates;
  }

  const timestampCandidate =
    (typeof payload.timestamp === "string" && payload.timestamp) ||
    (typeof payload.updated_at === "string" && payload.updated_at) ||
    (typeof payload.updatedAt === "string" && payload.updatedAt);

  if (timestampCandidate) {
    draft.lastUpdated = timestampCandidate;
  }

  if (Array.isArray(payload.metrics)) {
    payload.metrics.forEach((entry) => normalizeEntry(entry, draft));
  }

  return draft;
};

const getDisplayRate = (value: number | undefined) => {
  if (typeof value !== "number") {
    return "--";
  }
  const percent = value <= 1 ? value * 100 : value;
  return `${decimalFormatter.format(percent)}%`;
};

const getDisplayLatency = (value: number | undefined) => {
  if (typeof value !== "number") {
    return "--";
  }
  if (value >= 1000) {
    return `${decimalFormatter.format(value / 1000)} с`;
  }
  return `${decimalFormatter.format(value)} мс`;
};

const getSuccessSummary = (metrics: NormalizedMetrics) => {
  const { successCount, totalRequests } = metrics;
  if (typeof successCount === "number" && typeof totalRequests === "number") {
    const failures = Math.max(totalRequests - successCount, 0);
    return `${numberFormatter.format(successCount)} / ${numberFormatter.format(totalRequests)} (ошибок: ${numberFormatter.format(failures)})`;
  }

  if (typeof successCount === "number") {
    return numberFormatter.format(successCount);
  }

  if (typeof totalRequests === "number") {
    return `${numberFormatter.format(totalRequests)} запросов`;
  }

  return "Нет данных";
};

const MetricsPanel = () => {
  const [metrics, setMetrics] = useState<NormalizedMetrics>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchMetrics = async () => {
      try {
        const response = await fetch("/metrics");
        if (!response.ok) {
          throw new Error(`Запрос завершился с кодом ${response.status}`);
        }
        const data = (await response.json()) as MetricsResponse;
        if (cancelled) {
          return;
        }
        const normalized = normalizeMetrics(data);
        setMetrics(normalized);
        setLastRefresh(new Date().toISOString());
        setError(null);
      } catch (fetchError) {
        if (cancelled) {
          return;
        }
        const message =
          fetchError instanceof Error
            ? fetchError.message
            : "Не удалось загрузить метрики.";
        setError(message);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void fetchMetrics();
    const intervalId = window.setInterval(() => {
      void fetchMetrics();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const lastUpdatedLabel = useMemo(() => {
    const source = metrics.lastUpdated ?? lastRefresh;
    if (!source) {
      return null;
    }

    const date = new Date(source);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(date);
  }, [lastRefresh, metrics.lastUpdated]);

  const rateLabel = getDisplayRate(metrics.successRate);
  const latencyLabel = getDisplayLatency(metrics.latencyMs);
  const successSummary = getSuccessSummary(metrics);

  return (
    <div className="flex h-full flex-col gap-4 rounded-3xl bg-white p-6 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-dark">Метрики модели</h2>
          <p className="text-sm text-text-light">
            Отслеживайте задержку и успешность симуляции Kolibri.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <RefreshCcw className="h-3.5 w-3.5" />
          {isLoading ? "Загрузка" : "Обновлено"}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">Не удалось получить метрики.</p>
          <p className="mt-1 text-xs text-red-600">{error}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl bg-background-light/60 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <GaugeCircle className="h-10 w-10 rounded-full bg-white p-2 text-primary shadow-card" />
                <div>
                  <p className="text-sm text-text-light">Средняя задержка</p>
                  <p className="text-xl font-semibold text-text-dark">{latencyLabel}</p>
                </div>
              </div>
              <Activity className="h-6 w-6 text-text-light/70" />
            </div>
          </div>

          <div className="rounded-2xl bg-background-light/60 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-10 w-10 rounded-full bg-white p-2 text-green-500 shadow-card" />
                <div>
                  <p className="text-sm text-text-light">Успешные ответы</p>
                  <p className="text-xl font-semibold text-text-dark">{rateLabel}</p>
                  <p className="text-xs text-text-light/80">{successSummary}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-auto rounded-2xl bg-background-sidebar/40 p-4 text-xs text-text-light">
        <p>Панель обновляется каждые {POLL_INTERVAL_MS / 1000} секунд.</p>
        {lastUpdatedLabel ? (
          <p className="mt-1">Последнее обновление: {lastUpdatedLabel}</p>
        ) : null}
      </div>
    </div>
  );
};

export default MetricsPanel;
