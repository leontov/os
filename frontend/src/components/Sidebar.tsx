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
  <div className="glass-panel-strong flex h-full w-full flex-col gap-5 p-6">
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-3">
        <span className="pill-badge">Беседы</span>
        <div>
          <h2 className="text-xl font-semibold text-text-primary">История</h2>
          <p className="mt-1 text-xs text-text-secondary">Последние диалоги и черновики — всё под рукой.</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onCreateConversation?.()}
        className="glass-panel flex h-11 w-11 items-center justify-center text-text-secondary transition-colors hover:text-text-primary"
        aria-label="Новая беседа"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
    <ul className="soft-scroll -mr-2 flex-1 space-y-2 overflow-y-auto pr-2">
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
                className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                  isActive
                    ? "border-primary/50 bg-primary/15 text-text-primary shadow-[0_18px_40px_-32px_rgba(99,102,241,0.65)]"
                    : "border-transparent bg-background-card/50 text-text-secondary hover:border-border-strong/50 hover:bg-background-card/70"
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
        <li className="rounded-2xl border border-dashed border-border-strong/60 bg-background-card/50 px-4 py-3 text-xs text-text-secondary">
          Беседы появятся после отправки первых сообщений.
        </li>
      )}
    </ul>
    <div className="glass-panel mt-auto space-y-2 p-4 text-sm text-text-secondary">
      <p className="text-sm font-semibold text-text-primary">Kolibri</p>
      <p className="text-xs text-text-secondary">Колибри может делать ошибки. Проверяйте факты.</p>
    </div>
  </div>
);

export default Sidebar;
