import { ArrowRight, Clock3, Paperclip, Sparkles } from "lucide-react";
import { useMemo, useRef, type ChangeEvent, type ReactNode } from "react";
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

const HorizontalRail = ({ children }: { children: ReactNode }) => (
  <div className="overflow-x-auto">
    <div className="flex min-w-full gap-4 pb-2 pr-4">{children}</div>
  </div>
);

const SectionHeading = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <header>
    <p className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-text-secondary/70">{title}</p>
    {subtitle ? <p className="mt-1 text-sm text-text-secondary">{subtitle}</p> : null}
  </header>
);

const SkeletonCard = () => (
  <div className="min-w-[220px] rounded-2xl border border-border/60 bg-background-input/30 p-4 shadow-sm">
    <div className="h-4 w-1/2 animate-pulse rounded bg-border/80" />
    <div className="mt-3 space-y-2">
      <div className="h-3 w-full animate-pulse rounded bg-border/60" />
      <div className="h-3 w-3/4 animate-pulse rounded bg-border/50" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-border/40" />
    </div>
  </div>
);

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
    <section className="flex h-full flex-col justify-center gap-10 rounded-3xl border border-border-strong bg-background-card/70 p-12 backdrop-blur">
      <div className="space-y-4">
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">Привет, Владислав!</p>
          <h1 className="text-4xl font-semibold text-text-primary">
            Привет, Vladislav, чем Колибри может помочь сегодня?
          </h1>
          <p className="max-w-2xl text-sm text-text-secondary">
            Вернись к последним диалогам, попробуй популярные GPT-персоны или изучи свежие подборки.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleAttachmentClick}
            disabled={isAttachmentDisabled}
            className="group flex min-w-[260px] flex-1 items-center gap-4 rounded-2xl border border-border/60 bg-background-input/70 px-5 py-4 text-left transition hover:border-primary/60 hover:bg-background-input/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Paperclip className="h-5 w-5" />
            </span>
            <span className="flex flex-col">
              <span className="text-base font-semibold text-text">Подключить файлы</span>
              <span className="text-sm text-text-secondary">{attachmentHint}</span>
            </span>
            <ArrowRight className="ml-auto h-4 w-4 text-text-secondary transition group-hover:translate-x-1 group-hover:text-primary" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleAttachmentChange}
            className="sr-only"
          />
          <p className="text-xs text-text-secondary/70">
            Поддерживаются PDF, изображения, таблицы и другие мультимодальные вложения.
          </p>
        </div>
      </div>

      <div className="space-y-10">
        <div className="space-y-4">
          <SectionHeading title="Recent" subtitle="Продолжи последние беседы" />
          {recentConversations.length ? (
            <HorizontalRail>
              {recentConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => onConversationSelect(conversation.id)}
                  className="group min-w-[240px] rounded-2xl border border-border/60 bg-surface px-5 py-4 text-left shadow-sm transition hover:border-primary/50 hover:shadow-md"
                >
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-text-secondary/70">
                    <Clock3 className="h-3.5 w-3.5 text-text-secondary/60" />
                    <span>{formatRelativeTime(conversation.updatedAtIso ?? conversation.createdAtIso)}</span>
                  </div>
                  <h3 className="mt-3 line-clamp-2 text-base font-semibold text-text">
                    {conversation.title || "Без названия"}
                  </h3>
                  <p className="mt-2 line-clamp-3 text-sm text-text-secondary">
                    {conversation.preview?.trim() || "История будет собрана после первого сообщения."}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary transition group-hover:gap-3">
                    Продолжить
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </button>
              ))}
            </HorizontalRail>
          ) : (
            <p className="rounded-2xl border border-dashed border-border/60 bg-background-input/30 px-5 py-6 text-sm text-text-secondary">
              История появится, как только начнутся беседы.
            </p>
          )}
        </div>

        <div className="space-y-4">
          <SectionHeading title="Popular GPTs" subtitle="Готовые профили с подобранными инструкциями" />
          {isPopularLoading ? (
            <HorizontalRail>
              {Array.from({ length: 3 }).map((_, index) => (
                <SkeletonCard key={`popular-skeleton-${index}`} />
              ))}
            </HorizontalRail>
          ) : popularGpts.length ? (
            <HorizontalRail>
              {popularGpts.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSuggestionSelect(item.prompt)}
                  className="group min-w-[240px] rounded-2xl border border-border/60 bg-background-input/50 px-5 py-4 text-left shadow-sm transition hover:border-primary/50 hover:bg-background-input/80 hover:shadow-md"
                >
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-primary/80">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{item.badge || "GPT"}</span>
                  </div>
                  <h3 className="mt-3 line-clamp-2 text-base font-semibold text-text">{item.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm text-text-secondary">{item.description}</p>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary transition group-hover:gap-3">
                    Запустить
                    <ArrowRight className="h-4 w-4" />
                  </span>
                  {item.author ? (
                    <p className="mt-2 text-xs text-text-secondary/70">Автор: {item.author}</p>
                  ) : null}
                </button>
              ))}
            </HorizontalRail>
          ) : (
            <p className="rounded-2xl border border-dashed border-border/60 bg-background-input/30 px-5 py-6 text-sm text-text-secondary">
              Рекомендации GPT пока недоступны. Попробуй обновить позже.
            </p>
          )}
        </div>

        <div className="space-y-4">
          <SectionHeading title="What’s new" subtitle="Свежие подборки и сценарии" />
          {isWhatsNewLoading ? (
            <HorizontalRail>
              {Array.from({ length: 3 }).map((_, index) => (
                <SkeletonCard key={`new-skeleton-${index}`} />
              ))}
            </HorizontalRail>
          ) : whatsNew.length ? (
            <HorizontalRail>
              {whatsNew.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.prompt) {
                      onSuggestionSelect(item.prompt);
                    } else if (item.link && typeof window !== "undefined") {
                      window.open(item.link, "_blank", "noopener,noreferrer");
                    }
                  }}
                  className="group min-w-[240px] rounded-2xl border border-border/60 bg-surface px-5 py-4 text-left shadow-sm transition hover:border-primary/50 hover:shadow-md"
                >
                  <h3 className="text-base font-semibold text-text">{item.title}</h3>
                  <p className="mt-2 line-clamp-4 text-sm text-text-secondary">{item.summary}</p>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary transition group-hover:gap-3">
                    {item.prompt ? "Испробовать" : "Подробнее"}
                    <ArrowRight className="h-4 w-4" />
                  </span>
                  {item.publishedAtIso ? (
                    <p className="mt-2 text-xs text-text-secondary/70">
                      {formatRelativeTime(item.publishedAtIso)}
                    </p>
                  ) : null}
                </button>
              ))}
            </HorizontalRail>
          ) : (
            <p className="rounded-2xl border border-dashed border-border/60 bg-background-input/30 px-5 py-6 text-sm text-text-secondary">
              Свежих подборок пока нет, но команда уже работает над обновлениями.
            </p>
          )}
        </div>
      </div>
    </section>
  );
};

export default WelcomeScreen;
