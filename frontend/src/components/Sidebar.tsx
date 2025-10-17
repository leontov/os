import { Plus } from "lucide-react";
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

const Sidebar = ({
  conversations,
  activeConversationId,
  onConversationSelect,
  onCreateConversation,
}: SidebarProps) => (
  <div className="flex h-full flex-col rounded-3xl border border-border-strong bg-background-panel/80 p-6 backdrop-blur">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-widest text-text-secondary">Беседы</p>
        <h2 className="mt-2 text-xl font-semibold text-text-primary">История</h2>
      </div>
      <button
        type="button"
        onClick={() => onCreateConversation?.()}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-strong bg-background-card/80 text-text-secondary transition-colors hover:text-text-primary"
        aria-label="Новая беседа"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
    <ul className="mt-6 space-y-2">
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
                className={`w-full rounded-2xl px-4 py-3 text-left transition-colors ${
                  isActive
                    ? "bg-primary/15 text-text-primary"
                    : "bg-background-card/60 text-text-secondary hover:bg-background-card"
                }`}
              >
                <p className="text-sm font-semibold text-text-primary">{item.title}</p>
                <p className="mt-1 text-xs text-text-secondary">
                  {dateLabel ? `${dateLabel} • ` : ""}
                  {preview}
                </p>
              </button>
            </li>
          );
        })
      ) : (
        <li className="rounded-2xl bg-background-card/60 px-4 py-3 text-xs text-text-secondary">
          Беседы появятся после отправки первых сообщений.
        </li>
      )}
    </ul>
    <div className="mt-6 rounded-2xl border border-border-strong bg-background-card/80 p-4">
      <p className="text-sm font-semibold text-text-primary">Vladislav Kochurov</p>
      <p className="mt-1 text-xs text-text-secondary">Kolibri может делать ошибки.</p>
    </div>
  </div>
);

export default Sidebar;
