import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatAttachment, ChatMessage } from "../types/chat";
import type { KnowledgeSnippet } from "../types/knowledge";
import { fetchKnowledgeStatus, searchKnowledge } from "./knowledge";
import kolibriBridge from "./kolibri-bridge";
import { findModeLabel, MODE_OPTIONS } from "./modes";

export interface ConversationMetrics {
  userMessages: number;
  assistantMessages: number;
  knowledgeReferences: number;
  lastUpdatedIso?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  preview: string;
  updatedAtIso?: string;
  createdAtIso: string;
}

const DEFAULT_TITLE = "Новая беседа";
const DEFAULT_MODE_VALUE = MODE_OPTIONS[0]?.value ?? "neutral";
const STORAGE_KEY = "kolibri:chat:conversations";
const PREVIEW_MAX_LENGTH = 80;

interface ConversationRecord {
  id: string;
  title: string;
  createdAtIso: string;
  updatedAtIso: string;
  preview: string;
  messages: ChatMessage[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAtIso: string;
  updatedAtIso: string;
  preview: string;
}

const createConversationId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 12);
};

const normalisePreview = (value: string): string => value.replace(/\s+/g, " ").trim();

const createPreviewFromMessages = (messages: ChatMessage[]): string => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = normalisePreview(messages[index]?.content ?? "");
    if (candidate) {
      return candidate.length > PREVIEW_MAX_LENGTH
        ? `${candidate.slice(0, PREVIEW_MAX_LENGTH - 1)}…`
        : candidate;
    }
  }
  return "";
};

const findLastIsoTimestamp = (messages: ChatMessage[]): string | undefined => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const iso = messages[index]?.isoTimestamp;
    if (iso) {
      return iso;
    }
  }
  return undefined;
};

const sanitiseMessage = (candidate: unknown): ChatMessage | null => {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  const raw = candidate as Partial<ChatMessage> & Record<string, unknown>;
  if (typeof raw.id !== "string" || typeof raw.role !== "string" || typeof raw.content !== "string") {
    return null;
  }
  if (raw.role !== "assistant" && raw.role !== "user") {
    return null;
  }
  if (typeof raw.timestamp !== "string") {
    return null;
  }
  const message: ChatMessage = {
    id: raw.id,
    role: raw.role,
    content: raw.content,
    timestamp: raw.timestamp,
  };
  if (typeof raw.isoTimestamp === "string") {
    message.isoTimestamp = raw.isoTimestamp;
  }
  if (typeof raw.modeLabel === "string") {
    message.modeLabel = raw.modeLabel;
  }
  if (typeof raw.modeValue === "string") {
    message.modeValue = raw.modeValue;
  }
  if (Array.isArray(raw.context)) {
    message.context = raw.context as KnowledgeSnippet[];
  }
  if (typeof raw.contextError === "string") {
    message.contextError = raw.contextError;
  }
  return message;
};

const createConversationRecord = (overrides: Partial<ConversationRecord> & { messages?: ChatMessage[] } = {}): ConversationRecord => {
  const messages = overrides.messages ?? [];
  const createdAtIso = overrides.createdAtIso ?? new Date().toISOString();
  const lastIso = findLastIsoTimestamp(messages);
  const updatedAtIso = overrides.updatedAtIso ?? lastIso ?? createdAtIso;
  const preview = overrides.preview ?? createPreviewFromMessages(messages);
  return {
    id: overrides.id ?? createConversationId(),
    title: overrides.title?.trim() ? overrides.title : DEFAULT_TITLE,
    createdAtIso,
    updatedAtIso,
    preview,
    messages,
  };
};

const loadInitialConversationState = (): { conversations: ConversationRecord[]; active: ConversationRecord } => {
  const fallback = createConversationRecord();
  if (typeof window === "undefined") {
    return { conversations: [fallback], active: fallback };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { conversations: [fallback], active: fallback };
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return { conversations: [fallback], active: fallback };
    }

    const conversations: ConversationRecord[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const rawConversation = item as Partial<ConversationRecord> & { messages?: unknown };
      const messages = Array.isArray(rawConversation.messages)
        ? (rawConversation.messages
            .map((message) => sanitiseMessage(message))
            .filter((value): value is ChatMessage => Boolean(value)) ?? [])
        : [];
      const conversation = createConversationRecord({
        id: typeof rawConversation.id === "string" ? rawConversation.id : undefined,
        title: typeof rawConversation.title === "string" ? rawConversation.title : undefined,
        createdAtIso: typeof rawConversation.createdAtIso === "string" ? rawConversation.createdAtIso : undefined,
        updatedAtIso: typeof rawConversation.updatedAtIso === "string" ? rawConversation.updatedAtIso : undefined,
        preview: typeof rawConversation.preview === "string" ? rawConversation.preview : undefined,
        messages,
      });
      conversations.push(conversation);
    }

    if (!conversations.length) {
      return { conversations: [fallback], active: fallback };
    }

    conversations.sort((first, second) => {
      const firstTime = Date.parse(first.updatedAtIso);
      const secondTime = Date.parse(second.updatedAtIso);
      if (Number.isNaN(firstTime) && Number.isNaN(secondTime)) {
        return 0;
      }
      if (Number.isNaN(firstTime)) {
        return 1;
      }
      if (Number.isNaN(secondTime)) {
        return -1;
      }
      return secondTime - firstTime;
    });

    return { conversations, active: conversations[0] };
  } catch (error) {
    console.warn("Failed to load conversation history", error);
    return { conversations: [fallback], active: fallback };
  }
};

const formatPromptWithContext = (question: string, context: KnowledgeSnippet[]): string => {
  if (!context.length) {
    return question;
  }

  const contextBlocks = context.map((snippet, index) => {
    const title = snippet.title ? ` (${snippet.title})` : "";
    return [`Источник ${index + 1}${title}:`, snippet.content].join("\n");
  });

  return [`Контекст:`, ...contextBlocks, "", `Вопрос пользователя: ${question}`].join("\n");
};

const deriveTitleFromMessages = (messages: ChatMessage[]): string => {
  const firstUserMessage = messages.find((message) => message.role === "user");
  if (!firstUserMessage) {
    return DEFAULT_TITLE;
  }

  const words = firstUserMessage.content.trim().split(/\s+/).slice(0, 8);
  if (!words.length) {
    return DEFAULT_TITLE;
  }

  const title = words.join(" ");
  return title.length > 60 ? `${title.slice(0, 57)}…` : title;
};

const nowPair = () => {
  const now = new Date();
  return {
    display: now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
    iso: now.toISOString(),
  };
};

interface UseKolibriChatResult {
  messages: ChatMessage[];
  draft: string;
  mode: string;
  isProcessing: boolean;
  bridgeReady: boolean;
  conversationId: string;
  conversationTitle: string;
  conversationSummaries: ConversationSummary[];
  knowledgeStatus: Awaited<ReturnType<typeof fetchKnowledgeStatus>> | null;
  knowledgeError?: string;
  statusLoading: boolean;
  latestAssistantMessage?: ChatMessage;
  metrics: ConversationMetrics;
  conversations: ConversationSummary[];
  attachments: ChatAttachment[];
  setDraft: (value: string) => void;
  setMode: (mode: string) => void;
  renameConversation: (title: string) => void;
  sendMessage: () => Promise<void>;
  resetConversation: () => Promise<void>;
  selectConversation: (id: string) => void;
  createConversation: () => Promise<void>;
  refreshKnowledgeStatus: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  attachFiles: (files: FileList | File[]) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
}

export const useKolibriChat = (): UseKolibriChatResult => {
  const { conversations: initialConversations, active: initialActiveConversation } = loadInitialConversationState();

  const [conversations, setConversations] = useState<ConversationRecord[]>(initialConversations);
  const [messages, setMessages] = useState<ChatMessage[]>(initialActiveConversation.messages);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState(DEFAULT_MODE_VALUE);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [conversationId, setConversationId] = useState<string>(initialActiveConversation.id);
  const [conversationTitle, setConversationTitle] = useState<string>(initialActiveConversation.title);
  const [knowledgeStatus, setKnowledgeStatus] = useState<Awaited<ReturnType<typeof fetchKnowledgeStatus>> | null>(null);
  const [knowledgeError, setKnowledgeError] = useState<string | undefined>();
  const [statusLoading, setStatusLoading] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  const knowledgeSearchAbortRef = useRef<AbortController | null>(null);
  const conversationsRef = useRef<ConversationRecord[]>(initialConversations);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch (error) {
      console.warn("Failed to persist conversation history", error);
    }
  }, [conversations]);

  const beginNewConversation = useCallback((): ConversationRecord => {
    const record = createConversationRecord();
    setConversations((prev) => [record, ...prev]);
    setConversationId(record.id);
    setConversationTitle(record.title);
    setMessages(record.messages);
    setDraft("");
    setMode(DEFAULT_MODE_VALUE);
    return record;
  }, []);

  useEffect(() => {
    let cancelled = false;
    kolibriBridge.ready
      .then(() => {
        if (!cancelled) {
          setBridgeReady(true);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const moment = nowPair();
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            error instanceof Error
              ? `Не удалось инициализировать KolibriScript: ${error.message}`
              : "Не удалось инициализировать KolibriScript.",
          timestamp: moment.display,
          isoTimestamp: moment.iso,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshKnowledgeStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const status = await fetchKnowledgeStatus();
      setKnowledgeStatus(status);
      setKnowledgeError(undefined);
    } catch (error) {
      setKnowledgeError(
        error instanceof Error && error.message ? error.message : "Не удалось получить состояние знаний.",
      );
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshKnowledgeStatus();
  }, [refreshKnowledgeStatus]);

  useEffect(() => {
    if (conversationTitle !== DEFAULT_TITLE) {
      return;
    }
    setConversationTitle(deriveTitleFromMessages(messages));
  }, [conversationTitle, messages]);

  useEffect(() => {
    const preview = createPreviewFromMessages(messages);
    const lastIso = findLastIsoTimestamp(messages);
    setConversations((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === conversationId);
      if (existingIndex === -1) {
        const fallbackIso = lastIso ?? new Date().toISOString();
        const record = createConversationRecord({
          id: conversationId,
          title: conversationTitle,
          createdAtIso: fallbackIso,
          updatedAtIso: fallbackIso,
          preview,
          messages,
        });
        return [record, ...prev];
      }

      const existing = prev[existingIndex];
      const nextUpdatedAtIso = lastIso ?? (messages.length ? new Date().toISOString() : existing.updatedAtIso);
      const shouldUpdate =
        existing.title !== conversationTitle ||
        existing.preview !== preview ||
        existing.messages !== messages ||
        existing.updatedAtIso !== nextUpdatedAtIso;

      if (!shouldUpdate) {
        return prev;
      }

      const updated: ConversationRecord = {
        ...existing,
        title: conversationTitle,
        preview,
        messages,
        updatedAtIso: nextUpdatedAtIso,
      };

      const next = [...prev];
      const shouldReorder =
        existing.messages !== messages || existing.preview !== preview || existing.updatedAtIso !== nextUpdatedAtIso;

      if (shouldReorder) {
        next.splice(existingIndex, 1);
        next.unshift(updated);
      } else {
        next[existingIndex] = updated;
      }

      return next;
    });
  }, [conversationId, conversationTitle, messages]);

  const resetConversation = useCallback(async () => {
    knowledgeSearchAbortRef.current?.abort();
    knowledgeSearchAbortRef.current = null;

    if (!bridgeReady) {
      beginNewConversation();
      setIsProcessing(false);
      return;
    }
    try {
      await kolibriBridge.reset();
      beginNewConversation();
    } catch (error) {
      const moment = nowPair();
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          error instanceof Error
            ? `Не удалось сбросить KolibriScript: ${error.message}`
            : "Не удалось сбросить KolibriScript.",
        timestamp: moment.display,
        isoTimestamp: moment.iso,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setIsProcessing(false);
    }
  }, [beginNewConversation, bridgeReady]);

  const selectConversation = useCallback(
    (targetId: string) => {
      const candidate = conversationsRef.current.find((item) => item.id === targetId);
      if (!candidate) {
        return;
      }
      knowledgeSearchAbortRef.current?.abort();
      knowledgeSearchAbortRef.current = null;
      setConversationId(candidate.id);
      setConversationTitle(candidate.title);
      setMessages(candidate.messages);
      setDraft("");
      setIsProcessing(false);
    },
    [setConversationId, setConversationTitle, setMessages, setDraft, setIsProcessing],
  );

  const sendMessage = useCallback(async () => {
    const content = draft.trim();
    if (!content && attachments.length === 0) {
      return;
    }
    if (isProcessing || !bridgeReady) {
      return;
    }

    const serializedAttachments = attachments.map(({ id, name, size, type }) => ({ id, name, size, type }));

    const timestamp = nowPair();
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: timestamp.display,
      isoTimestamp: timestamp.iso,
      attachments: serializedAttachments.length ? serializedAttachments : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setDraft("");
    setAttachments([]);
    setIsProcessing(true);

    knowledgeSearchAbortRef.current?.abort();
    const controller = new AbortController();
    knowledgeSearchAbortRef.current = controller;

    let knowledgeContext: KnowledgeSnippet[] = [];
    let contextError: string | undefined;
    let aborted = false;

    try {
      knowledgeContext = await searchKnowledge(content || "", { topK: 3, signal: controller.signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        aborted = true;
      } else {
        contextError =
          error instanceof Error && error.message ? error.message : "Не удалось получить контекст из памяти.";
      }
    } finally {
      knowledgeSearchAbortRef.current = null;
    }

    if (aborted) {
      setIsProcessing(false);
      void refreshKnowledgeStatus();
      return;
    }

    const prompt = knowledgeContext.length ? formatPromptWithContext(content || "", knowledgeContext) : content;

    try {
      const answer = await kolibriBridge.ask(prompt, mode, knowledgeContext);
      const moment = nowPair();
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: answer,
        timestamp: moment.display,
        isoTimestamp: moment.iso,
        modeValue: mode,
        modeLabel: findModeLabel(mode),
      };
      if (knowledgeContext.length) {
        assistantMessage.context = knowledgeContext;
      }
      if (contextError) {
        assistantMessage.contextError = contextError;
      }
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const moment = nowPair();
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          error instanceof Error
            ? `Не удалось получить ответ: ${error.message}`
            : "Не удалось получить ответ от ядра Колибри.",
        timestamp: moment.display,
        isoTimestamp: moment.iso,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setIsProcessing(false);
      void refreshKnowledgeStatus();
    }
  }, [attachments, bridgeReady, draft, isProcessing, mode, refreshKnowledgeStatus]);

  const resetConversation = useCallback(async () => {
    knowledgeSearchAbortRef.current?.abort();
    knowledgeSearchAbortRef.current = null;
    clearAttachments();

    const startNewConversation = () => {
      const freshConversation = createStoredConversation();
      persistConversations([freshConversation, ...conversations.filter((item) => item.id !== freshConversation.id)]);
      setConversationId(freshConversation.id);
      setMessages([]);
      setDraft("");
      setMode(freshConversation.mode);
      setConversationTitle(freshConversation.title);
    };

    if (!bridgeReady) {
      startNewConversation();
      setIsProcessing(false);
      return;
    }

    try {
      await kolibriBridge.reset();
      startNewConversation();
    } catch (error) {
      const moment = nowPair();
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          error instanceof Error
            ? `Не удалось сбросить KolibriScript: ${error.message}`
            : "Не удалось сбросить KolibriScript.",
        timestamp: moment.display,
        isoTimestamp: moment.iso,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setIsProcessing(false);
    }
  }, [bridgeReady, clearAttachments, conversations, persistConversations]);

  const selectConversation = useCallback(
    async (id: string) => {
      if (id === conversationId) {
        return;
      }
      const target = conversations.find((item) => item.id === id);
      if (!target) {
        return;
      }

      knowledgeSearchAbortRef.current?.abort();
      knowledgeSearchAbortRef.current = null;
      clearAttachments();
      setIsProcessing(false);

      if (bridgeReady) {
        try {
          await kolibriBridge.reset();
        } catch {
          // ignore reset errors when switching conversations
        }
      }

      setConversationId(target.id);
      setMessages(target.messages);
      setDraft(target.draft);
      setMode(target.mode);
      setConversationTitle(target.title);
    },
    [bridgeReady, clearAttachments, conversationId, conversations],
  );

  const renameConversation = useCallback((nextTitle: string) => {
    const trimmed = nextTitle.trim();
    setConversationTitle(trimmed ? trimmed.slice(0, 80) : DEFAULT_TITLE);
  }, []);

  useEffect(() => {
    updateConversation(conversationId, (existing) => {
      const hasMessagesChanged = existing.messages !== messages;
      const hasDraftChanged = existing.draft !== draft;
      const hasModeChanged = existing.mode !== mode;
      const hasTitleChanged = existing.title !== conversationTitle;

      if (!hasMessagesChanged && !hasDraftChanged && !hasModeChanged && !hasTitleChanged) {
        return existing;
      }

      const updatedAtIso = hasMessagesChanged ? new Date().toISOString() : existing.updatedAtIso;

      return {
        ...existing,
        messages,
        draft,
        mode,
        title: conversationTitle,
        updatedAtIso,
      };
    });
  }, [conversationId, conversationTitle, draft, messages, mode, updateConversation]);

  const latestAssistantMessage = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "assistant") {
        return message;
      }
    }
    return undefined;
  }, [messages]);

  const metrics = useMemo<ConversationMetrics>(() => {
    let userMessages = 0;
    let assistantMessages = 0;
    let knowledgeReferences = 0;
    let lastUpdatedIso: string | undefined;

    for (const message of messages) {
      if (message.role === "user") {
        userMessages += 1;
      } else {
        assistantMessages += 1;
        if (message.context?.length) {
          knowledgeReferences += 1;
        }
      }
      if (message.isoTimestamp) {
        lastUpdatedIso = message.isoTimestamp;
      }
    }

    return {
      userMessages,
      assistantMessages,
      knowledgeReferences,
      lastUpdatedIso,
    };
  }, [messages]);

  const conversationSummaries = useMemo<ConversationSummary[]>(
    () =>
      conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        createdAtIso: conversation.createdAtIso,
        updatedAtIso: conversation.updatedAtIso,
        preview: conversation.preview,
      })),
    [conversations],
  );

  const createConversation = useCallback(() => resetConversation(), [resetConversation]);

  return {
    messages,
    draft,
    mode,
    isProcessing,
    bridgeReady,
    conversationId,
    conversationTitle,
    conversationSummaries,
    knowledgeStatus,
    knowledgeError,
    statusLoading,
    latestAssistantMessage,
    metrics,
    conversations: conversationSummaries,
    attachments: publicAttachments,
    setDraft,
    setMode,
    renameConversation,
    sendMessage,
    resetConversation,
    selectConversation,
    createConversation,
    refreshKnowledgeStatus,
    selectConversation,
    attachFiles,
    removeAttachment,
    clearAttachments,
  };
};

export default useKolibriChat;
