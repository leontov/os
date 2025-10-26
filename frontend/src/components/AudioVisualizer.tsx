import { Headphones, Waveform } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

interface AudioVisualizerProps {
  spectrum?: number[];
  waveform?: number[];
  isActive?: boolean;
  onReplay?: () => void;
  onTranscribe?: () => void;
}

const drawFallbackGrid = (context: CanvasRenderingContext2D, width: number, height: number) => {
  context.clearRect(0, 0, width, height);
  context.strokeStyle = "rgba(148, 163, 184, 0.25)";
  context.lineWidth = 1;
  const step = width / 12;
  for (let x = 0; x <= width; x += step) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y <= height; y += step) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
};

const AudioVisualizer = ({ spectrum, waveform, isActive, onReplay, onTranscribe }: AudioVisualizerProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const data = useMemo(() => spectrum ?? waveform ?? [], [spectrum, waveform]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return undefined;
    }

    let raf = 0;
    let frame = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      context.clearRect(0, 0, width, height);

      if (data.length === 0) {
        drawFallbackGrid(context, width, height);
      } else {
        const bars = Math.min(96, data.length);
        const barWidth = width / bars;
        context.fillStyle = "rgba(59, 130, 246, 0.65)";
        for (let index = 0; index < bars; index += 1) {
          const offset = (index + frame) % data.length;
          const value = data[offset] ?? 0;
          const amplitude = Math.max(4, (value / 255) * height);
          const x = index * barWidth;
          const y = height - amplitude;
          const radius = Math.min(6, barWidth / 2);
          context.beginPath();
          context.moveTo(x, height);
          context.lineTo(x, y + radius);
          context.quadraticCurveTo(x, y, x + radius, y);
          context.lineTo(x + barWidth - radius, y);
          context.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
          context.lineTo(x + barWidth, height);
          context.closePath();
          context.fill();
        }
      }

      frame += 1;
      if (isActive) {
        raf = window.requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [data, isActive]);

  return (
    <div className="rounded-2xl border border-border/60 bg-background-card/80 p-4 shadow-inner">
      <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-text-muted">
        <Waveform className="h-4 w-4" /> Спектрограмма
      </div>
      <canvas ref={canvasRef} width={320} height={120} className="w-full rounded-xl bg-background-muted" />
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
        <button
          type="button"
          onClick={onReplay}
          className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-surface px-3 py-1 font-semibold uppercase tracking-[0.2em] text-text transition-colors hover:border-primary hover:text-primary"
        >
          <Headphones className="h-4 w-4" /> Прослушать заново
        </button>
        <button
          type="button"
          onClick={onTranscribe}
          className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-surface px-3 py-1 font-semibold uppercase tracking-[0.2em] text-text transition-colors hover:border-primary hover:text-primary"
        >
          <Waveform className="h-4 w-4" /> Расшифровать
        </button>
        {isActive ? (
          <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-3 py-1 font-semibold text-brand">
            <Waveform className="h-3.5 w-3.5 animate-pulse" /> Активно
          </span>
        ) : null}
      </div>
    </div>
  );
};

export default AudioVisualizer;
