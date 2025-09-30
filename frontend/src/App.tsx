import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Layout from "./components/Layout";
import Sidebar from "./components/Sidebar";
import WelcomeScreen from "./components/WelcomeScreen";
import ChatInput from "./components/ChatInput";
import ChatView from "./components/ChatView";
import type { ChatMessage } from "./types/chat";
import kolibriBridge from "./core/kolibri-bridge";
import type { KolibriStream } from "./core/streaming";

const App = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState("Быстрый ответ");
  const [isProcessing, setIsProcessing] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const streamRef = useRef<KolibriStream | null>(null);

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
    const activeStream = streamRef.current;
    if (activeStream) {
      activeStream.cancel();
    }

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

    const assistantId = crypto.randomUUID();
    const assistantTimestamp = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

    setMessages((prev) => [
      ...prev,
      userMessage,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: assistantTimestamp,
      },
    ]);
    setDraft("");
    setIsProcessing(true);

    try {
      const stream = await kolibriBridge.askStream(content, mode);
      streamRef.current = stream;

      const unsubscribeCallbacks: Array<() => void> = [];
      let finished = false;

      const finalize = (status: "complete" | "cancel" | "error", error?: unknown) => {
        if (finished) {
          return;
        }
        finished = true;
        for (const unsubscribe of unsubscribeCallbacks) {
          unsubscribe();
        }
        streamRef.current = null;

        if (status === "error") {
          const messageText =
            error instanceof Error
              ? `Не удалось получить ответ: ${error.message}`
              : "Не удалось получить ответ от ядра Колибри.";
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId ? { ...message, content: messageText } : message,
            ),
          );
        } else if (status === "cancel") {
          setMessages((prev) =>
            prev.map((message) => {
              if (message.id !== assistantId) {
                return message;
              }
              const base = message.content.trimEnd();
              return {
                ...message,
                content: base.length
                  ? `${base}\n\nОтвет отменён пользователем.`
                  : "Ответ был отменён пользователем.",
              };
            }),
          );
        } else {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content.trimEnd() }
                : message,
            ),
          );
        }

        setIsProcessing(false);
      };

      unsubscribeCallbacks.push(
        stream.onToken((chunk) => {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? { ...message, content: `${message.content}${chunk}` }
                : message,
            ),
          );
        }),
      );

      unsubscribeCallbacks.push(
        stream.onComplete(() => {
          finalize("complete");
        }),
      );

      unsubscribeCallbacks.push(
        stream.onCancel(() => {
          finalize("cancel");
        }),
      );

      unsubscribeCallbacks.push(
        stream.onError((error) => {
          finalize("error", error);
        }),
      );

      stream.done.catch(() => undefined);
    } catch (error) {
      streamRef.current = null;
      const messageText =
        error instanceof Error
          ? `Не удалось получить ответ: ${error.message}`
          : "Не удалось получить ответ от ядра Колибри.";
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId ? { ...message, content: messageText } : message,
        ),
      );
      setIsProcessing(false);
    }
  }, [bridgeReady, draft, isProcessing, mode]);

  const cancelActiveStream = useCallback(() => {
    const activeStream = streamRef.current;
    if (activeStream) {
      activeStream.cancel();
    }
  }, []);

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
        onCancel={cancelActiveStream}
        canCancel={isProcessing}
      />
    </Layout>
  );
};

export default App;
