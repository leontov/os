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
const DEFAULT_MODE = MODE_OPTIONS[0]?.value ?? "neutral";
const STORAGE_KEY = "kolibri.conversations";

interface StoredConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  draft: string;
  mode: string;
  createdAtIso: string;
  updatedAtIso: string;
}

interface PendingAttachment extends ChatAttachment {
  file?: File;
}

const createStoredConversation = (): StoredConversation => {
  const nowIso = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: DEFAULT_TITLE,
    messages: [],
    draft: "",
    mode: DEFAULT_MODE,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
};

const normalizeConversation = (value: unknown): StoredConversation | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<StoredConversation>;
  if (typeof candidate.id !== "string") {
    return null;
  }

  return {
    id: candidate.id,
    title: typeof candidate.title === "string" && candidate.title.trim() ? candidate.title : DEFAULT_TITLE,
    messages: Array.isArray(candidate.messages) ? (candidate.messages as ChatMessage[]) : [],
    draft: typeof candidate.draft === "string" ? candidate.draft : "",
    mode: typeof candidate.mode === "string" ? candidate.mode : DEFAULT_MODE,
    createdAtIso: typeof candidate.createdAtIso === "string" ? candidate.createdAtIso : new Date().toISOString(),
    updatedAtIso:
      typeof candidate.updatedAtIso === "string"
        ? candidate.updatedAtIso
        : typeof candidate.createdAtIso === "string"
          ? candidate.createdAtIso
          : new Date().toISOString(),
  };
};

const loadStoredConversations = (): StoredConversation[] => {
  if (typeof window === "undefined") {
    return [createStoredConversation()];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [createStoredConversation()];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [createStoredConversation()];
    }
    const normalized = parsed
      .map((item) => normalizeConversation(item))
      .filter((item): item is StoredConversation => item !== null);

    if (!normalized.length) {
      return [createStoredConversation()];
    }

    return normalized.sort((a, b) => new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime());
  } catch {
    return [createStoredConversation()];
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
  refreshKnowledgeStatus: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  attachFiles: (files: FileList | File[]) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
}

export const useKolibriChat = (): UseKolibriChatResult => {
  const storedConversationsRef = useRef<StoredConversation[] | null>(null);
  if (storedConversationsRef.current === null) {
    storedConversationsRef.current = loadStoredConversations();
  }
  const initialConversations = storedConversationsRef.current;
  const initialConversation = initialConversations[0] ?? createStoredConversation();

  const [conversations, setConversations] = useState<StoredConversation[]>(initialConversations);
  const [messages, setMessages] = useState<ChatMessage[]>(initialConversation.messages);
  const [draft, setDraft] = useState(initialConversation.draft);
  const [mode, setMode] = useState(initialConversation.mode);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [conversationId, setConversationId] = useState(initialConversation.id);
  const [conversationTitle, setConversationTitle] = useState<string>(initialConversation.title);
  const [knowledgeStatus, setKnowledgeStatus] = useState<Awaited<ReturnType<typeof fetchKnowledgeStatus>> | null>(null);
  const [knowledgeError, setKnowledgeError] = useState<string | undefined>();
  const [statusLoading, setStatusLoading] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  const knowledgeSearchAbortRef = useRef<AbortController | null>(null);

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

  const persistConversations = useCallback((next: StoredConversation[]) => {
    setConversations(next);
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }, []);

  const updateConversation = useCallback(
    (id: string, reducer: (conversation: StoredConversation) => StoredConversation | null) => {
      setConversations((prev) => {
        const index = prev.findIndex((item) => item.id === id);
        if (index === -1) {
          return prev;
        }
        const existing = prev[index];
        const nextConversation = reducer(existing);
        if (!nextConversation || nextConversation === existing) {
          return prev;
        }
        const nextList = [...prev];
        nextList.splice(index, 1);
        nextList.unshift(nextConversation);
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextList));
          } catch {
            // ignore storage errors
          }
        }
        return nextList;
      });
    },
    [],
  );

  const attachFiles = useCallback((files: FileList | File[]) => {
    const collection = Array.from(files ?? []);
    if (!collection.length) {
      return;
    }
    setAttachments((prev) => [
      ...prev,
      ...collection.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        file,
      })),
    ]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

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

  const conversationSummaries = useMemo<ConversationSummary[]>(() => {
    return conversations.map((conversation) => {
      const lastMessage = conversation.messages[conversation.messages.length - 1];
      let previewSource = lastMessage?.content?.trim() ?? "";
      if (!previewSource && lastMessage?.attachments?.length) {
        previewSource = `Вложения: ${lastMessage.attachments.map((item) => item.name).join(", ")}`;
      }
      if (!previewSource && conversation.draft.trim()) {
        previewSource = conversation.draft.trim();
      }
      const preview = previewSource
        ? previewSource.length > 80
          ? `${previewSource.slice(0, 77)}…`
          : previewSource
        : "Черновик пуст";

      return {
        id: conversation.id,
        title: conversation.title,
        preview,
        updatedAtIso: lastMessage?.isoTimestamp ?? conversation.updatedAtIso,
        createdAtIso: conversation.createdAtIso,
      };
    });
  }, [conversations]);

  const publicAttachments = useMemo<ChatAttachment[]>(() => {
    return attachments.map(({ id, name, size, type }) => ({ id, name, size, type }));
  }, [attachments]);

  return {
    messages,
    draft,
    mode,
    isProcessing,
    bridgeReady,
    conversationId,
    conversationTitle,
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
    refreshKnowledgeStatus,
    selectConversation,
    attachFiles,
    removeAttachment,
    clearAttachments,
  };
};

export default useKolibriChat;
