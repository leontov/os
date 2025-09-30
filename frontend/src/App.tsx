import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "./components/Layout";
import Sidebar from "./components/Sidebar";
import WelcomeScreen from "./components/WelcomeScreen";
import ChatInput from "./components/ChatInput";
import ChatView from "./components/ChatView";
import type { ChatMessage } from "./types/chat";
import kolibriBridge from "./core/kolibri-bridge";

type PrivacyConsent = "accepted" | "declined" | "unknown";

const PRIVACY_STORAGE_KEY = "kolibri:privacy-consent";

const App = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState("Быстрый ответ");
  const [isProcessing, setIsProcessing] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState<PrivacyConsent>(() => {
    if (typeof window === "undefined") {
      return "declined";
    }
    const stored = window.localStorage.getItem(PRIVACY_STORAGE_KEY);
    return stored === "accepted" || stored === "declined" ? stored : "unknown";
  });

  useEffect(() => {
    if (privacyConsent !== "unknown") {
      return;
    }
    if (typeof window === "undefined") {
      setPrivacyConsent("declined");
      return;
    }
    const consentText =
      "Kolibri OS собирает обезличенные события об использовании интерфейса для улучшения продукта. " +
      "Согласны на сбор агрегированных данных без содержания сообщений?";
    const accepted = window.confirm(consentText);
    const status: PrivacyConsent = accepted ? "accepted" : "declined";
    window.localStorage.setItem(PRIVACY_STORAGE_KEY, status);
    setPrivacyConsent(status);
    if (accepted) {
      console.info("[kolibri][privacy] Пользователь согласился на анонимное логирование действий.");
    } else {
      console.info("[kolibri][privacy] Пользователь отклонил аналитику; логирование отключено.");
    }
  }, [privacyConsent]);

  const logUserAction = useCallback(
    (event: string, metadata: Record<string, unknown> = {}) => {
      if (privacyConsent !== "accepted") {
        return;
      }
      const safeMetadata = {
        ...metadata,
        timestamp: new Date().toISOString(),
      };
      console.info("[kolibri][user-action]", event, safeMetadata);
    },
    [privacyConsent],
  );

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
        };
        setMessages((prev) => [...prev, assistantMessage]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSuggestionSelect = useCallback(
    (prompt: string) => {
      setDraft(prompt);
      logUserAction("suggestion_selected", { suggestionLength: prompt.length });
    },
    [logUserAction],
  );

  const resetConversation = useCallback(() => {
    if (!bridgeReady) {
      setMessages([]);
      setDraft("");
      setIsProcessing(false);
      logUserAction("conversation_reset", { reason: "bridge-unavailable" });
      return;
    }

    void (async () => {
      try {
        await kolibriBridge.reset();
        setMessages([]);
        setDraft("");
        logUserAction("conversation_reset", { reason: "user-request" });
      } catch (error) {
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            error instanceof Error
              ? `Не удалось сбросить KolibriScript: ${error.message}`
              : "Не удалось сбросить KolibriScript.",
          timestamp: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        logUserAction("conversation_reset_failed", {
          reason: error instanceof Error ? error.name : "unknown",
        });
      } finally {
        setIsProcessing(false);
      }
    })();
  }, [bridgeReady, logUserAction]);

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
    };

    setMessages((prev) => [...prev, userMessage]);
    setDraft("");
    setIsProcessing(true);
    logUserAction("message_sent", { characters: content.length, mode });

    try {
      const answer = await kolibriBridge.ask(content, mode);
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: answer,
        timestamp: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      logUserAction("response_generated", { characters: answer.length, mode });
    } catch (error) {
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          error instanceof Error
            ? `Не удалось получить ответ: ${error.message}`
            : "Не удалось получить ответ от ядра Колибри.",
        timestamp: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      logUserAction("response_failed", {
        reason: error instanceof Error ? error.name : "unknown",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [bridgeReady, draft, isProcessing, mode, logUserAction]);

  const handleModeChange = useCallback(
    (nextMode: string) => {
      setMode(nextMode);
      logUserAction("mode_changed", { mode: nextMode });
    },
    [logUserAction],
  );

  const content = useMemo(() => {
    if (!messages.length) {
      return <WelcomeScreen onSuggestionSelect={handleSuggestionSelect} />;
    }

    return <ChatView messages={messages} isLoading={isProcessing} />;
  }, [handleSuggestionSelect, isProcessing, messages]);

  return (
    <Layout sidebar={<Sidebar />}>
      <div className="flex-1">{content}</div>
      <ChatInput
        value={draft}
        mode={mode}
        isBusy={isProcessing || !bridgeReady}
        onChange={setDraft}
        onModeChange={handleModeChange}
        onSubmit={sendMessage}
        onReset={resetConversation}
      />
    </Layout>
  );
};

export default App;
