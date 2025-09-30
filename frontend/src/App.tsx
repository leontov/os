import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "./components/Layout";
import Sidebar, { type SidebarView } from "./components/Sidebar";
import WelcomeScreen from "./components/WelcomeScreen";
import ChatInput from "./components/ChatInput";
import ChatView from "./components/ChatView";
import NodeGraph from "./components/NodeGraph";
import type { ChatMessage } from "./types/chat";
import kolibriBridge from "./core/kolibri-bridge";
import useClusterTopology from "./hooks/useClusterTopology";

const App = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState("Быстрый ответ");
  const [activeView, setActiveView] = useState<SidebarView>("Диалоги");
  const [isProcessing, setIsProcessing] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const { topology, isLoading: isTopologyLoading, error: topologyError, reload: reloadTopology } = useClusterTopology();

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

  const conversationContent = useMemo(() => {
    if (!messages.length) {
      return <WelcomeScreen onSuggestionSelect={handleSuggestionSelect} />;
    }

    return <ChatView messages={messages} isLoading={isProcessing} />;
  }, [handleSuggestionSelect, isProcessing, messages]);

  const mainContent = useMemo(() => {
    if (activeView === "Визуализация") {
      return (
        <NodeGraph
          topology={topology}
          isLoading={isTopologyLoading}
          error={topologyError}
          onReload={reloadTopology}
        />
      );
    }

    return <div className="flex-1">{conversationContent}</div>;
  }, [activeView, conversationContent, topology, isTopologyLoading, topologyError, reloadTopology]);

  useEffect(() => {
    if (activeView !== "Визуализация") {
      return;
    }

    void reloadTopology();
  }, [activeView, reloadTopology]);

  const showChatInput = activeView === "Диалоги";

  return (
    <Layout sidebar={<Sidebar activeView={activeView} onNavigate={setActiveView} />}>
      {mainContent}
      {showChatInput ? (
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
