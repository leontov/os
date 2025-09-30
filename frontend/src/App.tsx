import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "./components/Layout";
import Sidebar from "./components/Sidebar";
import WelcomeScreen from "./components/WelcomeScreen";
import ChatInput from "./components/ChatInput";
import ChatView from "./components/ChatView";
import FractalMemory from "./components/FractalMemory";
import type { ChatMessage } from "./types/chat";
import kolibriBridge from "./core/kolibri-bridge";

const App = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState("Быстрый ответ");
  const [isProcessing, setIsProcessing] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [activePanel, setActivePanel] = useState<"chat" | "memory">("chat");

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
      } finally {
        setIsProcessing(false);
      }
    })();
  }, [bridgeReady]);

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
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: answer,
        timestamp: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
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
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setIsProcessing(false);
    }
  }, [bridgeReady, draft, isProcessing, mode]);

  const content = useMemo(() => {
    if (!messages.length) {
      return <WelcomeScreen onSuggestionSelect={handleSuggestionSelect} />;
    }

    return <ChatView messages={messages} isLoading={isProcessing} />;
  }, [handleSuggestionSelect, isProcessing, messages]);

  return (
    <Layout sidebar={<Sidebar />}>
      <div className="flex flex-1 flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white/80 p-2 shadow-card sm:p-3">
          <nav className="flex flex-wrap gap-2" aria-label="Основные панели">
            {[
              { id: "chat" as const, label: "Чат" },
              { id: "memory" as const, label: "Фрактальная память" },
            ].map((tab) => {
              const isActive = activePanel === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActivePanel(tab.id)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                    isActive
                      ? "bg-primary text-white shadow-sm"
                      : "bg-background-light/60 text-text-light hover:text-text-dark"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
          <div className="text-xs text-text-light">
            {activePanel === "chat"
              ? "Общайтесь с Колибри и учите его новым знаниям."
              : "Наблюдайте, как ответы формируют цифровую память."}
          </div>
        </div>
        <div className="flex-1">
          {activePanel === "chat" ? (
            content
          ) : (
            <FractalMemory isReady={bridgeReady} refreshToken={messages.length} />
          )}
        </div>
      </div>
      {activePanel === "chat" ? (
        <ChatInput
          value={draft}
          mode={mode}
          isBusy={isProcessing || !bridgeReady}
          onChange={setDraft}
          onModeChange={setMode}
          onSubmit={sendMessage}
          onReset={resetConversation}
        />
      ) : null}
    </Layout>
  );
};

export default App;
