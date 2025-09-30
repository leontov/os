import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Layout from "./components/Layout";
import Sidebar from "./components/Sidebar";
import WelcomeScreen from "./components/WelcomeScreen";
import ChatInput from "./components/ChatInput";
import ChatView from "./components/ChatView";
import type { ChatMessage } from "./types/chat";
import kolibriBridge from "./core/kolibri-bridge";
import { streamChatCompletion } from "./api/chatStream";

const App = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState("Быстрый ответ");
  const [isProcessing, setIsProcessing] = useState(false);
  const [partialResponse, setPartialResponse] = useState("");
  const [bridgeReady, setBridgeReady] = useState(false);
  const partialResponseRef = useRef("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);

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

  const cancelStreaming = useCallback(() => {
    const controller = abortControllerRef.current;
    if (controller) {
      controller.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const resetConversation = useCallback(() => {
    cancelStreaming();
    streamingMessageIdRef.current = null;
    partialResponseRef.current = "";
    setPartialResponse("");
    setMessages([]);
    setDraft("");
    setIsProcessing(false);

    if (!bridgeReady) {
      return;
    }

    void (async () => {
      try {
        await kolibriBridge.reset();
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
      }
    })();
  }, [bridgeReady, cancelStreaming]);

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

    const assistantId = crypto.randomUUID();
    const initialTimestamp = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    partialResponseRef.current = "";
    setPartialResponse("");
    streamingMessageIdRef.current = assistantId;

    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: initialTimestamp,
      },
    ]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await streamChatCompletion({
        prompt: content,
        mode,
        signal: controller.signal,
        onToken(token) {
          if (streamingMessageIdRef.current !== assistantId) {
            return;
          }

          partialResponseRef.current += token;
          setPartialResponse(partialResponseRef.current);
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? { ...message, content: partialResponseRef.current }
                : message,
            ),
          );
        },
        onComplete() {
          if (streamingMessageIdRef.current !== assistantId) {
            return;
          }

          const finalText = partialResponseRef.current.trimEnd();
          const finalTimestamp = new Date().toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
          });
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    content: finalText.length > 0 ? finalText : "KolibriScript завершил работу без вывода.",
                    timestamp: finalTimestamp,
                  }
                : message,
            ),
          );
        },
      });
    } catch (error) {
      const aborted = controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
      const timestamp = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      const messageText = aborted
        ? "Поток ответа был прерван пользователем."
        : error instanceof Error
          ? `Не удалось получить ответ: ${error.message}`
          : "Не удалось получить ответ от сервера.";

      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: messageText,
                timestamp,
              }
            : message,
        ),
      );
    } finally {
      abortControllerRef.current = null;
      streamingMessageIdRef.current = null;
      setPartialResponse("");
      partialResponseRef.current = "";
      setIsProcessing(false);
    }
  }, [bridgeReady, draft, isProcessing, mode]);

  useEffect(() => {
    return () => {
      cancelStreaming();
    };
  }, [cancelStreaming]);

  const content = useMemo(() => {
    if (!messages.length) {
      return <WelcomeScreen onSuggestionSelect={handleSuggestionSelect} />;
    }

    return <ChatView messages={messages} isLoading={isProcessing && partialResponse.length === 0} />;
  }, [handleSuggestionSelect, isProcessing, messages, partialResponse]);

  return (
    <Layout sidebar={<Sidebar />}>
      <div className="flex-1">{content}</div>
      <ChatInput
        value={draft}
        mode={mode}
        isBusy={!bridgeReady}
        isStreaming={isProcessing}
        onChange={setDraft}
        onModeChange={setMode}
        onSubmit={sendMessage}
        onReset={resetConversation}
        onCancel={cancelStreaming}
      />
    </Layout>
  );
};

export default App;
