import { Settings, PlusCircle, Folder, History, MessageSquare } from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

export interface ConversationListItem {
  id: string;
  title: string;
  updatedAt: string;
  pinned?: boolean;
  folder?: string;
}

interface SidebarProps {
  conversations: ReadonlyArray<ConversationListItem>;
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onOpenSettings: () => void;
  onCreateFolder: () => void;
}

export function Sidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onOpenSettings,
  onCreateFolder,
}: SidebarProps) {
  const grouped = conversations.reduce<Record<string, ConversationListItem[]>>((accumulator, item) => {
    const key = item.folder ?? "default";
    if (!accumulator[key]) {
      accumulator[key] = [];
    }
    accumulator[key].push(item);
    return accumulator;
  }, {});

  return (
    <aside
      className="flex h-full w-full flex-col gap-4 border-r border-[var(--border-subtle)] bg-[var(--bg-muted)] px-3 py-4 sm:w-80"
      aria-label="Список бесед"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button variant="primary" className="flex-1" onClick={onNewConversation}>
            <PlusCircle aria-hidden />
            <span>Новый чат</span>
          </Button>
          <Button variant="ghost" size="icon" aria-label="Настройки" onClick={onOpenSettings}>
            <Settings aria-hidden />
          </Button>
        </div>
        <Input placeholder="Поиск бесед" aria-label="Поиск по историям" />
      </div>
      <nav className="flex-1 overflow-y-auto pr-1" aria-label="История бесед">
        {Object.entries(grouped).map(([folder, items]) => (
          <section key={folder} className="mb-6">
            <header className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {folder === "default" ? <History aria-hidden className="h-3.5 w-3.5" /> : <Folder aria-hidden className="h-3.5 w-3.5" />}
              <span>{folder === "default" ? "Последние" : folder}</span>
            </header>
            <ul className="space-y-1">
              {items.map((conversation) => {
                const isActive = conversation.id === activeConversationId;
                return (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => onSelectConversation(conversation.id)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(6,8,10,0.8)] ${
                        isActive ? "bg-[var(--bg-elev)] text-[var(--brand)]" : "text-[var(--text)] hover:bg-[rgba(255,255,255,0.04)]"
                      }`}
                    >
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.06)] text-[var(--brand)]">
                        <MessageSquare aria-hidden className="h-4 w-4" />
                      </span>
                      <span className="flex flex-1 flex-col">
                        <span className="text-sm font-medium leading-tight line-clamp-1">{conversation.title}</span>
                        <span className="text-xs text-[var(--muted)]">Обновлено {conversation.updatedAt}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>
      <Button variant="ghost" onClick={onCreateFolder} className="justify-start text-sm text-[var(--muted)] hover:text-[var(--text)]">
        <Folder aria-hidden className="h-4 w-4" />
        <span>Новая папка</span>
      </Button>
    </aside>
  );
}
