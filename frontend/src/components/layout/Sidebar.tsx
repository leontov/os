import { memo, useMemo, useState } from "react";
import { Settings, PlusCircle, Folder, History, MessageSquare, Pin } from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Badge } from "../ui/Badge";
import { useI18n } from "../../app/i18n";

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

function SidebarComponent({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onOpenSettings,
  onCreateFolder,
}: SidebarProps) {
  const [query, setQuery] = useState("");
  const { t } = useI18n();

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return conversations;
    }
    return conversations.filter((conversation) => conversation.title.toLowerCase().includes(normalized));
  }, [conversations, query]);

  const grouped = useMemo(() => {
    return filtered.reduce<Record<string, ConversationListItem[]>>((accumulator, item) => {
      const key = item.pinned ? "pinned" : item.folder ?? "default";
      if (!accumulator[key]) {
        accumulator[key] = [];
      }
      accumulator[key].push(item);
      return accumulator;
    }, {});
  }, [filtered]);

  return (
    <aside
      className="flex h-full w-full flex-col gap-4 border-r border-[var(--border-subtle)] bg-[var(--bg-muted)] px-3 py-4 sm:w-80"
      aria-label={t("sidebar.regionLabel")}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button variant="primary" className="flex-1" onClick={onNewConversation}>
            <PlusCircle aria-hidden />
            <span>{t("sidebar.newChat")}</span>
          </Button>
          <Button variant="ghost" size="icon" aria-label={t("settings.title")}
            onClick={onOpenSettings}
          >
            <Settings aria-hidden />
          </Button>
        </div>
        <Input
          placeholder={t("sidebar.search")}
          aria-label={t("sidebar.search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          data-chat-search="true"
        />
      </div>
      <nav className="flex-1 overflow-y-auto pr-1" aria-label={t("sidebar.historyLabel")}>
        {Object.entries(grouped).map(([folder, items]) => (
          <section key={folder} className="mb-6">
            <header className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {folder === "pinned" ? (
                <Pin aria-hidden className="h-3.5 w-3.5" />
              ) : folder === "default" ? (
                <History aria-hidden className="h-3.5 w-3.5" />
              ) : (
                <Folder aria-hidden className="h-3.5 w-3.5" />
              )}
              <span>
                {folder === "pinned"
                  ? t("sidebar.pinned")
                  : folder === "default"
                    ? t("sidebar.recent")
                    : folder}
              </span>
            </header>
            <ul className="space-y-1">
              {items.map((conversation) => {
                const isActive = conversation.id === activeConversationId;
                return (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => onSelectConversation(conversation.id)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition focus-visible:outline-none focus-visible:[box-shadow:var(--focus-strong)] ${
                        isActive
                          ? "bg-[rgba(74,222,128,0.08)] text-[var(--brand)] shadow-[var(--brand-glow)]"
                          : "text-[var(--text)] hover:bg-[rgba(255,255,255,0.04)]"
                      }`}
                    >
                      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.06)] text-[var(--brand)]">
                        <MessageSquare aria-hidden className="h-4 w-4" />
                      </span>
                      <span className="flex flex-1 flex-col gap-1">
                        <span className="text-sm font-semibold leading-tight line-clamp-1">{conversation.title}</span>
                        <span className="text-xs text-[var(--muted)]">{`${t("sidebar.updatedPrefix")} ${conversation.updatedAt}`}</span>
                      </span>
                      {conversation.pinned ? <Badge tone="accent">PIN</Badge> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>
      <Button
        variant="ghost"
        onClick={onCreateFolder}
        className="justify-start text-sm text-[var(--muted)] hover:text-[var(--text)]"
      >
        <Folder aria-hidden className="h-4 w-4" />
        <span>{t("sidebar.newFolder")}</span>
      </Button>
    </aside>
  );
}

export const Sidebar = memo(SidebarComponent);
