import { useCallback, useMemo, useRef, useState } from "react";
import Layout from "./components/Layout";
import Sidebar from "./components/Sidebar";
import WelcomeScreen, { type WelcomeSuggestion } from "./components/WelcomeScreen";
import ChatInput from "./components/ChatInput";
import ChatView from "./components/ChatView";
import type { ChatMessage } from "./types/chat";
import kolibriBridge from "./core/kolibri-bridge";

const App = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState("Быстрый ответ");
  const [isProcessing, setIsProcessing] = useState(false);
  const [scene, setScene] = useState<"welcome" | "chat">("welcome");
  const [selectedScenario, setSelectedScenario] = useState<WelcomeSuggestion | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSuggestionSelect = useCallback(
    (scenario: WelcomeSuggestion) => {
      setSelectedScenario(scenario);
      setDraft(scenario.prompt);
      setScene("chat");

      setTimeout(() => {
        const textarea = inputRef.current;
        if (!textarea) {
          return;
        }

        textarea.focus();
        textarea.setSelectionRange(scenario.prompt.length, scenario.prompt.length);
      }, 0);
    },
    []
  );

  const resetConversation = useCallback(() => {
    setMessages([]);
    setDraft("");
    setIsProcessing(false);
    setScene("welcome");
    setSelectedScenario(null);
  }, []);

  const sendMessage = useCallback(
    async (override?: string) => {
      if (isProcessing) {
        return;
      }

      const content = (override ?? draft).trim();
      if (!content) {
        return;
      }

      const timestamp = new Date().toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      });

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp,
      };

      setMessages((prev) => [...prev, userMessage]);
      setDraft("");
      setIsProcessing(true);
      setScene("chat");
      setSelectedScenario(null);

      try {
        const answer = await kolibriBridge.ask(content, mode);
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: answer,
          timestamp: new Date().toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
          }),
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
          timestamp: new Date().toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } finally {
        setIsProcessing(false);
      }
    },
    [draft, isProcessing, mode]
  );

  const handleDraftChange = useCallback(
    (value: string) => {
      setDraft(value);
      if (selectedScenario && value.trim() !== selectedScenario.prompt.trim()) {
        setSelectedScenario(null);
      }
    },
    [selectedScenario]
  );

  const content = useMemo(() => {
    if (scene === "welcome") {
      return (
        <WelcomeScreen
          onSuggestionSelect={handleSuggestionSelect}
          selectedScenario={selectedScenario}
          disabled={isProcessing}
        />
      );
    }

    return <ChatView messages={messages} isLoading={isProcessing} prefillScenario={selectedScenario} />;
  }, [handleSuggestionSelect, isProcessing, messages, scene, selectedScenario]);

  return (
    <Layout sidebar={<Sidebar />}>
      <div className="flex-1">{content}</div>
      <ChatInput
        value={draft}
        mode={mode}
        isBusy={isProcessing}
        onChange={handleDraftChange}
        onModeChange={setMode}
        onSubmit={() => void sendMessage()}
        onReset={resetConversation}
        ref={inputRef}
      />
    </Layout>
  );
};

export default App;
