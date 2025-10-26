import {
  Activity,
  ArrowRight,
  Bot,
  Brain,
  Cpu,
  Globe,
  Paperclip,
  Radio,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";
import { useMemo, useRef, type ChangeEvent, type ComponentType } from "react";
import type { ConversationSummary } from "../core/useKolibriChat";
import type { PopularGptRecommendation, WhatsNewHighlight } from "../types/recommendations";

interface WelcomeScreenProps {
  onSuggestionSelect: (prompt: string) => void;
  onConversationSelect: (id: string) => void;
  onAttachFiles: (files: File[]) => void;
  recentConversations: ConversationSummary[];
  popularGpts: PopularGptRecommendation[];
  whatsNew: WhatsNewHighlight[];
  isPopularLoading?: boolean;
  isWhatsNewLoading?: boolean;
  isAttachmentDisabled?: boolean;
}

interface NotificationItem {
  id: string;
  title: string;
  description: string;
  accentClass: string;
  meta?: string;
  onClick?: () => void;
}

interface OrbitItem {
  id: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  accentClass: string;
  prompt: string;
}

const formatRelativeTime = (iso?: string) => {
  if (!iso) {
    return "";
  }
  const value = Date.parse(iso);
  if (Number.isNaN(value)) {
    return "";
  }
  const diffMs = Date.now() - value;
  const diffMinutes = Math.round(diffMs / 60000);
  const absMinutes = Math.abs(diffMinutes);
  if (absMinutes < 1) {
    return "только что";
  }
  if (absMinutes < 60) {
    return `${absMinutes} мин назад`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  const absHours = Math.abs(diffHours);
  if (absHours < 24) {
    return `${absHours} ч назад`;
  }
  const diffDays = Math.round(diffHours / 24);
  return `${Math.abs(diffDays)} дн назад`;
};

const accentPalette = [
  "from-[#5B8CFF]/80 via-[#6EE7FF]/70 to-[#4ADE80]/70",
  "from-[#C084FC]/70 via-[#7C3AED]/60 to-[#22D3EE]/70",
  "from-[#38BDF8]/80 via-[#6366F1]/70 to-[#EC4899]/60",
  "from-[#22D3EE]/80 via-[#4ADE80]/70 to-[#F97316]/60",
];

const fallbackOrbitPresets: Array<{ id: string; label: string; prompt: string }> = [
  { id: "chat", label: "Chat", prompt: "Помоги сформулировать вежливый ответ пользователю." },
  { id: "cli", label: "CLI", prompt: "Сгенерируй пошаговую инструкцию для запуска Kolibri локально." },
  { id: "memory", label: "Memory", prompt: "Собери ключевые факты по последнему диалогу." },
  { id: "analysis", label: "Analysis", prompt: "Проанализируй риски в плане внедрения Kolibri OS." },
  { id: "settings", label: "Settings", prompt: "Помоги настроить идеальные параметры Kolibri для демо." },
  { id: "network", label: "Network", prompt: "Подскажи, как рассказать команде о новой функции Kolibri." },
  { id: "output", label: "Output", prompt: "Сформируй краткую презентацию о Kolibri OS." },
  { id: "insights", label: "Insights", prompt: "Предложи три идеи по развитию Kolibri OS." },
];

const fallbackQuickPrompts = [
  { id: "resume", label: "Резюме беседы", prompt: "Сформулируй краткое резюме беседы" },
  { id: "steps", label: "Следующие шаги", prompt: "Предложи три следующих шага" },
  { id: "ideas", label: "Идеи", prompt: "Выпиши ключевые идеи" },
  { id: "email", label: "Письмо", prompt: "Помоги подготовить письмо по теме диалога" },
];

const WelcomeScreen = ({
  onSuggestionSelect,
  onConversationSelect,
  onAttachFiles,
  recentConversations,
  popularGpts,
  whatsNew,
  isPopularLoading,
  isWhatsNewLoading,
  isAttachmentDisabled,
}: WelcomeScreenProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const attachmentHint = useMemo(
    () => (isAttachmentDisabled ? "Дождитесь готовности ядра" : "PDF, изображения, таблицы"),
    [isAttachmentDisabled],
  );

  const quickActions = useMemo(() => {
    const mapped = popularGpts.slice(0, 4).map((item) => ({
      id: `popular-${item.id}`,
      label: item.title,
      prompt: item.prompt,
    }));

    if (mapped.length >= 4) {
      return mapped;
    }

    const fallback = fallbackQuickPrompts.filter(
      (item) => !mapped.some((existing) => existing.prompt === item.prompt),
    );

    return [...mapped, ...fallback].slice(0, 4);
  }, [popularGpts]);

  const notifications = useMemo<NotificationItem[]>(() => {
    const highlightEntries = whatsNew.map((item, index) => {
      let onClick: (() => void) | undefined;

      if (item.prompt) {
        const prompt = item.prompt;
        onClick = () => {
          onSuggestionSelect(prompt);
        };
      } else if (item.link) {
        const { link } = item;
        onClick = () => {
          if (typeof window !== "undefined") {
            window.open(link, "_blank", "noopener,noreferrer");
          }
        };
      }

      return {
        id: `highlight-${item.id}`,
        title: item.title,
        description: item.summary,
        accentClass: accentPalette[index % accentPalette.length],
        meta: item.publishedAtIso ? formatRelativeTime(item.publishedAtIso) : "Новое",
        onClick,
      } satisfies NotificationItem;
    });

    const recentEntries = recentConversations.slice(0, 4).map((conversation, index) => ({
      id: `conversation-${conversation.id}`,
      title: conversation.title || "Без названия",
      description:
        conversation.preview?.trim() || "История появится, как только начнутся беседы.",
      accentClass:
        accentPalette[(highlightEntries.length + index) % accentPalette.length],
      meta: formatRelativeTime(conversation.updatedAtIso ?? conversation.createdAtIso) || "Недавно",
      onClick: () => onConversationSelect(conversation.id),
    }));

    return [...highlightEntries, ...recentEntries].slice(0, 4);
  }, [
    whatsNew,
    recentConversations,
    onConversationSelect,
    onSuggestionSelect,
  ]);

  const orbitItems = useMemo<OrbitItem[]>(() => {
    const iconSet = [Sparkles, Bot, Brain, Terminal, ShieldCheck, Globe, Radio, Cpu];

    const mapped = popularGpts.slice(0, 8).map((item, index) => ({
      id: item.id,
      label: item.title,
      Icon: iconSet[index % iconSet.length],
      accentClass: accentPalette[index % accentPalette.length],
      prompt: item.prompt,
    }));

    if (mapped.length) {
      return mapped;
    }

    return fallbackOrbitPresets.map((preset, index) => ({
      id: preset.id,
      label: preset.label,
      Icon: iconSet[index % iconSet.length],
      accentClass: accentPalette[index % accentPalette.length],
      prompt: preset.prompt,
    }));
  }, [popularGpts]);

  const processCount = useMemo(() => {
    const sources = [popularGpts.length, whatsNew.length, recentConversations.length];
    return sources.reduce((total, value) => total + (value > 0 ? 1 : 0), 0) + 3;
  }, [popularGpts.length, recentConversations.length, whatsNew.length]);

  const memoryUsage = useMemo(() => {
    const base = 860;
    return base + popularGpts.length * 28 + recentConversations.length * 42;
  }, [popularGpts.length, recentConversations.length]);

  const activeConversations = useMemo(
    () => Math.max(recentConversations.length, 1) + (isAttachmentDisabled ? 0 : 1),
    [recentConversations.length, isAttachmentDisabled],
  );

  const handleAttachmentClick = () => {
    if (isAttachmentDisabled) {
      return;
    }
    fileInputRef.current?.click();
  };

  const handleAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (files.length) {
      onAttachFiles(files);
    }
    event.target.value = "";
  };

  return (
    <section className="relative flex h-full min-h-[620px] flex-col gap-10 overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-[#080A1C] via-[#050712] to-[#01030A] p-10 text-white shadow-[0_32px_120px_-48px_rgba(15,23,42,0.75)]">
      <div className="pointer-events-none absolute -left-32 top-10 h-72 w-72 rounded-full bg-[#4A44FF]/25 blur-[120px]" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-[#00D8FF]/20 blur-[120px]" />

      <div className="relative grid flex-1 gap-10 lg:grid-cols-[320px_minmax(0,1fr)_200px]">
        <div className="flex flex-col justify-between gap-8">
          <div className="space-y-6">
            <header className="flex items-start justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="relative flex h-14 w-14 items-center justify-center rounded-3xl border border-white/20 bg-white/10 shadow-inner shadow-cyan-500/20">
                  <Sparkles className="h-7 w-7 text-cyan-300" />
                  <span className="absolute -bottom-1 right-0 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400 text-[0.65rem] font-semibold text-slate-900">
                    OS
                  </span>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.48em] text-white/50">Колибри</p>
                  <h1 className="text-3xl font-semibold tracking-tight">Kolibri OS</h1>
                  <p className="mt-1 max-w-[220px] text-sm text-white/60">
                    Центр управления вашей AI-командой и знаниями.
                  </p>
                </div>
              </div>
              <div className="rounded-3xl border border-white/15 bg-white/5 px-4 py-3 text-right">
                <p className="text-[0.65rem] uppercase tracking-[0.4em] text-white/50">Active</p>
                <p className="text-2xl font-semibold">{activeConversations}</p>
              </div>
            </header>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleAttachmentClick}
                disabled={isAttachmentDisabled}
                className="group flex w-full items-center gap-4 rounded-3xl border border-white/15 bg-white/5 px-5 py-4 text-left transition-all hover:border-cyan-300/60 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/20 text-cyan-200">
                  <Paperclip className="h-5 w-5" />
                </span>
                <span className="flex flex-col">
                  <span className="text-base font-semibold">Подключить файлы</span>
                  <span className="text-xs text-white/60">{attachmentHint}</span>
                </span>
                <ArrowRight className="ml-auto h-4 w-4 text-white/60 transition-transform group-hover:translate-x-1" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleAttachmentChange}
                className="sr-only"
              />
              <p className="text-xs text-white/40">
                Поддерживаются PDF, изображения, таблицы и другие мультимодальные вложения.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.4em] text-white/60">Notifications</h2>
                {isWhatsNewLoading ? (
                  <span className="text-xs text-white/50">Загрузка…</span>
                ) : null}
              </div>
              <div className="space-y-3">
                {isWhatsNewLoading
                  ? Array.from({ length: 3 }).map((_, index) => (
                      <div
                        // eslint-disable-next-line react/no-array-index-key
                        key={`notification-skeleton-${index}`}
                        className="h-20 w-full animate-pulse rounded-3xl border border-white/10 bg-white/5"
                      />
                    ))
                  : notifications.map((item, index) => {
                      const AccentIcon = index % 2 === 0 ? Activity : Sparkles;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            item.onClick?.();
                          }}
                          disabled={!item.onClick}
                          className="group relative w-full overflow-hidden rounded-3xl border border-white/15 bg-white/5 p-[1px] text-left transition-all hover:border-cyan-300/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 disabled:cursor-default disabled:opacity-75"
                        >
                          <div className={`rounded-[1.4rem] bg-gradient-to-br ${item.accentClass} p-4`}> 
                            <div className="flex items-start gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black/30 text-white/90">
                                <AccentIcon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold">{item.title}</p>
                                <p className="mt-1 line-clamp-2 text-xs text-white/80">{item.description}</p>
                              </div>
                              <ArrowRight className="h-4 w-4 text-white/60 transition group-hover:translate-x-1" />
                            </div>
                            {item.meta ? (
                              <p className="mt-3 text-[0.65rem] uppercase tracking-[0.4em] text-white/60">
                                {item.meta}
                              </p>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.4em] text-white/60">Quick actions</h2>
              <div className="flex flex-wrap gap-2">
                {quickActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => onSuggestionSelect(action.prompt)}
                    className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-white/70 transition hover:border-cyan-300/60 hover:text-white"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.4em] text-white/50">Недавние диалоги</h2>
            <div className="mt-4 space-y-3">
              {recentConversations.length ? (
                recentConversations.slice(0, 3).map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => onConversationSelect(conversation.id)}
                    className="group flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-left transition hover:border-cyan-300/60 hover:bg-black/30"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white/80">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{conversation.title || "Без названия"}</p>
                      <p className="truncate text-xs text-white/60">
                        {formatRelativeTime(conversation.updatedAtIso ?? conversation.createdAtIso)}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-white/50 transition group-hover:translate-x-1" />
                  </button>
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-white/20 bg-black/40 px-4 py-6 text-sm text-white/60">
                  Как только начнутся беседы, последние диалоги появятся здесь.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-8">
          <div className="relative flex h-[320px] w-[320px] items-center justify-center">
            <div className="absolute inset-8 rounded-full border border-cyan-400/40 blur-[2px]" />
            <div className="absolute inset-16 rounded-full border border-white/10" />
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/10 via-white/5 to-transparent blur-3xl" />

            {orbitItems.map((item, index) => {
              const angle = (360 / orbitItems.length) * index - 90;
              const radians = (angle * Math.PI) / 180;
              const radius = 120;
              const x = Math.cos(radians) * radius;
              const y = Math.sin(radians) * radius;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSuggestionSelect(item.prompt)}
                  style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }}
                  className="group absolute left-1/2 top-1/2 flex h-16 w-16 flex-col items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-xs font-semibold uppercase tracking-[0.18em] text-white/70 shadow-[0_10px_40px_-20px_rgba(56,189,248,0.75)] transition hover:border-cyan-300/60 hover:text-white"
                >
                  <span className={`absolute inset-0 -z-10 rounded-2xl bg-gradient-to-br ${item.accentClass} opacity-0 transition-opacity group-hover:opacity-60`} />
                  <item.Icon className="h-5 w-5" />
                  <span className="mt-1 max-w-[3.5rem] truncate">{item.label}</span>
                </button>
              );
            })}

            <div className="relative z-10 flex h-40 w-40 flex-col items-center justify-center rounded-full border border-white/20 bg-black/40 text-center shadow-[0_20px_60px_-30px_rgba(99,102,241,0.8)]">
              <div className="rounded-full bg-gradient-to-br from-cyan-400/40 via-sky-500/30 to-indigo-500/40 p-6">
                <Sparkles className="h-8 w-8 text-cyan-200" />
              </div>
              <p className="mt-3 text-xs uppercase tracking-[0.48em] text-white/50">Kolibri</p>
              <p className="text-lg font-semibold">Core Orbit</p>
            </div>

            {isPopularLoading ? (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
                <div className="h-12 w-12 animate-spin rounded-full border-2 border-cyan-300/60 border-t-transparent" />
              </div>
            ) : null}
          </div>

          <div className="grid w-full grid-cols-3 gap-4 text-center text-xs uppercase tracking-[0.35em] text-white/60 sm:grid-cols-6">
            <span className="rounded-full border border-white/15 bg-white/5 px-4 py-2">Chat</span>
            <span className="rounded-full border border-white/15 bg-white/5 px-4 py-2">CLI</span>
            <span className="rounded-full border border-white/15 bg-white/5 px-4 py-2">Memory</span>
            <span className="rounded-full border border-white/15 bg-white/5 px-4 py-2">Analysis</span>
            <span className="rounded-full border border-white/15 bg-white/5 px-4 py-2">Settings</span>
            <span className="rounded-full border border-white/15 bg-white/5 px-4 py-2">Network</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-6">
          <div className="w-full rounded-3xl border border-white/15 bg-white/5 p-4 text-right">
            <p className="text-xs uppercase tracking-[0.48em] text-white/50">Memory</p>
            <p className="text-3xl font-semibold">{memoryUsage} MB</p>
          </div>

          <div className="grid w-full grid-cols-3 gap-3 text-center md:grid-cols-1">
            {Array.from({ length: 10 }).map((_, index) => {
              const value = index === 9 ? 0 : index + 1;
              return (
                <button
                  // eslint-disable-next-line react/no-array-index-key
                  key={`pad-${value}-${index}`}
                  type="button"
                  className="rounded-2xl border border-white/15 bg-black/40 py-4 text-lg font-semibold text-white/70 transition hover:border-cyan-300/60 hover:text-white"
                >
                  {value}
                </button>
              );
            })}
          </div>

          <div className="w-full rounded-3xl border border-white/15 bg-white/5 p-4 text-right">
            <p className="text-xs uppercase tracking-[0.48em] text-white/50">Process</p>
            <p className="text-3xl font-semibold">{processCount}</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WelcomeScreen;
