import { HelpCircle, Plus, Sparkles, User } from "lucide-react";
import type { ConversationSummary } from "../core/useKolibriChat";

interface SidebarProps {
  conversations: ConversationSummary[];
  activeConversationId?: string;
  onConversationSelect: (conversationId: string) => void;
  onCreateConversation?: () => void;
}

const shortDateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const longDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const formatConversationDate = (iso: string): string => {
  if (!iso) {
    return "";
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const now = new Date();
  if (isSameDay(parsed, now)) {
    return "Сегодня";
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(parsed, yesterday)) {
    return "Вчера";
  }

  const formatter = parsed.getFullYear() === now.getFullYear() ? shortDateFormatter : longDateFormatter;
  return formatter.format(parsed);
};

const Sidebar = ({ conversations, activeConversationId, onConversationSelect, onCreateConversation }: SidebarProps) => (
  <div className="flex h-full w-full flex-col gap-6 bg-sidebar px-5 pb-6 pt-8">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-text-muted">Беседы</p>
        <h2 className="mt-1 text-lg font-semibold text-text">История</h2>
      </div>
      <button
        type="button"
        onClick={() => onCreateConversation?.()}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-surface text-text-muted transition-colors hover:text-text"
        aria-label="Новая беседа"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
    <ul className="soft-scroll -mr-2 flex-1 space-y-2 overflow-y-auto pr-1">
      {conversations.length ? (
        conversations.map((item) => {
          const isActive = item.id === activeConversationId;
          const dateLabel = formatConversationDate(item.updatedAtIso || item.createdAtIso);
          const preview = item.preview?.trim() ? item.preview : "Нет сообщений";
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onConversationSelect(item.id)}
                className={`flex w-full flex-col rounded-xl border px-4 py-3 text-left transition-colors ${
                  isActive
                    ? "border-brand/40 bg-brand/10 text-text"
                    : "border-transparent bg-surface text-text-muted hover:border-border/70 hover:text-text"
                }`}
              >
                <span className="text-sm font-semibold text-text">{item.title}</span>
                <span className="mt-1 text-xs text-text-muted">
                  {dateLabel ? `${dateLabel} • ` : ""}
                  {preview}
                </span>
              </button>
            </li>
          );
        })
      ) : (
        <li className="rounded-xl border border-dashed border-border/70 bg-surface px-4 py-3 text-xs text-text-muted">
          Беседы появятся после отправки первых сообщений.
        </li>
      )}
    </ul>
    <div className="rounded-xl border border-border/70 bg-surface px-4 py-4 text-sm text-text-muted">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-text-muted">Аккаунт</p>
      <h3 className="mt-1 text-sm font-semibold text-text">Профиль Kolibri</h3>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">
        Управляйте подпиской, настройками организации и получайте быстрый доступ к поддержке.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:border-primary/60 hover:text-primary"
        >
          <Sparkles className="h-4 w-4" />
          Upgrade
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border/70 bg-surface-muted px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-primary/40 hover:text-primary"
        >
          <User className="h-4 w-4" />
          Профиль
        </button>
      </div>
      <a
        className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-text-muted transition-colors hover:text-text"
        href="https://kolibri.ai/help"
        target="_blank"
        rel="noreferrer"
      >
        <HelpCircle className="h-4 w-4" />
        Центр помощи
      </a>
    </div>
    <div className="rounded-xl border border-border/70 bg-surface px-4 py-3 text-sm text-text-muted">
      <p className="text-sm font-semibold text-text">Kolibri</p>
      <p className="mt-1 text-xs leading-relaxed">Колибри может делать ошибки. Проверяйте факты.</p>
    </div>
  </div>
);

export default Sidebar;
