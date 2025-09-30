import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  buildFitnessSeries,
  buildMutationSeries,
  summarizeBrainMetrics,
  type BrainMetricMetadata,
  type BrainMetricRecord,
} from "./brain-analytics-transforms";

const METRICS_ENDPOINT = "/api/soak/metrics";
const EXPORT_ENDPOINT = "/api/soak/metrics/export?format=csv";

interface BrainMetricResponse {
  records?: unknown;
  metadata?: BrainMetricMetadata | null;
}

const MOCK_METRICS: BrainMetricRecord[] = [
  { minute: 0, formula: "f(x)=0.21x+1", fitness: 0.42, genome: 120, mutationCount: 2 },
  { minute: 1, formula: "f(x)=0.24x+1", fitness: 0.47, genome: 123, mutationCount: 3 },
  { minute: 2, formula: "f(x)=0.27x+1", fitness: 0.52, genome: 127, mutationCount: 4 },
  { minute: 3, formula: "f(x)=0.31x+1", fitness: 0.58, genome: 132, mutationCount: 5 },
  { minute: 4, formula: "f(x)=0.35x+1", fitness: 0.63, genome: 138, mutationCount: 6 },
  { minute: 5, formula: "f(x)=0.38x+1", fitness: 0.66, genome: 142, mutationCount: 4 },
  { minute: 6, formula: "f(x)=0.41x+1", fitness: 0.69, genome: 147, mutationCount: 5 },
  { minute: 7, formula: "f(x)=0.44x+1", fitness: 0.71, genome: 151, mutationCount: 3 },
  { minute: 8, formula: "f(x)=0.48x+1", fitness: 0.73, genome: 156, mutationCount: 4 },
  { minute: 9, formula: "f(x)=0.51x+1", fitness: 0.76, genome: 160, mutationCount: 4 },
  { minute: 10, formula: "f(x)=0.55x+1", fitness: 0.78, genome: 165, mutationCount: 5 },
  { minute: 11, formula: "f(x)=0.58x+1", fitness: 0.8, genome: 170, mutationCount: 6 },
];

const MOCK_METADATA: BrainMetricMetadata = {
  source: "demo",
  windowMinutes: MOCK_METRICS.length,
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeMetadata(metadata?: BrainMetricMetadata | null): BrainMetricMetadata | null {
  if (!metadata) {
    return null;
  }

  const sanitized: BrainMetricMetadata = {};

  if (typeof metadata.source === "string" && metadata.source.trim()) {
    sanitized.source = metadata.source.trim();
  }

  if (typeof metadata.generatedAt === "string" && metadata.generatedAt.trim()) {
    sanitized.generatedAt = metadata.generatedAt;
  }

  if (isFiniteNumber(metadata.windowMinutes)) {
    sanitized.windowMinutes = metadata.windowMinutes;
  }

  return Object.keys(sanitized).length ? sanitized : null;
}

function normalizeRecords(records: unknown): BrainMetricRecord[] {
  if (!Array.isArray(records)) {
    return [];
  }

  const normalized: BrainMetricRecord[] = [];

  for (const raw of records) {
    if (!raw || typeof raw !== "object") {
      continue;
    }

    const minuteValue = Number((raw as Record<string, unknown>).minute);
    const fitnessValue = Number((raw as Record<string, unknown>).fitness);
    const genomeValue = Number((raw as Record<string, unknown>).genome);
    const formulaValue = (raw as Record<string, unknown>).formula;
    const mutationValue = (raw as Record<string, unknown>).mutationCount;

    if (!Number.isFinite(minuteValue) || !Number.isFinite(fitnessValue) || !Number.isFinite(genomeValue)) {
      continue;
    }

    const record: BrainMetricRecord = {
      minute: minuteValue,
      fitness: fitnessValue,
      genome: genomeValue,
      formula: typeof formulaValue === "string" ? formulaValue : `formula-${minuteValue}`,
    };

    if (typeof mutationValue === "number" && Number.isFinite(mutationValue)) {
      record.mutationCount = mutationValue;
    }

    normalized.push(record);
  }

  return normalized.sort((a, b) => a.minute - b.minute);
}

const BrainAnalytics = () => {
  const [records, setRecords] = useState<BrainMetricRecord[]>(MOCK_METRICS);
  const [metadata, setMetadata] = useState<BrainMetricMetadata | null>(MOCK_METADATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMockData, setIsMockData] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const hasRealDataRef = useRef(false);

  const loadMetrics = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);

      try {
        const response = await fetch(METRICS_ENDPOINT, { signal });

        if (!response.ok) {
          throw new Error(`Сервер вернул ${response.status}`);
        }

        const payload = (await response.json()) as BrainMetricResponse;

        if (signal?.aborted) {
          return;
        }

        const normalized = normalizeRecords(payload.records);

        if (normalized.length) {
          setRecords(normalized);
          const sanitizedMetadata = sanitizeMetadata(payload.metadata);
          setMetadata(
            sanitizedMetadata ?? {
              windowMinutes: normalized.length,
              generatedAt: new Date().toISOString(),
            }
          );
          setIsMockData(false);
          hasRealDataRef.current = true;
        } else if (!hasRealDataRef.current) {
          setRecords(MOCK_METRICS);
          setMetadata(MOCK_METADATA);
          setIsMockData(true);
        }

        setError(null);
      } catch (caughtError) {
        if (signal?.aborted) {
          return;
        }

        const message =
          caughtError instanceof Error
            ? `Не удалось загрузить метрики: ${caughtError.message}`
            : "Не удалось загрузить метрики.";

        setError(message);

        if (!hasRealDataRef.current) {
          setRecords(MOCK_METRICS);
          setMetadata(MOCK_METADATA);
          setIsMockData(true);
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadMetrics(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadMetrics, refreshToken]);

  const handleRefresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  const handleExport = useCallback(async () => {
    if (typeof window === "undefined") {
      setError("Экспорт доступен только в браузере.");
      return;
    }

    setIsExporting(true);

    try {
      const response = await fetch(EXPORT_ENDPOINT, {
        headers: { Accept: "text/csv" },
      });

      if (!response.ok) {
        throw new Error(`Сервер вернул ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const fileNameBase = metadata?.source ? metadata.source.replace(/[^a-z0-9_-]+/gi, "-") : "brain-metrics";

      link.href = url;
      link.download = `${fileNameBase}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setError(null);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? `Не удалось экспортировать метрики: ${caughtError.message}`
          : "Не удалось экспортировать метрики.";
      setError(message);
    } finally {
      setIsExporting(false);
    }
  }, [metadata]);

  const fitnessSeries = useMemo(() => buildFitnessSeries(records, 5), [records]);
  const mutationSeries = useMemo(() => buildMutationSeries(records), [records]);
  const summary = useMemo(() => summarizeBrainMetrics(records), [records]);

  const formattedGeneratedAt = useMemo(() => {
    if (!metadata?.generatedAt) {
      return null;
    }

    const parsed = new Date(metadata.generatedAt);

    if (Number.isNaN(parsed.getTime())) {
      return metadata.generatedAt;
    }

    return new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    }).format(parsed);
  }, [metadata]);

  const summaryCards = useMemo(
    () => [
      {
        label: "Последний fitness",
        value: summary.latestFitness === null ? "—" : summary.latestFitness.toFixed(3),
        hint: "значение лучшей формулы на последней минуте",
      },
      {
        label: "Пиковый fitness",
        value: summary.peakFitness === null ? "—" : summary.peakFitness.toFixed(3),
        hint: "максимум за выбранное окно",
      },
      {
        label: "Мутации / мин",
        value: summary.mutationRate === null ? "—" : summary.mutationRate.toFixed(2),
        hint: "среднее число новых генов",
      },
      {
        label: "Всего мутаций",
        value: summary.totalMutations.toLocaleString("ru-RU"),
        hint: "накоплено в пределах окна",
      },
    ],
    [summary]
  );

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold text-text-dark">Аналитика мозга Колибри</h2>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                isMockData ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {isMockData ? "Демо-данные" : "Живые soak-метрики"}
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-text-light">
            Мониторинг динамики fitness и мутаций в пулах формул. Подключите длительные soak-прогоны,
            чтобы увидеть реальные показатели эволюции.
          </p>
          {formattedGeneratedAt && (
            <p className="mt-1 text-xs text-text-light/80">
              Последнее обновление: {formattedGeneratedAt}
              {metadata?.source ? ` · источник: ${metadata.source}` : ""}
            </p>
          )}
          {!formattedGeneratedAt && metadata?.source && (
            <p className="mt-1 text-xs text-text-light/80">Источник данных: {metadata.source}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-full border border-primary px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Обновляем…" : "Обновить"}
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isExporting}
          >
            {isExporting ? "Формируем CSV…" : "Экспорт CSV"}
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-2xl bg-white/90 p-5 shadow-card">
            <p className="text-sm font-medium text-text-light">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-text-dark">{card.value}</p>
            <p className="mt-1 text-xs text-text-light/80">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-3xl bg-white/90 p-6 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-text-dark">Динамика fitness</h3>
            {metadata?.windowMinutes && (
              <span className="text-xs text-text-light">Окно: {metadata.windowMinutes} мин</span>
            )}
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <LineChart data={fitnessSeries} margin={{ left: 12, right: 12, top: 12, bottom: 12 }}>
                <CartesianGrid strokeDasharray="4 8" stroke="#E5E7EB" />
                <XAxis dataKey="minute" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                <YAxis stroke="#9CA3AF" tick={{ fontSize: 12 }} domain={[0, 1]} />
                <Tooltip
                  formatter={(value: number) => value.toFixed(3)}
                  labelFormatter={(value) => `Минута ${value}`}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="fitness"
                  name="Мгновенный fitness"
                  stroke="#6366F1"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="rollingAverage"
                  name="Скользящая средняя"
                  stroke="#F97316"
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="6 4"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl bg-white/90 p-6 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-text-dark">Пульс мутаций</h3>
            <span className="text-xs text-text-light">Учитываются только положительные изменения генома</span>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <BarChart data={mutationSeries} margin={{ left: 12, right: 12, top: 12, bottom: 12 }}>
                <CartesianGrid strokeDasharray="4 8" stroke="#E5E7EB" />
                <XAxis dataKey="minute" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                <YAxis stroke="#9CA3AF" tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  formatter={(value: number) => `${value.toFixed(0)} мутаций`}
                  labelFormatter={(value) => `Минута ${value}`}
                />
                <Legend />
                <Bar dataKey="mutations" name="Новые мутации" fill="#22C55E" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-3xl bg-white/90 p-6 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-dark">Рост генома</h3>
          <span className="text-xs text-text-light">Размер пула формул по минутам</span>
        </div>
        <div className="h-80 w-full">
          <ResponsiveContainer>
            <AreaChart data={mutationSeries} margin={{ left: 12, right: 12, top: 12, bottom: 12 }}>
              <defs>
                <linearGradient id="genomeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 8" stroke="#E5E7EB" />
              <XAxis dataKey="minute" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
              <YAxis stroke="#9CA3AF" tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: number) => value.toFixed(0)}
                labelFormatter={(value) => `Минута ${value}`}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="genome"
                name="Размер генома"
                stroke="#0EA5E9"
                strokeWidth={2}
                fill="url(#genomeGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
};

export default BrainAnalytics;
