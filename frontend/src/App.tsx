import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "./components/Layout";
import Sidebar from "./components/Sidebar";
import WelcomeScreen from "./components/WelcomeScreen";
import ChatInput from "./components/ChatInput";
import ChatView from "./components/ChatView";
import type { ChatMessage } from "./types/chat";
import type { AttachmentState, AttachmentUploadResponse } from "./types/attachments";
import kolibriBridge from "./core/kolibri-bridge";

const App = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState("Быстрый ответ");
  const [isProcessing, setIsProcessing] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentState[]>([]);

  const backendBaseUrl = useMemo(() => {
    const raw = import.meta.env.VITE_BACKEND_URL ?? "";
    return raw.replace(/\/+$/, "");
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
      setAttachments([]);
      return;
    }

    void (async () => {
      try {
        await kolibriBridge.reset();
        setMessages([]);
        setDraft("");
        setAttachments([]);
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

  const handleAttachmentUpload = useCallback(
    async (file: File) => {
      const tempId = crypto.randomUUID();
      const optimistic: AttachmentState = {
        id: tempId,
        filename: file.name,
        status: "processing",
      };
      setAttachments((prev) => [...prev, optimistic]);

      const endpoint = backendBaseUrl ? `${backendBaseUrl}/api/attachments` : "/api/attachments";
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Ошибка загрузки файла (${response.status})`);
        }
        const payload = (await response.json()) as AttachmentUploadResponse;
        const normalisedDownloadUrl = (() => {
          if (!payload.download_url) {
            return undefined;
          }
          try {
            const base = backendBaseUrl || globalThis.location?.origin || "";
            return new URL(payload.download_url, base || undefined).toString();
          } catch (error) {
            console.error("Не удалось нормализовать ссылку вложения", error);
            return payload.download_url;
          }
        })();

        setAttachments((prev) =>
          prev.map((item) =>
            item.id === tempId
              ? {
                  ...item,
                  status: "ready",
                  contentType: payload.content_type,
                  extractedText: payload.text,
                  truncated: payload.truncated,
                  downloadUrl: normalisedDownloadUrl,
                  ocrPerformed: payload.ocr_performed,
                  note: payload.note,
                }
              : item,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Не удалось загрузить файл.";
        setAttachments((prev) =>
          prev.map((item) =>
            item.id === tempId
              ? {
                  ...item,
                  status: "error",
                  error: message,
                }
              : item,
          ),
        );
      }
    },
    [backendBaseUrl],
  );

  const handleAttachmentRemove = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const sendMessage = useCallback(async () => {
    const readyAttachments = attachments.filter((item) => item.status === "ready");
    const promptSegments: string[] = [];
    const trimmedDraft = draft.trim();

    if (trimmedDraft) {
      promptSegments.push(trimmedDraft);
    }

    readyAttachments.forEach((attachment) => {
      const lines: string[] = [`Вложение: ${attachment.filename}`];
      if (attachment.extractedText) {
        lines.push(attachment.extractedText);
        if (attachment.truncated) {
          lines.push("[Текст вложения был усечён для передачи]");
        }
      } else if (attachment.note) {
        lines.push(attachment.note);
      }
      if (!attachment.extractedText && attachment.downloadUrl) {
        lines.push(`Ссылка на вложение: ${attachment.downloadUrl}`);
      }
      promptSegments.push(lines.join("\n"));
    });

    if (!promptSegments.length || isProcessing || !bridgeReady) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: promptSegments.join("\n\n"),
      timestamp: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setDraft("");
    setAttachments([]);
    setIsProcessing(true);

    try {
      const answer = await kolibriBridge.ask(userMessage.content, mode);
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
  }, [attachments, bridgeReady, draft, isProcessing, mode]);

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
        attachments={attachments}
        canSubmit={Boolean(draft.trim()) || attachments.some((item) => item.status === "ready")}
        onChange={setDraft}
        onModeChange={setMode}
        onSubmit={sendMessage}
        onReset={resetConversation}
        onUploadFile={handleAttachmentUpload}
        onRemoveAttachment={handleAttachmentRemove}
      />
    </Layout>
  );
};

export default App;
