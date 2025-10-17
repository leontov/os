import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PendingAttachment, SerializedAttachment } from "../types/attachments";
import type { ChatMessage } from "../types/chat";
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
const BASE64_CHUNK_SIZE = 8192;

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  if (buffer.byteLength === 0) {
    return "";
  }

  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += BASE64_CHUNK_SIZE) {
    const slice = bytes.subarray(index, index + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
};

const serializeAttachments = async (attachments: PendingAttachment[]): Promise<SerializedAttachment[]> => {
  if (!attachments.length) {
    return [];
  }

  const serialized = await Promise.all(
    attachments.map(async ({ id, file }) => {
      let dataBase64: string | undefined;
      try {
        const buffer = await file.arrayBuffer();
        dataBase64 = arrayBufferToBase64(buffer);
      } catch (error) {
        console.error("Не удалось прочитать вложение", error);
      }

      return {
        id,
        name: file.name,
        size: file.size,
        type: file.type,
        dataBase64,
      } satisfies SerializedAttachment;
    }),
  );

  return serialized;
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
  attachments: PendingAttachment[];
  setDraft: (value: string) => void;
  setMode: (mode: string) => void;
  renameConversation: (title: string) => void;
  attachFiles: (files: File[]) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
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

  const attachFiles = useCallback((files: File[]) => {
    if (!files.length) {
      return;
    }
    setAttachments((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: crypto.randomUUID(),
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
      clearAttachments();
      return;
    }
    try {
      await kolibriBridge.reset();
      setMessages([]);
      setDraft("");
      setMode(MODE_OPTIONS[0]?.value ?? "neutral");
      setConversationId(crypto.randomUUID());
      setConversationTitle(DEFAULT_TITLE);
      clearAttachments();
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
  }, [bridgeReady, clearAttachments]);

  const sendMessage = useCallback(async () => {
    const content = draft.trim();
    if (!content && attachments.length === 0) {
      return;
    }
    if (isProcessing || !bridgeReady) {
      return;
    }

    const serializedAttachments = attachments.map(({ id, name, size, type }) => ({ id, name, size, type }));

    const pendingAttachments = attachments;
    let serializedAttachments: SerializedAttachment[] = [];
    try {
      serializedAttachments = await serializeAttachments(pendingAttachments);
    } catch (error) {
      console.error("Не удалось сериализовать вложения", error);
    }

    const timestamp = nowPair();
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: timestamp.display,
      isoTimestamp: timestamp.iso,
      attachments: serializedAttachments.length ? serializedAttachments : undefined,
    };
    if (serializedAttachments.length) {
      userMessage.attachments = serializedAttachments;
    }

    setMessages((prev) => [...prev, userMessage]);
    setDraft("");
    clearAttachments();
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
      const answer = await kolibriBridge.ask(prompt, mode, knowledgeContext, serializedAttachments);
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
  }, [attachments, bridgeReady, clearAttachments, draft, isProcessing, mode, refreshKnowledgeStatus]);

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
    attachments,
    setDraft,
    setMode,
    renameConversation,
    attachFiles,
    removeAttachment,
    clearAttachments,
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
