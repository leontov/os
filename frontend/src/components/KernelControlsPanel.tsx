import { Orbit, SlidersHorizontal, Thermometer, Waves } from "lucide-react";
import type { ChangeEvent } from "react";
import type { KernelCapabilities } from "../core/kolibri-bridge";
import type { KernelControlsState } from "../core/useKolibriChat";

interface KernelControlsPanelProps {
  controls: KernelControlsState;
  capabilities: KernelCapabilities;
  onChange: (update: Partial<KernelControlsState>) => void;
}

const formatPercent = (value: number): string => `${Math.round(value * 100)}%`;

const KernelControlsPanel = ({ controls, capabilities, onChange }: KernelControlsPanelProps) => {
const KernelControlsPanel = ({ controls, onChange }: KernelControlsPanelProps) => {
  const handleRangeChange = (key: keyof KernelControlsState) => (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    if (key === "topK") {
      onChange({ [key]: Number.parseInt(raw, 10) } as Partial<KernelControlsState>);
      return;
    }
    onChange({ [key]: Number.parseFloat(raw) } as Partial<KernelControlsState>);
  };

  const handleToggleBeam = () => {
    onChange({ cfBeam: !controls.cfBeam });
  };

  const laneWidth = Math.max(1, Math.floor(capabilities.laneWidth));
  const laneWidthClass = laneWidth > 1 ? "text-primary" : "text-text-primary";

  return (
    <section className="flex flex-col gap-5 rounded-3xl border border-border-strong bg-background-card/80 p-6 backdrop-blur">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-text-secondary">Ядро</p>
          <h2 className="mt-2 text-lg font-semibold text-text-primary">Контроль орбит</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[0.65rem] uppercase tracking-wide text-text-secondary">
            <span>
              SIMD: {capabilities.simd ? (
                <span className="font-semibold text-primary">активно</span>
              ) : (
                <span className="font-semibold text-text-primary">скалярный режим</span>
              )}
            </span>
            <span className="opacity-60">•</span>
            <span>
              Линии: <span className={`font-semibold ${laneWidthClass}`}>{laneWidth}×</span>
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={handleToggleBeam}
          className={`flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition-colors ${
            controls.cfBeam
              ? "border-primary/60 bg-primary/20 text-primary"
              : "border-border-strong bg-background-input/80 text-text-secondary hover:text-text-primary"
          }`}
        >
          <Orbit className="h-4 w-4" />
          CF-beam {controls.cfBeam ? "вкл" : "выкл"}
        </button>
      </header>

      <div className="grid gap-4">
        <label className="space-y-2">
          <span className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-text-secondary">
            B₀
            <span className="text-text-primary">{formatPercent(controls.b0)}</span>
          </span>
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="h-4 w-4 text-text-secondary" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={controls.b0}
              onChange={handleRangeChange("b0")}
              className="h-1 flex-1 appearance-none rounded-full bg-border-strong accent-primary"
            />
          </div>
        </label>

        <label className="space-y-2">
          <span className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-text-secondary">
            D₀
            <span className="text-text-primary">{formatPercent(controls.d0)}</span>
          </span>
          <div className="flex items-center gap-3">
            <Waves className="h-4 w-4 text-text-secondary" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={controls.d0}
              onChange={handleRangeChange("d0")}
              className="h-1 flex-1 appearance-none rounded-full bg-border-strong accent-primary"
            />
          </div>
        </label>

        <label className="space-y-2">
          <span className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Температура
            <span className="text-text-primary">{controls.temperature.toFixed(2)}</span>
          </span>
          <div className="flex items-center gap-3">
            <Thermometer className="h-4 w-4 text-text-secondary" />
            <input
              type="range"
              min={0.1}
              max={1.5}
              step={0.01}
              value={controls.temperature}
              onChange={handleRangeChange("temperature")}
              className="h-1 flex-1 appearance-none rounded-full bg-border-strong accent-primary"
            />
          </div>
        </label>

        <label className="space-y-2">
          <span className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Top-k
            <span className="text-text-primary">{controls.topK}</span>
          </span>
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="h-4 w-4 text-text-secondary" />
            <input
              type="range"
              min={1}
              max={16}
              step={1}
              value={controls.topK}
              onChange={handleRangeChange("topK")}
              className="h-1 flex-1 appearance-none rounded-full bg-border-strong accent-primary"
            />
          </div>
        </label>
      </div>

      <p className="text-[0.7rem] text-text-secondary">
        Изменения применяются мгновенно: ядро автоматически перенастраивает λᵦ/λᵈ и режим CF-beam при каждом движении
        ползунка.
      </p>
    </section>
  );
};

export default KernelControlsPanel;
