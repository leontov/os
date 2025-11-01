import { useCallback, useMemo, useState } from "react";
import type { ConversationListItem } from "../../components/layout/Sidebar";
import type { MessageBlock } from "../../components/chat/Message";
import type { Translate } from "../../app/i18n";

export type ConversationStatus =
  | "idle"
  | "loading"
  | "error"
  | "pending"
  | "delivering"
  | "failed";

type ConversationSeed = ConversationListItem & { profileId: string };

export type ConversationRegistry = Record<string, ConversationListItem[]>;
type ConversationMessages = Record<string, MessageBlock[]>;
type ConversationProfiles = Record<string, string>;

const now = Date.now();

const conversationSeeds: ReadonlyArray<ConversationSeed> = [
  { id: "1", profileId: "product", title: "Гайд по запуску релиза", updatedAt: "сегодня", folder: "Проекты" },
  { id: "2", profileId: "product", title: "Daily standup", updatedAt: "вчера" },
  { id: "3", profileId: "product", title: "Подготовка к демо Kolibri", updatedAt: "2 дня назад", folder: "Проекты" },
  { id: "4", profileId: "support", title: "Обновление базы знаний", updatedAt: "2 часа назад", folder: "Клиенты" },
  { id: "5", profileId: "support", title: "Эскалация INC-2043", updatedAt: "45 минут назад" },
];

const messageSeeds: Readonly<Record<string, MessageBlock[]>> = {
  "1": [
    {
      id: "m1",
      role: "assistant",
      authorLabel: "Колибри",
      content:
        "Привет! Я помогу тебе собрать отчет о прогрессе. Расскажи, какие ключевые события произошли, и я подготовлю резюме.",
      createdAt: new Date(now - 6 * 60 * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      timestamp: now - 6 * 60 * 1000,
    },
    {
      id: "m2",
      role: "user",
      authorLabel: "Вы",
      content: "Нам удалось завершить подготовку дизайн-системы и внедрить новую панель метрик.",
      createdAt: new Date(now - 5 * 60 * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      timestamp: now - 5 * 60 * 1000,
    },
  ],
  "4": [
    {
      id: "m3",
      role: "assistant",
      authorLabel: "Колибри",
      content:
        "Собрала список статей, которые чаще всего запрашивают клиенты. Предлагаю обновить раздел с инструкциями по API.",
      createdAt: new Date(now - 15 * 60 * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      timestamp: now - 15 * 60 * 1000,
    },
  ],
};

const initialConversationsByProfile: ConversationRegistry = conversationSeeds.reduce(
  (registry, seed) => {
    const entries = registry[seed.profileId] ?? [];
    registry[seed.profileId] = [...entries, { id: seed.id, title: seed.title, updatedAt: seed.updatedAt, folder: seed.folder }];
    return registry;
  },
  {} as ConversationRegistry,
);

const initialConversationProfiles: ConversationProfiles = conversationSeeds.reduce(
  (accumulator, seed) => ({ ...accumulator, [seed.id]: seed.profileId }),
  {} as ConversationProfiles,
);

const initialMessages: ConversationMessages = Object.entries(messageSeeds).reduce(
  (registry, [conversationId, entries]) => ({ ...registry, [conversationId]: entries }),
  {} as ConversationMessages,
);

export function getConversationsForProfile(
  registry: ConversationRegistry,
  profileId: string,
): ReadonlyArray<ConversationListItem> {
  const items = registry[profileId] ?? [];
  return items.length ? [...items] : [];
}

export function getConversationCountByProfile(registry: ConversationRegistry): Record<string, number> {
  return Object.entries(registry).reduce<Record<string, number>>((accumulator, [profileId, items]) => {
    accumulator[profileId] = items.length;
    return accumulator;
  }, {});
}

export interface ConversationState {
  conversations: ReadonlyArray<ConversationListItem>;
  conversationsByProfile: ConversationRegistry;
  conversationCounts: Record<string, number>;
  activeConversation: string | null;
  messages: ConversationMessages;
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
  activeProfileId: string,
): ConversationState {
  const [conversationsByProfile, setConversationsByProfile] = useState<ConversationRegistry>(initialConversationsByProfile);
  const [conversationProfiles, setConversationProfiles] = useState<ConversationProfiles>(initialConversationProfiles);
  const [activeConversation, setActiveConversation] = useState<string | null>(() => {
    const available = initialConversationsByProfile[activeProfileId] ?? [];
    return available[0]?.id ?? null;
  });
  const [messages, setMessages] = useState<ConversationMessages>(() => {
    if (Object.keys(initialMessages).length > 0) {
      return initialMessages;
    }
    const firstConversation = initialConversationsByProfile[activeProfileId]?.[0]?.id;
    return firstConversation ? { [firstConversation]: [] } : {};
  });
  const [status, setStatus] = useState<ConversationStatus>("idle");

  useEffect(() => {
    const available = conversationsByProfile[activeProfileId] ?? [];
    if (!available.length) {
      setActiveConversation(null);
      return;
    }
    if (!available.some((conversation) => conversation.id === activeConversation)) {
      setActiveConversation(available[0].id);
    }
  }, [activeProfileId, conversationsByProfile, activeConversation]);

  const conversations = useMemo(
    () => getConversationsForProfile(conversationsByProfile, activeProfileId),
    [conversationsByProfile, activeProfileId],
  );

  const conversationCounts = useMemo(
    () => getConversationCountByProfile(conversationsByProfile),
    [conversationsByProfile],
  );

  const selectConversation = useCallback(
    (id: string) => {
      if (conversationProfiles[id] !== activeProfileId) {
        return;
      }
      setActiveConversation(id);
      if (!messages[id]) {
        setStatus("loading");
        window.setTimeout(() => {
          setMessages((current) => ({ ...current, [id]: [] }));
          setStatus("idle");
        }, 450);
      }
    },
    [activeProfileId, conversationProfiles, messages],
  );

  const createConversation = useCallback(() => {
    if (!activeProfileId) {
      return;
    }
    const id = crypto.randomUUID();
    const entry: ConversationListItem = { id, title: defaultConversationTitle, updatedAt: justNowLabel };
    setConversationsByProfile((current) => {
      const items = current[activeProfileId] ?? [];
      return { ...current, [activeProfileId]: [entry, ...items] };
    });
    setConversationProfiles((current) => ({ ...current, [id]: activeProfileId }));
    setMessages((current) => ({ ...current, [id]: [] }));
    setActiveConversation(id);
  }, [activeProfileId, defaultConversationTitle, justNowLabel]);

  const appendMessage = useCallback(
    (id: string, message: MessageBlock) => {
      setMessages((current) => {
        const next = [...(current[id] ?? []), message];
        return { ...current, [id]: next };
      });
      setConversationsByProfile((current) => {
        const profileId = conversationProfiles[id];
        if (!profileId) {
          return current;
        }
        const entries = current[profileId] ?? [];
        const updated = entries.map((conversation) =>
          conversation.id === id
            ? { ...conversation, updatedAt: justNowLabel, title: conversation.title }
            : conversation,
        );
        return { ...current, [profileId]: updated };
      });
    },
    [conversationProfiles, justNowLabel],
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
      conversationsByProfile,
      conversationCounts,
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
      conversationsByProfile,
      conversationCounts,
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

export function getConversationMemoryEntries(t: Translate): readonly string[] {
  return [t("drawer.memory.notes"), t("drawer.memory.goals"), t("drawer.memory.retention")];
}
