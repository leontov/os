import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Plus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ConversationSummary } from "../../core/useKolibriChat";
import type { ModeOption } from "../../core/modes";

interface ChatSidebarProps {
  conversations: ConversationSummary[];
  activeConversationId?: string;
  mode: string;
  modeOptions: ModeOption[];
  isCollapsed: boolean;
  onCollapseToggle: () => void;
  onCreateConversation: () => void;
  onSelectConversation: (conversationId: string) => void;
  onRenameConversation: (conversationId: string, title: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onModeChange: (mode: string) => void;
  onClose?: () => void;
}

interface ConversationGroup {
  key: string;
  label: string;
  items: ConversationSummary[];
}

const dayFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
const longFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();

const startOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const groupConversations = (conversations: ConversationSummary[]): ConversationGroup[] => {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const groups = new Map<string, ConversationGroup>();

  conversations
    .map((conversation) => {
      const iso = conversation.updatedAtIso || conversation.createdAtIso;
      const timestamp = iso ? new Date(iso) : new Date();
      return { conversation, timestamp };
    })
    .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())
    .forEach(({ conversation, timestamp }) => {
      const key = startOfDay(timestamp).toISOString();
      let label: string;
      if (isSameDay(timestamp, today)) {
        label = "Сегодня";
      } else if (isSameDay(timestamp, yesterday)) {
        label = "Вчера";
      } else if (timestamp.getFullYear() === now.getFullYear()) {
        label = dayFormatter.format(timestamp);
      } else {
        label = longFormatter.format(timestamp);
      }

      if (!groups.has(key)) {
        groups.set(key, { key, label, items: [] });
      }
      groups.get(key)!.items.push(conversation);
    });

  return Array.from(groups.values());
};

const ChatSidebar = ({
  conversations,
  activeConversationId,
  mode,
  modeOptions,
  isCollapsed,
  onCollapseToggle,
  onCreateConversation,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  onModeChange,
  onClose,
}: ChatSidebarProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [contextMenu, setContextMenu] = useState<{ conversationId: string; x: number; y: number } | null>(null);

  const groups = useMemo(() => groupConversations(conversations), [conversations]);

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    const handleDismiss = () => {
      setContextMenu(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    window.addEventListener("click", handleDismiss);
    window.addEventListener("contextmenu", handleDismiss);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("click", handleDismiss);
      window.removeEventListener("contextmenu", handleDismiss);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  const beginRename = (conversation: ConversationSummary) => {
    setContextMenu(null);
    setEditingId(conversation.id);
    setEditingValue(conversation.title);
  };

  const commitRename = () => {
    if (!editingId) {
      return;
    }
    const trimmed = editingValue.trim();
    if (trimmed) {
      onRenameConversation(editingId, trimmed);
    }
    setEditingId(null);
    setEditingValue("");
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditingValue("");
  };

  const activeMode = useMemo(() => modeOptions.find((option) => option.value === mode)?.value ?? mode, [mode, modeOptions]);

  return (
    <div
      className={`flex h-full flex-col bg-sidebar/95 backdrop-blur ${
        isCollapsed ? "w-20" : "w-80"
      } border-r border-border/60 transition-[width] duration-300 ease-gesture`}
    >
      <div className="flex items-center gap-2 px-4 pt-6">
        <button
          type="button"
          onClick={() => {
            onCreateConversation();
            onClose?.();
          }}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand/90 px-3 py-2 text-sm font-semibold text-brand-foreground shadow-sm transition hover:bg-brand"
        >
          <Plus className="h-4 w-4" />
          <span className={isCollapsed ? "sr-only" : ""}>New chat</span>
        </button>
        <button
          type="button"
          onClick={onCollapseToggle}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 text-text-muted transition hover:text-text"
          aria-label={isCollapsed ? "Развернуть панель" : "Свернуть панель"}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <div className={`px-4 pt-6 ${isCollapsed ? "hidden" : "block"}`}>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-text-muted">Модель</p>
        <div className="mt-3 space-y-2">
          {modeOptions.map((option) => {
            const isActive = option.value === activeMode;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onModeChange(option.value)}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm transition ${
                  isActive
                    ? "border-brand/40 bg-brand/10 text-text"
                    : "border-transparent bg-surface text-text-muted hover:border-border/60 hover:text-text"
                }`}
                aria-pressed={isActive}
              >
                <span>{option.label}</span>
                {isActive ? <span className="text-xs font-semibold text-brand">active</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex-1 overflow-hidden">
        <div className="soft-scroll h-full space-y-6 overflow-y-auto px-2 pb-6">
          {groups.length === 0 ? (
            <div className="mx-2 rounded-xl border border-dashed border-border/60 bg-surface/90 px-4 py-3 text-sm text-text-muted">
              Беседы появятся после отправки сообщений.
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.key} className="space-y-2">
                <div className="flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-[0.3em] text-text-muted">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {group.label}
                </div>
                <ul className="space-y-1">
                  {group.items.map((conversation) => {
                    const isActive = conversation.id === activeConversationId;
                    const isEditing = editingId === conversation.id;
                    return (
                      <li key={conversation.id}>
                        <div
                          className={`group relative overflow-hidden rounded-xl border ${
                            isActive
                              ? "border-brand/50 bg-brand/10 text-text"
                              : "border-transparent bg-surface/90 text-text-muted hover:border-border/70 hover:text-text"
                          }`}
                        >
                          {isEditing ? (
                            <form
                              onSubmit={(event) => {
                                event.preventDefault();
                                commitRename();
                              }}
                            >
                              <input
                                autoFocus
                                className="w-full bg-transparent px-3 py-2 text-sm font-semibold text-text focus:outline-none"
                                value={editingValue}
                                onChange={(event) => setEditingValue(event.target.value)}
                                onBlur={commitRename}
                                onKeyDown={(event) => {
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    cancelRename();
                                  }
                                }}
                              />
                            </form>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectConversation(conversation.id);
                                onClose?.();
                              }}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                setContextMenu({
                                  conversationId: conversation.id,
                                  x: event.clientX,
                                  y: event.clientY,
                                });
                              }}
                              className="flex w-full flex-col items-start px-3 py-2 text-left"
                            >
                              <span className="text-sm font-semibold text-text">{conversation.title}</span>
                              <span className="mt-1 line-clamp-2 text-xs text-text-muted">{conversation.preview || "Нет сообщений"}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(event) => {
                              const rect = event.currentTarget.getBoundingClientRect();
                              setContextMenu({
                                conversationId: conversation.id,
                                x: rect.left,
                                y: rect.bottom + 4,
                              });
                            }}
                            className="absolute right-1 top-1 hidden rounded-lg border border-transparent p-1 text-text-muted transition group-hover:block hover:border-border/70 hover:text-text"
                            aria-label="Открыть меню"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>

      {contextMenu ? (
        <div
          className="fixed z-50 min-w-[160px] overflow-hidden rounded-xl border border-border/60 bg-surface text-sm text-text shadow-card"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
        >
          <button
            type="button"
            className="flex w-full items-center justify-start px-4 py-2 text-left hover:bg-surface-muted"
            onClick={() => {
              const target = conversations.find((item) => item.id === contextMenu.conversationId);
              if (target) {
                beginRename(target);
              }
            }}
          >
            Переименовать
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-start px-4 py-2 text-left text-red-500 hover:bg-surface-muted"
            onClick={() => {
              onDeleteConversation(contextMenu.conversationId);
              setContextMenu(null);
              onClose?.();
            }}
          >
            Удалить
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default ChatSidebar;
