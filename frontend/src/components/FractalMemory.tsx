import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type CanvasLayer = number[];

type CanvasProvider = {
  poluchit_canvas: (glubina?: number) => unknown;
};

declare global {
  interface Window {
    KolibriSim?: CanvasProvider;
  }
}

const LAYER_WIDTH = 10;

const digitStyleMap = [
  "bg-cyan-50 text-cyan-900 border-cyan-100",
  "bg-teal-50 text-teal-900 border-teal-100",
  "bg-emerald-50 text-emerald-900 border-emerald-100",
  "bg-green-50 text-green-900 border-green-100",
  "bg-lime-50 text-lime-900 border-lime-100",
  "bg-yellow-50 text-yellow-900 border-yellow-100",
  "bg-amber-50 text-amber-900 border-amber-100",
  "bg-orange-50 text-orange-900 border-orange-100",
  "bg-rose-50 text-rose-900 border-rose-100",
  "bg-purple-50 text-purple-900 border-purple-100",
] as const;

type CanvasStatus = "waiting" | "loading" | "ready" | "missing" | "error";

interface FractalMemoryProps {
  depth?: number;
  isReady?: boolean;
  refreshToken?: number;
  className?: string;
}

function normaliseDigit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  const truncated = Math.trunc(value);
  const absolute = Math.abs(truncated);
  return absolute % 10;
}

function normaliseCanvas(canvas: unknown): CanvasLayer[] {
  if (!Array.isArray(canvas)) {
    return [];
  }

  return canvas
    .map((layer) => {
      if (!Array.isArray(layer)) {
        return [];
      }

      const digits = layer.slice(0, LAYER_WIDTH).map((digit) => normaliseDigit(digit));

      if (digits.length === 0) {
        return [];
      }

      return digits;
    })
    .filter((layer) => layer.length > 0);
}

function resolveProvider(): CanvasProvider | null {
  if (typeof window === "undefined") {
    return null;
  }

  const provider = window.KolibriSim;
  if (!provider || typeof provider.poluchit_canvas !== "function") {
    return null;
  }

  return provider;
}

const FractalMemory = ({
  depth = 3,
  isReady = true,
  refreshToken = 0,
  className,
}: FractalMemoryProps) => {
  const [layers, setLayers] = useState<CanvasLayer[]>([]);
  const [status, setStatus] = useState<CanvasStatus>(isReady ? "loading" : "waiting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);

  const refresh = useCallback(() => {
    setLocalRefresh((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!isReady) {
      setStatus("waiting");
      return;
    }

    setStatus("loading");
    setErrorMessage(null);

    const provider = resolveProvider();

    if (!provider) {
      setLayers([]);
      setStatus("missing");
      return;
    }

    try {
      const rawCanvas = provider.poluchit_canvas(depth);
      const normalisedLayers = normaliseCanvas(rawCanvas);
      setLayers(normalisedLayers);
      setStatus("ready");
    } catch (error) {
      setLayers([]);
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }, [depth, isReady, refreshToken, localRefresh]);

  const rootClassName = useMemo(() => {
    const classes = ["rounded-3xl bg-white/80 p-6 shadow-card", className];
    return classes.filter(Boolean).join(" ");
  }, [className]);

  const body = useMemo(() => {
    if (status === "waiting") {
      return (
        <div className="rounded-2xl bg-background-light/60 px-4 py-6 text-sm text-text-light">
          Kolibri ядро ещё инициализируется. Фрактальная память появится сразу после запуска.
        </div>
      );
    }

    if (status === "loading") {
      return (
        <div className="rounded-2xl bg-background-light/60 px-4 py-6 text-sm text-text-light">
          Загружаем слои фрактальной памяти...
        </div>
      );
    }

    if (status === "missing") {
      return (
        <div className="rounded-2xl bg-accent-coral/10 px-4 py-6 text-sm text-accent-coral">
          KolibriSim недоступен: функция poluchit_canvas не найдена.
        </div>
      );
    }

    if (status === "error") {
      return (
        <div className="rounded-2xl bg-accent-coral/10 px-4 py-6 text-sm text-accent-coral">
          Не удалось получить фрактальную память: {errorMessage ?? "неизвестная ошибка"}
        </div>
      );
    }

    if (!layers.length) {
      return (
        <div className="rounded-2xl bg-background-light/60 px-4 py-6 text-sm text-text-light">
          Колибри ещё не накопил достаточно знаний для построения фрактальной памяти. Поговорите с ним в чате — и тут появятся слои.
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {layers.map((layer, layerIndex) => (
          <div
            key={`layer-${layerIndex}`}
            className="flex flex-col gap-3 rounded-2xl border border-white/60 bg-white/60 p-4 shadow-sm"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-text-dark">Слой {layerIndex + 1}</h3>
              <span className="text-xs uppercase tracking-wide text-text-light">глубина {layerIndex + 1}</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {layer.map((digit, index) => {
                const paletteClass = digitStyleMap[digit % digitStyleMap.length];
                return (
                  <div
                    key={`layer-${layerIndex}-digit-${index}`}
                    className={`flex h-12 flex-col items-center justify-center rounded-xl border text-sm font-semibold shadow-sm transition-transform duration-200 hover:-translate-y-0.5 ${paletteClass}`}
                  >
                    <span className="text-lg leading-none">{digit}</span>
                    <span className="text-[10px] uppercase tracking-wide text-text-light">#{index + 1}</span>
                  </div>
                );
              })}
            </div>
            <div className="rounded-xl bg-background-light/60 px-3 py-2 text-[13px] font-mono text-text-light">
              {layer.join(" ")}
            </div>
          </div>
        ))}
      </div>
    );
  }, [errorMessage, layers, status]);

  return (
    <section className={rootClassName}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-text-dark">Фрактальная память</h2>
          <p className="mt-1 text-sm text-text-light">
            Слои цифрового роя, полученные из KolibriSim.poluchit_canvas.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="flex items-center gap-2 rounded-xl border border-transparent bg-background-light/60 px-4 py-2 text-sm font-medium text-text-dark transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!isReady || status === "loading"}
        >
          <RefreshCw className="h-4 w-4" />
          Обновить
        </button>
      </div>
      <div className="mt-6">{body}</div>
    </section>
  );
};

export default FractalMemory;
