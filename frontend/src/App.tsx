import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "./components/Layout";
import Sidebar from "./components/Sidebar";
import WelcomeScreen from "./components/WelcomeScreen";
import ChatInput from "./components/ChatInput";
import ChatView from "./components/ChatView";
import type { ChatMessage, FeedbackRating } from "./types/chat";
import kolibriBridge from "./core/kolibri-bridge";
import { submitFeedback, type FeedbackSubmission } from "./core/feedback-client";

const STORAGE_KEY = "kolibri.chat.history";
const generateConversationId = (): string => {
  const cryptoObj = globalThis.crypto as Crypto | undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  return `conv-${Math.random().toString(36).slice(2)}`;
};

const App = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState("Быстрый ответ");
  const [isProcessing, setIsProcessing] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [conversationId, setConversationId] = useState(generateConversationId);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as { conversationId?: string; messages?: ChatMessage[] };
      const storedConversationId = parsed.conversationId ?? generateConversationId();
      if (Array.isArray(parsed.messages) && parsed.messages.length) {
        const normalisedMessages = parsed.messages.map((message) => ({
          ...message,
          conversationId: message.conversationId ?? storedConversationId,
        }));
        setMessages(normalisedMessages);
      }
      setConversationId(storedConversationId);
    } catch (error) {
      console.warn("Не удалось загрузить историю чата из localStorage", error);
    }
  }, []);

  useEffect(() => {
    try {
      const payload = JSON.stringify({ conversationId, messages });
      window.localStorage.setItem(STORAGE_KEY, payload);
    } catch (error) {
      console.warn("Не удалось сохранить историю чата", error);
    }
  }, [conversationId, messages]);

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
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            error instanceof Error
              ? `Не удалось инициализировать KolibriScript: ${error.message}`
              : "Не удалось инициализировать KolibriScript.",
          timestamp: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
          conversationId,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const handleSuggestionSelect = useCallback((prompt: string) => {
    setDraft(prompt);
  }, []);

  const resetConversation = useCallback(() => {
    if (!bridgeReady) {
      setMessages([]);
      setDraft("");
      setIsProcessing(false);
      setConversationId(generateConversationId());
      return;
    }

    void (async () => {
      try {
        await kolibriBridge.reset();
        setMessages([]);
        setDraft("");
        setConversationId(generateConversationId());
      } catch (error) {
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            error instanceof Error
              ? `Не удалось сбросить KolibriScript: ${error.message}`
              : "Не удалось сбросить KolibriScript.",
          timestamp: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
          conversationId,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } finally {
        setIsProcessing(false);
      }
    })();
  }, [bridgeReady, conversationId]);

  const sendMessage = useCallback(async () => {
    const content = draft.trim();
    if (!content || isProcessing || !bridgeReady) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      conversationId,
    };

    setMessages((prev) => [...prev, userMessage]);
    setDraft("");
    setIsProcessing(true);

    try {
      const answer = await kolibriBridge.ask(content, mode);
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: answer,
        timestamp: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
        conversationId,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          error instanceof Error
            ? `Не удалось получить ответ: ${error.message}`
            : "Не удалось получить ответ от ядра Колибри.",
        timestamp: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
        conversationId,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setIsProcessing(false);
    }
  }, [bridgeReady, conversationId, draft, isProcessing, mode]);

  const handleFeedbackSubmit = useCallback(
    (messageId: string, rating: FeedbackRating, comment?: string) => {
      const submittedAt = new Date().toISOString();
      const trimmedComment = comment?.trim() ? comment.trim() : undefined;
      let record: FeedbackSubmission | null = null;

      setMessages((prev) =>
        prev.map((message) => {
          if (message.id !== messageId) {
            return message;
          }
          const nextMessage: ChatMessage = {
            ...message,
            feedback: {
              rating,
              comment: trimmedComment,
              submittedAt,
            },
          };
          record = {
            conversationId,
            messageId,
            rating,
            comment: trimmedComment,
            response: nextMessage.content,
            submittedAt,
          };
          return nextMessage;
        }),
      );

      if (record) {
        void submitFeedback(record);
      }
    },
    [conversationId],
  );

  const content = useMemo(() => {
    if (!messages.length) {
      return <WelcomeScreen onSuggestionSelect={handleSuggestionSelect} />;
    }

    return (
      <ChatView
        messages={messages}
        isLoading={isProcessing}
        onFeedbackSubmit={handleFeedbackSubmit}
      />
    );
  }, [handleFeedbackSubmit, handleSuggestionSelect, isProcessing, messages]);

  return (
    <Layout sidebar={<Sidebar />}>
      <div className="flex-1">{content}</div>
      <ChatInput
        value={draft}
        mode={mode}
        isBusy={isProcessing || !bridgeReady}
        onChange={setDraft}
        onModeChange={setMode}
        onSubmit={sendMessage}
        onReset={resetConversation}
      />
    </Layout>
  );
};

export default App;
