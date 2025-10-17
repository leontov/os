import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PendingAttachment, SerializedAttachment } from "../types/attachments";
import type { ChatMessage } from "../types/chat";
import type { KnowledgeSnippet } from "../types/knowledge";
import { fetchKnowledgeStatus, searchKnowledge } from "./knowledge";
import kolibriBridge from "./kolibri-bridge";
import { MODE_OPTIONS, findModeLabel } from "./modes";

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
  createdAtIso: string;
  updatedAtIso?: string;
}

interface ConversationRecord {
  id: string;
  title: string;
  messages: ChatMessage[];
  preview: string;
  draft: string;
  mode: string;
  createdAtIso: string;
  updatedAtIso: string;
}

const DEFAULT_TITLE = "Новая беседа";
const STORAGE_KEY = "kolibri:conversations";
const BASE64_CHUNK_SIZE = 8192;
const DEFAULT_MODE_VALUE = MODE_OPTIONS[0]?.value ?? "neutral";

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
  const firstUserMessage = messages.find((message) => message.role === "user" && message.content.trim());
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

const toSerializedAttachment = (value: unknown, index: number): SerializedAttachment | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" && raw.id ? raw.id : `attachment-${index}`;
  const name = typeof raw.name === "string" && raw.name ? raw.name : "Вложение";
  const size = typeof raw.size === "number" ? raw.size : Number(raw.size) || 0;
  const type = typeof raw.type === "string" && raw.type ? raw.type : "application/octet-stream";
  const dataBase64 = typeof raw.dataBase64 === "string" ? raw.dataBase64 : undefined;
  return { id, name, size, type, dataBase64 };
};

const toKnowledgeSnippet = (value: unknown, index: number): KnowledgeSnippet | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const content = typeof raw.content === "string" ? raw.content.trim() : "";
  if (!content) {
    return null;
  }
  const id = typeof raw.id === "string" && raw.id ? raw.id : `snippet-${index}`;
  const title = typeof raw.title === "string" && raw.title ? raw.title : "Источник";
  const source = typeof raw.source === "string" && raw.source ? raw.source : undefined;
  const scoreValue = typeof raw.score === "number" ? raw.score : Number(raw.score);
  const score = Number.isFinite(scoreValue) ? (scoreValue as number) : 0;
  return { id, title, content, source, score };
};

const toChatMessage = (value: unknown, index: number): ChatMessage | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const role = raw.role === "assistant" ? "assistant" : raw.role === "user" ? "user" : null;
  if (!role) {
    return null;
  }

  const id = typeof raw.id === "string" && raw.id ? raw.id : `message-${index}`;
  const content = typeof raw.content === "string" ? raw.content : "";
  const timestamp = typeof raw.timestamp === "string" && raw.timestamp ? raw.timestamp : nowPair().display;
  const isoTimestamp = typeof raw.isoTimestamp === "string" ? raw.isoTimestamp : undefined;
  const modeLabel = typeof raw.modeLabel === "string" ? raw.modeLabel : undefined;
  const modeValue = typeof raw.modeValue === "string" ? raw.modeValue : undefined;
  const contextError = typeof raw.contextError === "string" ? raw.contextError : undefined;

  let attachments: SerializedAttachment[] | undefined;
  if (Array.isArray(raw.attachments)) {
    attachments = raw.attachments
      .map((item, attachmentIndex) => toSerializedAttachment(item, attachmentIndex))
      .filter((item): item is SerializedAttachment => Boolean(item));
    if (!attachments.length) {
      attachments = undefined;
    }
  }

  let context: KnowledgeSnippet[] | undefined;
  if (Array.isArray(raw.context)) {
    context = raw.context
      .map((item, snippetIndex) => toKnowledgeSnippet(item, snippetIndex))
      .filter((item): item is KnowledgeSnippet => Boolean(item));
    if (!context.length) {
      context = undefined;
    }
  }

  return { id, role, content, timestamp, isoTimestamp, modeLabel, modeValue, attachments, context, contextError };
};

const createConversationRecord = (overrides?: Partial<ConversationRecord>): ConversationRecord => {
  const id = overrides?.id ?? crypto.randomUUID();
  const createdAtIso = overrides?.createdAtIso ?? new Date().toISOString();
  const updatedAtIso = overrides?.updatedAtIso ?? createdAtIso;

  return {
    id,
    title: overrides?.title ?? DEFAULT_TITLE,
    messages: overrides?.messages ?? [],
    preview: overrides?.preview ?? "",
    draft: overrides?.draft ?? "",
    mode: overrides?.mode ?? DEFAULT_MODE_VALUE,
    createdAtIso,
    updatedAtIso,
  };
};

const toConversationRecord = (value: unknown, index: number): ConversationRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" && raw.id ? raw.id : `conversation-${index}`;
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title : DEFAULT_TITLE;
  const draft = typeof raw.draft === "string" ? raw.draft : "";
  const mode = typeof raw.mode === "string" && raw.mode ? raw.mode : DEFAULT_MODE_VALUE;
  const createdAtIso = typeof raw.createdAtIso === "string" && raw.createdAtIso ? raw.createdAtIso : new Date().toISOString();
  const updatedAtIso = typeof raw.updatedAtIso === "string" && raw.updatedAtIso ? raw.updatedAtIso : createdAtIso;
  const preview = typeof raw.preview === "string" ? raw.preview : "";
  const messages = Array.isArray(raw.messages)
    ? raw.messages
        .map((message, messageIndex) => toChatMessage(message, messageIndex))
        .filter((message): message is ChatMessage => Boolean(message))
    : [];

  return {
    id,
    title,
    draft,
    mode,
    preview,
    messages,
    createdAtIso,
    updatedAtIso,
  };
};

const createPreviewFromMessages = (messages: ChatMessage[]): string => {
  if (!messages.length) {
    return "";
  }
  const last = messages[messages.length - 1];
  const trimmed = last.content.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed;
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

const loadInitialConversationState = (): { conversations: ConversationRecord[]; active: ConversationRecord } => {
  if (typeof window === "undefined") {
    const record = createConversationRecord();
    return { conversations: [record], active: record };
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        const records = parsed
          .map((item, index) => toConversationRecord(item, index))
          .filter((item): item is ConversationRecord => Boolean(item));
        if (records.length) {
          return { conversations: records, active: records[0]! };
        }
      }
    }
  } catch (error) {
    console.warn("Не удалось восстановить беседы из хранилища", error);
  }

  const fallback = createConversationRecord();
  return { conversations: [fallback], active: fallback };
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
}

const useKolibriChat = (): UseKolibriChatResult => {
  const { conversations: initialConversations, active: initialActiveConversation } = loadInitialConversationState();

  const [conversations, setConversations] = useState<ConversationRecord[]>(initialConversations);
  const [messages, setMessages] = useState<ChatMessage[]>(initialActiveConversation.messages);
  const [draft, setDraft] = useState(initialActiveConversation.draft ?? "");
  const [mode, setMode] = useState(initialActiveConversation.mode ?? DEFAULT_MODE_VALUE);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [conversationId, setConversationId] = useState(initialActiveConversation.id);
  const [conversationTitle, setConversationTitle] = useState(initialActiveConversation.title);
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
    setMessages([]);
    setDraft("");
    setMode(DEFAULT_MODE_VALUE);
    setAttachments([]);
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

  useEffect(() => {
    if (conversationTitle !== DEFAULT_TITLE) {
      return;
    }
    const nextTitle = deriveTitleFromMessages(messages);
    if (nextTitle !== DEFAULT_TITLE) {
      setConversationTitle(nextTitle);
    }
  }, [conversationTitle, messages]);

  useEffect(() => {
    const preview = createPreviewFromMessages(messages);
    const lastIso = findLastIsoTimestamp(messages);
    const updatedAtIso = lastIso ?? (messages.length ? new Date().toISOString() : undefined);

    setConversations((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === conversationId);
      const fallbackIso = updatedAtIso ?? (existingIndex >= 0 ? prev[existingIndex].updatedAtIso : new Date().toISOString());

      if (existingIndex === -1) {
        const record = createConversationRecord({
          id: conversationId,
          title: conversationTitle,
          messages,
          preview,
          createdAtIso: messages[0]?.isoTimestamp ?? new Date().toISOString(),
          updatedAtIso: fallbackIso,
          draft,
          mode,
        });
        return [record, ...prev];
      }

      const existing = prev[existingIndex];
      const shouldUpdate =
        existing.title !== conversationTitle ||
        existing.preview !== preview ||
        existing.messages !== messages ||
        existing.draft !== draft ||
        existing.mode !== mode ||
        existing.updatedAtIso !== fallbackIso;

      if (!shouldUpdate) {
        return prev;
      }

      const updated: ConversationRecord = {
        ...existing,
        title: conversationTitle,
        messages,
        preview,
        updatedAtIso: fallbackIso,
        draft,
        mode,
      };

      const next = [...prev];
      next.splice(existingIndex, 1);
      next.unshift(updated);
      return next;
    });
  }, [conversationId, conversationTitle, draft, messages, mode]);

  const resetConversation = useCallback(async () => {
    knowledgeSearchAbortRef.current?.abort();
    knowledgeSearchAbortRef.current = null;
    clearAttachments();

    if (!bridgeReady) {
      beginNewConversation();
      setIsProcessing(false);
      return;
    }

    setIsProcessing(true);
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
  }, [beginNewConversation, bridgeReady, clearAttachments]);

  const sendMessage = useCallback(async () => {
    const content = draft.trim();
    if (!content && attachments.length === 0) {
      return;
    }
    if (isProcessing || !bridgeReady) {
      return;
    }

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
        context: knowledgeContext.length ? knowledgeContext : undefined,
        contextError,
      };
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

  const selectConversation = useCallback(
    (id: string) => {
      const record = conversationsRef.current.find((item) => item.id === id);
      if (!record) {
        return;
      }
      setConversationId(record.id);
      setConversationTitle(record.title);
      setMessages(record.messages);
      setDraft(record.draft);
      setMode(record.mode);
      setAttachments([]);
    },
    [],
  );

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
        preview: conversation.preview,
        createdAtIso: conversation.createdAtIso,
        updatedAtIso: conversation.updatedAtIso,
      })),
    [conversations],
  );

  const createConversation = useCallback(async () => {
    await resetConversation();
  }, [resetConversation]);

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
  };
};

export default useKolibriChat;
