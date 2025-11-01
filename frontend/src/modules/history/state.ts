import { useCallback, useMemo, useState } from "react";
import type { ConversationListItem } from "../../components/layout/Sidebar";
import type { MessageBlock } from "../../components/chat/Message";
import type { MessageKey } from "../../app/i18n";

export type ConversationStatus =
  | "idle"
  | "loading"
  | "error"
  | "pending"
  | "delivering"
  | "failed";

const bootstrapConversations: ConversationListItem[] = [
  { id: "1", title: "Гайд по запуску релиза", updatedAt: "сегодня", folder: "Проекты" },
  { id: "2", title: "Daily standup", updatedAt: "вчера" },
  { id: "3", title: "Подготовка к демо Kolibri", updatedAt: "2 дня назад", folder: "Проекты" },
];

const now = Date.now();

const bootstrapMessages: MessageBlock[] = [
  {
    id: "m1",
    role: "assistant",
    authorLabel: "Колибри",
    content:
      "Привет! Потоковый режим Kolibri активен — начинай с главного запроса, и я буду дополнять ответ по мере появления токенов.",
    createdAt: new Date(now - 6 * 60 * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    timestamp: now - 6 * 60 * 1000,
  },
  {
    id: "m2",
    role: "user",
    authorLabel: "Вы",
    content:
      "Подготовь план демо: сначала обновление продуктовых метрик, затем живое показательное сообщение с потоковой выдачей.",
    createdAt: new Date(now - 5 * 60 * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    timestamp: now - 5 * 60 * 1000,
  },
];

export interface ConversationState {
  conversations: ConversationListItem[];
  activeConversation: string | null;
  messages: Record<string, MessageBlock[]>;
  status: ConversationStatus;
  selectConversation: (id: string) => void;
  createConversation: () => void;
  appendMessage: (id: string, message: MessageBlock) => void;
  updateMessage: (id: string, messageId: string, updater: (message: MessageBlock) => MessageBlock) => void;
  setStatus: (status: ConversationStatus) => void;
}

export function useConversationState(
  defaultConversationTitle: string,
  justNowLabel: string,
): ConversationState {
  const [conversations, setConversations] = useState<ConversationListItem[]>(bootstrapConversations);
  const [activeConversation, setActiveConversation] = useState<string | null>(
    bootstrapConversations[0]?.id ?? null,
  );
  const [messages, setMessages] = useState<Record<string, MessageBlock[]>>({
    [bootstrapConversations[0]?.id ?? "temp"]: bootstrapMessages,
  });
  const [status, setStatus] = useState<ConversationStatus>("idle");

  const selectConversation = useCallback(
    (id: string) => {
      setActiveConversation(id);
      if (!messages[id]) {
        setStatus("loading");
        window.setTimeout(() => {
          setMessages((current) => ({ ...current, [id]: [] }));
          setStatus("idle");
        }, 450);
      }
    },
    [messages],
  );

  const createConversation = useCallback(() => {
    const id = crypto.randomUUID();
    const title = defaultConversationTitle;
    const entry: ConversationListItem = { id, title, updatedAt: justNowLabel };
    setConversations((current) => [entry, ...current]);
    setMessages((current) => ({ ...current, [id]: [] }));
    setActiveConversation(id);
  }, [defaultConversationTitle, justNowLabel]);

  const appendMessage = useCallback(
    (id: string, message: MessageBlock) => {
      setMessages((current) => {
        const next = [...(current[id] ?? []), message];
        return { ...current, [id]: next };
      });
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === id
            ? { ...conversation, updatedAt: justNowLabel, title: conversation.title }
            : conversation,
        ),
      );
    },
    [justNowLabel],
  );

  const updateMessage = useCallback(
    (conversationId: string, messageId: string, updater: (message: MessageBlock) => MessageBlock) => {
      setMessages((current) => {
        const thread = current[conversationId];
        if (!thread || thread.length === 0) {
          return current;
        }
        const index = thread.findIndex((message) => message.id === messageId);
        if (index === -1) {
          return current;
        }
        const updated = updater(thread[index]);
        if (updated === thread[index]) {
          return current;
        }
        const nextThread = [...thread];
        nextThread[index] = updated;
        return { ...current, [conversationId]: nextThread };
      });
    },
    [],
  );

  const value = useMemo(
    () => ({
      conversations,
      activeConversation,
      messages,
      status,
      selectConversation,
      createConversation,
      appendMessage,
      updateMessage,
      setStatus,
    }),
    [
      conversations,
      activeConversation,
      messages,
      status,
      selectConversation,
      createConversation,
      appendMessage,
      updateMessage,
      setStatus,
    ],
  );

  return value;
}

type Translate = (key: MessageKey) => string;

export function getConversationMemoryEntries(t: Translate): readonly string[] {
  return [t("drawer.memory.notes"), t("drawer.memory.goals"), t("drawer.memory.retention")];
}
