import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { AvatarDescriptor, EmojiCue, SubtitleCue } from "../types/stream";

interface MessageBubbleProps {
  role: "user" | "assistant";
  header: ReactNode;
  body: ReactNode;
  footer?: ReactNode;
  actions?: ReactNode;
  subtitles?: SubtitleCue[];
  emojiTimeline?: EmojiCue[];
  avatar?: AvatarDescriptor;
  isStreaming?: boolean;
}

const AnimatedAvatar = ({ descriptor }: { descriptor?: AvatarDescriptor }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!descriptor) {
      return undefined;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return undefined;
    }

    let frame = 0;
    let raf = 0;
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#6366f1");
    gradient.addColorStop(1, "#22d3ee");

    const render = () => {
      frame += 1;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = gradient;
      context.globalAlpha = 0.85;
      context.beginPath();
      const pulse = 16 + Math.sin(frame / 20) * 6;
      context.ellipse(canvas.width / 2, canvas.height / 2, 28 + pulse, 28, 0, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      context.fillStyle = "#0f172a";
      context.font = "bold 20px 'Inter', sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      const initials = descriptor?.src ? descriptor.src.slice(0, 1).toUpperCase() : "Σ";
      context.fillText(initials, canvas.width / 2, canvas.height / 2);
      raf = window.requestAnimationFrame(render);
    };

    render();
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [descriptor]);

  if (!descriptor) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      width={72}
      height={72}
      className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/30 via-primary/20 to-accent/30 shadow-lg"
      aria-hidden="true"
    />
  );
};

const MessageBubble = ({
  role,
  header,
  body,
  footer,
  actions,
  subtitles,
  emojiTimeline,
  avatar,
  isStreaming,
}: MessageBubbleProps) => {
  const subtitle = useMemo(() => {
    if (!subtitles || subtitles.length === 0) {
      return undefined;
    }
    return subtitles[subtitles.length - 1];
  }, [subtitles]);

  const latestEmojis = useMemo(() => {
    if (!emojiTimeline || emojiTimeline.length === 0) {
      return [];
    }
    return emojiTimeline.slice(-5);
  }, [emojiTimeline]);

  return (
    <div
      className={`relative w-full rounded-3xl border px-6 py-5 backdrop-blur transition-shadow ${
        role === "user"
          ? "border-primary/50 bg-gradient-to-br from-primary/85 via-primary/70 to-primary/60 text-white shadow-[0_28px_60px_-32px_rgba(99,102,241,0.8)]"
          : "border-border-strong/70 bg-background-input/85 text-text-primary shadow-[0_24px_48px_-28px_rgba(15,23,42,0.3)]"
      }`}
    >
      {avatar ? (
        <div className="absolute -left-20 top-1/2 hidden -translate-y-1/2 lg:block">
          <AnimatedAvatar descriptor={avatar} />
        </div>
      ) : null}
      <div className="flex flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3 text-[0.7rem] uppercase tracking-[0.35em]">
          {header}
          {isStreaming ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-[0.65rem] font-semibold text-brand">
              <Sparkles className="h-3.5 w-3.5 animate-pulse" /> В эфире
            </span>
          ) : null}
        </header>
        <div className="space-y-4 text-[0.95rem] leading-relaxed">{body}</div>
        {footer ? <div className="space-y-3 text-sm text-text-secondary">{footer}</div> : null}
        {subtitle ? (
          <div className="rounded-2xl border border-border/60 bg-background-card/70 px-4 py-3 text-sm text-text-secondary">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-text-muted">Субтитры</span>
            <p className="mt-2 text-base text-text-primary">{subtitle.text}</p>
          </div>
        ) : null}
        {latestEmojis.length ? (
          <div className="flex items-center gap-2 text-lg">
            {latestEmojis.map((cue) => (
              <span key={`${cue.emoji}-${cue.timestamp}`} className="animate-bounce text-2xl">
                {cue.emoji}
              </span>
            ))}
          </div>
        ) : null}
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
};

export default MessageBubble;
