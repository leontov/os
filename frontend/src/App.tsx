import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "./components/Layout";
import Sidebar from "./components/Sidebar";
import WelcomeScreen from "./components/WelcomeScreen";
import ChatInput from "./components/ChatInput";
import ChatView from "./components/ChatView";
import type { ChatMessage } from "./types/chat";
import kolibriBridge from "./core/kolibri-bridge";

type SessionState = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type HandshakeResponse = {
  token: string;
  refresh_token: string;
  expires_in: number;
};

const App = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState("Быстрый ответ");
  const [isProcessing, setIsProcessing] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [, setSession] = useState<SessionState | null>(null);

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

  const appendAssistantMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        timestamp: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  }, []);

  const handleSuggestionSelect = useCallback((prompt: string) => {
    setDraft(prompt);
  }, []);

  const resetConversation = useCallback(() => {
    if (!bridgeReady) {
      setMessages([]);
      setDraft("");
      setIsProcessing(false);
      return;
    }

    void (async () => {
      try {
        await kolibriBridge.reset();
        setMessages([]);
        setDraft("");
      } catch (error) {
        appendAssistantMessage(
          error instanceof Error
            ? `Не удалось сбросить KolibriScript: ${error.message}`
            : "Не удалось сбросить KolibriScript.",
        );
      } finally {
        setIsProcessing(false);
      }
    })();
  }, [appendAssistantMessage, bridgeReady]);

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

    try {
      const answer = await kolibriBridge.ask(content, mode);
      appendAssistantMessage(answer);
    } catch (error) {
      appendAssistantMessage(
        error instanceof Error
          ? `Не удалось получить ответ: ${error.message}`
          : "Не удалось получить ответ от ядра Колибри.",
      );
    } finally {
      setIsProcessing(false);
    }
  }, [appendAssistantMessage, bridgeReady, draft, isProcessing, mode]);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: ReturnType<typeof window.setTimeout> | undefined;

    const scheduleRefresh = (state: SessionState) => {
      if (refreshTimer !== undefined) {
        window.clearTimeout(refreshTimer);
      }
      const safetyWindow = 5000;
      const now = Date.now();
      const delay = Math.max(1000, state.expiresAt - now - safetyWindow);
      refreshTimer = window.setTimeout(() => {
        void performRefresh(state.refreshToken);
      }, delay);
    };

    const updateSession = (state: SessionState) => {
      if (cancelled) {
        return;
      }
      setSession(state);
      scheduleRefresh(state);
    };

    async function performHandshake(): Promise<void> {
      try {
        const response = await fetch("/api/session/handshake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: "frontend" }),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data: HandshakeResponse = await response.json();
        if (!data.token || !data.refresh_token || typeof data.expires_in !== "number") {
          throw new Error("Некорректный ответ handshake");
        }
        const expiresAt = Date.now() + data.expires_in * 1000;
        updateSession({ accessToken: data.token, refreshToken: data.refresh_token, expiresAt });
      } catch (error) {
        if (cancelled) {
          return;
        }
        appendAssistantMessage(
          error instanceof Error
            ? `[Сессия] не удалось установить соединение: ${error.message}`
            : "[Сессия] не удалось установить соединение с backend-сервисом.",
        );
      }
    }

    async function performRefresh(refreshToken: string): Promise<void> {
      try {
        const response = await fetch("/api/session/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data: HandshakeResponse = await response.json();
        if (!data.token || !data.refresh_token || typeof data.expires_in !== "number") {
          throw new Error("Некорректный ответ refresh");
        }
        const expiresAt = Date.now() + data.expires_in * 1000;
        updateSession({ accessToken: data.token, refreshToken: data.refresh_token, expiresAt });
      } catch (error) {
        if (cancelled) {
          return;
        }
        appendAssistantMessage(
          error instanceof Error
            ? `[Сессия] не удалось обновить токен: ${error.message}`
            : "[Сессия] не удалось обновить токен.",
        );
        await performHandshake();
      }
    }

    void performHandshake();

    return () => {
      cancelled = true;
      if (refreshTimer !== undefined) {
        window.clearTimeout(refreshTimer);
      }
    };
  }, [appendAssistantMessage]);

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
        onModeChange={setMode}
        onSubmit={sendMessage}
        onReset={resetConversation}
      />
    </Layout>
  );
};

export default App;
