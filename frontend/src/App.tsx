import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "./components/Layout";
import Sidebar from "./components/Sidebar";
import WelcomeScreen from "./components/WelcomeScreen";
import ChatInput from "./components/ChatInput";
import ChatView from "./components/ChatView";
import type { ChatAttachment, ChatMessage } from "./types/chat";
import kolibriBridge from "./core/kolibri-bridge";
import { uploadAttachments } from "./services/attachments";
import { formatFileSize } from "./utils/files";

const MAX_ATTACHMENT_PROMPT_LENGTH = 5_000;

function createAssistantErrorMessage(message: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: message,
    timestamp: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
  };
}

function normaliseAttachmentText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "Текст не обнаружен.";
  }
  if (trimmed.length <= MAX_ATTACHMENT_PROMPT_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_ATTACHMENT_PROMPT_LENGTH)}… [обрезано]`;
}

function composePrompt(base: string, attachments: ChatAttachment[]): string {
  const sections: string[] = [];
  const trimmedBase = base.trim();

  if (trimmedBase.length > 0) {
    sections.push(trimmedBase);
  }

  if (attachments.length > 0) {
    attachments.forEach((attachment, index) => {
      const header = `Вложение ${index + 1}: ${attachment.name} (${attachment.contentType}, ${formatFileSize(attachment.size)})`;
      sections.push(`${header}\n${normaliseAttachmentText(attachment.text)}`);
    });
  }

  return sections.join("\n\n");
}

const App = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState("Быстрый ответ");
  const [isProcessing, setIsProcessing] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await kolibriBridge.ready;
        if (!cancelled) {
          setBridgeReady(true);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message =
          error instanceof Error && error.message
            ? `Не удалось инициализировать KolibriScript: ${error.message}`
            : "Не удалось инициализировать KolibriScript.";
        setMessages((prev) => [...prev, createAssistantErrorMessage(message)]);
      }
    })();

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
        const message =
          error instanceof Error && error.message
            ? `Не удалось сбросить KolibriScript: ${error.message}`
            : "Не удалось сбросить KolibriScript.";
        setMessages((prev) => [...prev, createAssistantErrorMessage(message)]);
      } finally {
        setIsProcessing(false);
      }
    })();
  }, [bridgeReady]);

  const handleAttachmentUpload = useCallback(
    async (files: FileList | File[]) => {
      if (isUploadingAttachments || !bridgeReady) {
        return;
      }

      setIsUploadingAttachments(true);

      try {
        const uploaded = await uploadAttachments(files);
        setAttachments((prev) => [...prev, ...uploaded]);
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? `Не удалось обработать вложение: ${error.message}`
            : "Не удалось обработать вложение.";
        setMessages((prev) => [...prev, createAssistantErrorMessage(message)]);
      } finally {
        setIsUploadingAttachments(false);
      }
    },
    [bridgeReady, isUploadingAttachments]
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const sendMessage = useCallback(async () => {
    const content = draft.trim();
    if ((content.length === 0 && attachments.length === 0) || isProcessing || !bridgeReady) {
      return;
    }

    const attachmentsForMessage = attachments.map((attachment) => ({ ...attachment }));
    const prompt = composePrompt(content, attachmentsForMessage);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      attachments: attachmentsForMessage.length > 0 ? attachmentsForMessage : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setDraft("");
    setAttachments([]);
    setIsProcessing(true);

    try {
      const answer = await kolibriBridge.ask(prompt || content, mode);
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: answer,
        timestamp: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? `Не удалось получить ответ: ${error.message}`
          : "Не удалось получить ответ от ядра Колибри.";
      setMessages((prev) => [...prev, createAssistantErrorMessage(message)]);
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
        isBusy={isProcessing || !bridgeReady || isUploadingAttachments}
        isUploading={isUploadingAttachments}
        attachments={attachments}
        onChange={setDraft}
        onModeChange={setMode}
        onAttachmentsAdd={handleAttachmentUpload}
        onAttachmentRemove={removeAttachment}
        onSubmit={sendMessage}
        onReset={resetConversation}
      />
    </Layout>
  );
};

export default App;
