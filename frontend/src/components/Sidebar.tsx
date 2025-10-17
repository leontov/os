import { Plus } from "lucide-react";
import type { ConversationSummary } from "../core/useKolibriChat";

const formatRelativeDate = (isoDate: string | undefined, fallbackIso: string): string => {
  const parsed = isoDate ? new Date(isoDate) : new Date(fallbackIso);
  if (Number.isNaN(parsed.getTime())) {
    return "Недавно";
  }

  const today = new Date();
  const diffTime = today.setHours(0, 0, 0, 0) - new Date(parsed).setHours(0, 0, 0, 0);
  const oneDayMs = 24 * 60 * 60 * 1000;

  if (diffTime === 0) {
    return "Сегодня";
  }
  if (diffTime === oneDayMs) {
    return "Вчера";
  }

  try {
    return parsed.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
  } catch {
    return "Недавно";
  }
};

interface SidebarProps {
  conversations: ConversationSummary[];
  activeConversationId: string;
  onSelectConversation: (id: string) => void;
  onCreateConversation: () => void;
  isBusy: boolean;
}

const Sidebar = ({ conversations, activeConversationId, onSelectConversation, onCreateConversation, isBusy }: SidebarProps) => (
  <div className="flex h-full flex-col rounded-3xl border border-border-strong bg-background-panel/80 p-6 backdrop-blur">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs uppercase tracking-widest text-text-secondary">Беседы</p>
        <h2 className="mt-2 text-xl font-semibold text-text-primary">Всего — {conversations.length}</h2>
      </div>
      <button
        type="button"
        onClick={onCreateConversation}
        disabled={isBusy}
        className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border-strong bg-background-card/80 text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
        aria-label="Новая беседа"
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
    <ul className="mt-6 space-y-2">
      {conversations.map((conversation) => {
        const isActive = conversation.id === activeConversationId;
        return (
          <li key={conversation.id}>
            <button
              type="button"
              onClick={() => onSelectConversation(conversation.id)}
              className={`w-full rounded-2xl px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                isActive
                  ? "bg-primary/15 text-text-primary"
                  : "bg-background-card/60 text-text-secondary hover:bg-background-card"
              }`}
              disabled={isBusy && !isActive}
            >
              <p className="text-sm font-semibold text-text-primary">{conversation.title}</p>
              <p className="mt-1 text-xs text-text-secondary">
                {formatRelativeDate(conversation.updatedAtIso, conversation.createdAtIso)} • {conversation.preview}
              </p>
            </button>
          </li>
        );
      })}
      {!conversations.length && (
        <li>
          <div className="rounded-2xl border border-dashed border-border-strong bg-background-card/60 px-4 py-6 text-sm text-text-secondary">
            Пока нет сохранённых бесед. Начните новую, и она появится здесь.
          </div>
        </li>
      )}
    </ul>
    <div className="mt-6 rounded-2xl border border-border-strong bg-background-card/80 p-4">
      <p className="text-sm font-semibold text-text-primary">Kolibri</p>
      <p className="mt-1 text-xs text-text-secondary">Колибри может делать ошибки. Проверяйте факты.</p>
    </div>
  </div>
);

export default Sidebar;
