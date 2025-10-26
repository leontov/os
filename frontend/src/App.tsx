import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import AnalyticsView from "./components/AnalyticsView";
import ChatInput from "./components/ChatInput";
import ChatView from "./components/ChatView";
import DemoPage, { DemoMetrics } from "./components/DemoPage";
import InspectorPanel from "./components/InspectorPanel";
import KernelControlsPanel from "./components/KernelControlsPanel";
import KnowledgeView from "./components/KnowledgeView";
import SwarmView from "./components/SwarmView";
import ActionsPanel from "./features/actions/ActionsPanel";
import WelcomeScreen from "./components/WelcomeScreen";
import PanelDialog from "./components/layout/PanelDialog";
import SettingsPanel from "./components/settings/SettingsPanel";
import useKolibriChat from "./core/useKolibriChat";
import { MODE_OPTIONS, findModeLabel } from "./core/modes";
import { usePersonaTheme } from "./core/usePersonaTheme";
import useInspectorSession from "./core/useInspectorSession";
import type { ModelId } from "./core/models";
import type { ChatMessage } from "./types/chat";

type PanelKey =
  | "knowledge"
  | "swarm"
  | "analytics"
  | "controls"
  | "actions"
  | "settings"
  | null;

const DEFAULT_SUGGESTIONS = [
  "Сформулируй краткое резюме беседы",
  "Предложи три следующих шага",
  "Выпиши ключевые идеи",
  "Помоги подготовить письмо по теме диалога",
];

const App = () => {
  const {
    messages,
    draft,
    mode,
    isProcessing,
    bridgeReady,
    conversationId,
    conversationTitle,
    conversationSummaries,
    archivedConversations,
    knowledgeStatus,
    knowledgeError,
    statusLoading,
    latestAssistantMessage,
    metrics,
    analytics,
    knowledgeUsage,
    attachments,
    setDraft,
    setMode,
    kernelControls,
    kernelCapabilities,
    updateKernelControls,
    preferences,
    updatePreferences,
    modelId,
    setModelId,
    renameConversation,
    deleteConversation,
    attachFiles,
    removeAttachment,
    clearAttachments,
    sendMessage,
    resendMessage,
    resetConversation,
    selectConversation,
    createConversation,
    refreshKnowledgeStatus,
    archiveConversation,
    clearConversationHistory,
    exportConversationAsMarkdown,
  } = useKolibriChat();

  const inspectorSession = useInspectorSession({
    conversationId,
    conversationTitle,
    messages,
    metrics,
    kernelCapabilities,
    kernelControls,
    preferences,
    mode,
    getDraft: () => draft,
  });

  const {
    logAction: logInspectorAction,
    registerCaptureTarget,
  } = inspectorSession;

  const [activePanel, setActivePanel] = useState<PanelKey>(null);
  const [isDemoMode, setDemoMode] = useState(false);
  const [isZenMode, setZenMode] = useState(false);
  const [demoMetrics, setDemoMetrics] = useState<DemoMetrics>({
    coldStartMs: null,
    wasmBytes: null,
    offlineFallback: false,
    degradedReason: null,
  });
  const { activePersona } = usePersonaTheme();

  const modeLabel = useMemo(() => findModeLabel(mode), [mode]);

  const handleSuggestionSelect = useCallback(
    (suggestion: string) => {
      const trimmedDraft = draft.trimEnd();
      const prefix = trimmedDraft.length > 0 ? `${trimmedDraft}\n\n` : "";
      setDraft(`${prefix}${suggestion}`);
      logInspectorAction("suggestion.apply", "Добавлена подсказка", { suggestion });
    },
    [draft, logInspectorAction, setDraft],
  );

  const handleModeChange = useCallback(
    (nextMode: string) => {
      if (nextMode === mode) {
        return;
      }
      logInspectorAction("mode.change", `Режим: ${findModeLabel(nextMode)}`, {
        from: mode,
        to: nextMode,
      });
      setMode(nextMode);
    },
    [logInspectorAction, mode, setMode],
  );

  const handleSendMessage = useCallback(async () => {
    logInspectorAction("message.user", "Отправка сообщения", {
      draftLength: draft.trim().length,
      attachments: attachments.length,
    });
    await sendMessage();
  }, [attachments.length, draft, logInspectorAction, sendMessage]);

  const handleResetConversation = useCallback(async () => {
    logInspectorAction("conversation.reset", "Начат новый диалог", { conversationId });
    await resetConversation();
  }, [conversationId, logInspectorAction, resetConversation]);

  const handleAttachFiles = useCallback(
    (files: File[]) => {
      if (files.length) {
        logInspectorAction("attachment.add", "Прикреплены файлы", {
          count: files.length,
          names: files.map((file) => file.name),
        });
      }
      attachFiles(files);
    },
    [attachFiles, logInspectorAction],
  );

  const handleRemoveAttachment = useCallback(
    (id: string) => {
      logInspectorAction("attachment.remove", "Удалено вложение", { id });
      removeAttachment(id);
    },
    [logInspectorAction, removeAttachment],
  );

  const handleClearAttachments = useCallback(() => {
    logInspectorAction("attachment.clear", "Очистка вложений");
    clearAttachments();
  }, [clearAttachments, logInspectorAction]);

  const handleCreateConversation = useCallback(() => {
    logInspectorAction("conversation.create", "Создана новая беседа");
    void createConversation();
  }, [createConversation, logInspectorAction]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      logInspectorAction("conversation.select", "Выбор беседы", { targetId: id });
      selectConversation(id);
    },
    [logInspectorAction, selectConversation],
  );

  const handleRenameConversation = useCallback(
    (title: string) => {
      logInspectorAction("conversation.title", "Обновлено название беседы", {
        title,
        conversationId,
      });
      renameConversation(title);
    },
    [conversationId, logInspectorAction, renameConversation],
  );

  const handleRenameConversationById = useCallback(
    (id: string, title: string) => {
      logInspectorAction("conversation.title", "Обновлено название беседы", {
        title,
        conversationId: id,
      });
      renameConversation(title, id);
    },
    [logInspectorAction, renameConversation],
  );

  const handleDeleteConversation = useCallback(
    (id: string) => {
      logInspectorAction("conversation.delete", "Удалена беседа", { conversationId: id });
      deleteConversation(id);
    },
    [deleteConversation, logInspectorAction],
  );

  const handleRefreshKnowledge = useCallback(() => {
    logInspectorAction("knowledge.refresh", "Запрошено обновление памяти");
    void refreshKnowledgeStatus();
  }, [logInspectorAction, refreshKnowledgeStatus]);

  const handleUpdatePreferences = useCallback(
    (next: Partial<typeof preferences>) => {
      logInspectorAction("preferences.update", "Изменены настройки беседы", next);
      updatePreferences(next);
    },
    [logInspectorAction, updatePreferences],
  );

  const handleModelChange = useCallback(
    (nextModel: ModelId) => {
      if (nextModel === modelId) {
        return;
      }
      logInspectorAction("model.change", "Изменена модель Kolibri", {
        from: modelId,
        to: nextModel,
      });
      setModelId(nextModel);
    },
    [logInspectorAction, modelId, setModelId],
  );

  const handleArchiveConversation = useCallback(() => {
    logInspectorAction("conversation.archive", "Беседа перемещена в архив", {
      conversationId,
      title: conversationTitle,
    });
    archiveConversation();
  }, [archiveConversation, conversationId, conversationTitle, logInspectorAction]);

  const handleClearHistory = useCallback(async () => {
    logInspectorAction("conversation.history.clear", "Локальная история бесед очищена");
    await clearConversationHistory();
  }, [clearConversationHistory, logInspectorAction]);

  const handleExportConversation = useCallback(() => {
    const markdown = exportConversationAsMarkdown();
    if (!markdown) {
      logInspectorAction("conversation.export.failed", "Не удалось экспортировать беседу", {
        conversationId,
      });
      return;
    }

    logInspectorAction("conversation.export", "Экспорт беседы в Markdown", {
      conversationId,
      title: conversationTitle,
      size: markdown.length,
    });

    if (typeof window === "undefined") {
      return;
    }

    try {
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeTitle = conversationTitle.trim()
        ? conversationTitle.trim().replace(/[\s/\\:]+/g, "-")
        : "conversation";
      anchor.href = url;
      anchor.download = `${safeTitle}-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.warn("[kolibri-export] Не удалось сохранить беседу", error);
    }
  }, [conversationId, conversationTitle, exportConversationAsMarkdown, logInspectorAction]);

  const handleMessageEdit = useCallback(
    (message: ChatMessage) => {
      if (message.role !== "user") {
        return;
      }
      const edited = window.prompt("Отредактируйте сообщение перед повторной отправкой:", message.content);
      if (edited === null) {
        return;
      }
      const trimmed = edited.trim();
      if (!trimmed) {
        return;
      }
      logInspectorAction("message.edit", "Повторная отправка после правки", {
        messageId: message.id,
        length: trimmed.length,
      });
      void resendMessage(message.id, { content: trimmed });
    },
    [logInspectorAction, resendMessage],
  );

  const handleMessageRegenerate = useCallback(
    ({ assistantMessage, userMessage }: { assistantMessage: ChatMessage; userMessage?: ChatMessage }) => {
      const target = userMessage ?? ("user" === assistantMessage.role ? assistantMessage : undefined);
      if (!target || target.role !== "user") {
        return;
      }
      logInspectorAction("message.regenerate", "Повторный запрос ответа", {
        messageId: target.id,
        assistantId: assistantMessage.id,
      });
      void resendMessage(target.id);
    },
    [logInspectorAction, resendMessage],
  );

  const handleMessageContinue = useCallback(
    ({ assistantMessage, userMessage }: { assistantMessage: ChatMessage; userMessage?: ChatMessage }) => {
      if (!userMessage || userMessage.role !== "user") {
        return;
      }
      const continuedPrompt = `${userMessage.content.trim()}\n\nПродолжи ответ.`;
      logInspectorAction("message.continue", "Запрошено продолжение ответа", {
        messageId: userMessage.id,
        assistantId: assistantMessage.id,
      });
      void resendMessage(userMessage.id, { content: continuedPrompt });
    },
    [logInspectorAction, resendMessage],
  );

  const handleMessageCopyLink = useCallback(
    async (message: ChatMessage) => {
      if (typeof window === "undefined") {
        return;
      }
      const baseUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;
      const link = `${baseUrl}#message-${message.id}`;
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(link);
        } else {
          void window.prompt("Скопируйте ссылку на сообщение", link);
        }
        logInspectorAction("message.copy-link", "Скопирована ссылка на сообщение", {
          messageId: message.id,
          link,
        });
      } catch (error) {
        console.warn("[kolibri-chat] Не удалось скопировать ссылку", error);
      }
    },
    [logInspectorAction],
  );

  const quickSuggestions = useMemo(() => {
    const suggestions = new Set<string>();

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      if (candidate.role === "assistant" && candidate.content.trim()) {
        const [firstSentence] = candidate.content.split(/[.!?\n]/u);
        const trimmed = firstSentence?.trim();
        if (trimmed) {
          const excerpt = trimmed.length > 96 ? `${trimmed.slice(0, 96)}…` : trimmed;
          suggestions.add(`Раскрой подробнее: ${excerpt}`);
        }
        break;
      }
    }

    suggestions.add(`Применим режим ${modeLabel} к новому примеру`);
    DEFAULT_SUGGESTIONS.forEach((item) => suggestions.add(item));

    return Array.from(suggestions).slice(0, 4);
  }, [messages, modeLabel]);

  const composer = (
    <div className="flex flex-col gap-4">
      <ChatInput
        value={draft}
        mode={mode}
        isBusy={isProcessing || !bridgeReady}
        attachments={attachments}
        onChange={setDraft}
        onModeChange={handleModeChange}
        onSubmit={() => {
          void handleSendMessage();
        }}
        onReset={() => {
          void handleResetConversation();
        }}
        onAttach={handleAttachFiles}
        onRemoveAttachment={handleRemoveAttachment}
        onClearAttachments={handleClearAttachments}
        onOpenControls={() => setActivePanel("controls")}
      />
      {quickSuggestions.length > 0 ? (
        <div className="rounded-2xl border border-border/60 bg-surface px-4 py-3 text-sm text-text-muted shadow-sm">
          <div className="flex items-center justify-between text-[0.7rem] uppercase tracking-[0.3em]">
            <span>Быстрые подсказки</span>
            <span className="inline-flex items-center gap-2 text-text">
              <Sparkles className="h-4 w-4" />
              Фокус: {modeLabel}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {quickSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => handleSuggestionSelect(suggestion)}
                className="rounded-full border border-border/70 bg-surface-muted px-4 py-2 text-xs font-semibold text-text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isProcessing || !bridgeReady}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const base = import.meta.env.BASE_URL ?? "/";
    const normalizedBase = base.endsWith("/") ? base : `${base}/`;
    const demoPath = `${normalizedBase}demo`;

    const evaluate = () => {
      try {
        const url = new URL(window.location.href);
        return url.pathname.startsWith(demoPath) || url.searchParams.get("demo") === "1";
      } catch (error) {
        console.warn("[kolibri-demo] Не удалось определить режим демо.", error);
        return false;
      }
    };

    setDemoMode(evaluate());

    const handleLocation = () => {
      setDemoMode(evaluate());
    };

    window.addEventListener("popstate", handleLocation);
    window.addEventListener("hashchange", handleLocation);

    return () => {
      window.removeEventListener("popstate", handleLocation);
      window.removeEventListener("hashchange", handleLocation);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return undefined;
    }

    const handleMessage = (event: MessageEvent) => {
      const payload = event.data;
      if (!payload || typeof payload !== "object") {
        return;
      }
      if (payload.type === "kolibri:pwa-metrics" && payload.payload) {
        const data = payload.payload as DemoMetrics;
        setDemoMetrics({
          coldStartMs: typeof data.coldStartMs === "number" ? data.coldStartMs : null,
          wasmBytes: typeof data.wasmBytes === "number" ? data.wasmBytes : null,
          offlineFallback: Boolean(data.offlineFallback),
          degradedReason: data.degradedReason ?? null,
        });
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);

    void navigator.serviceWorker.ready
      .then((registration) => {
        registration.active?.postMessage({ type: "GET_STARTUP_METRICS" });
      })
      .catch((error) => {
        console.warn("[kolibri-demo] Не удалось получить регистрацию service worker.", error);
      });

    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "GET_STARTUP_METRICS" });
    }

    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, []);

  const handleExitDemo = useCallback(() => {
    if (typeof window !== "undefined") {
      const base = import.meta.env.BASE_URL ?? "/";
      const target = new URL(base, window.location.href);
      window.history.pushState({}, "", target.pathname);
    }
    setDemoMode(false);
  }, []);

  const handleToggleZenMode = useCallback(() => {
    setZenMode((previous) => !previous);
  }, []);

  if (isDemoMode) {
    return <DemoPage metrics={demoMetrics} onLaunchApp={handleExitDemo} />;
  }

  return (
    <>
      <div className="flex min-h-screen bg-app-background text-text" data-zen-mode={isZenMode} data-motion-region>
        <ChatView
          messages={messages}
          isLoading={isProcessing}
          conversationId={conversationId}
          conversationTitle={conversationTitle}
          conversationSummaries={conversationSummaries}
          mode={mode}
          modeLabel={modeLabel}
          modeOptions={MODE_OPTIONS}
          modelId={modelId}
          modelOptions={MODEL_OPTIONS}
          metrics={metrics}
          emptyState={<WelcomeScreen onSuggestionSelect={setDraft} />}
          composer={composer}
          onConversationTitleChange={handleRenameConversation}
          onConversationCreate={handleCreateConversation}
          onConversationSelect={handleSelectConversation}
          onConversationRename={handleRenameConversationById}
          onConversationDelete={handleDeleteConversation}
          onModeChange={handleModeChange}
          onModelChange={handleModelChange}
          onOpenKnowledge={() => setActivePanel("knowledge")}
          onOpenAnalytics={() => setActivePanel("analytics")}
          onOpenActions={() => setActivePanel("actions")}
          onOpenSwarm={() => setActivePanel("swarm")}
          onOpenSettings={() => setActivePanel("settings")}
          onRefreshKnowledge={handleRefreshKnowledge}
          onShareConversation={handleShareConversation}
          onExportConversation={handleExportConversation}
          onManagePlan={handleManagePlan}
          isKnowledgeLoading={statusLoading}
          bridgeReady={bridgeReady}
          isZenMode={isZenMode}
          onToggleZenMode={handleToggleZenMode}
          personaName={activePersona.name}
          preferences={preferences}
          onPreferencesChange={handleUpdatePreferences}
          onViewportElementChange={registerCaptureTarget}
          onMessageEdit={handleMessageEdit}
          onMessageContinue={handleMessageContinue}
          onMessageRegenerate={handleMessageRegenerate}
          onMessageCopyLink={handleMessageCopyLink}
        />
      </div>

      <PanelDialog
        title="Настройки Kolibri"
        description="Переключайте модель и управляйте локальной историей бесед."
        isOpen={activePanel === "settings"}
        onClose={() => setActivePanel(null)}
      >
        <SettingsPanel
          modelId={modelId}
          onModelChange={handleModelChange}
          currentConversationTitle={conversationTitle}
          onArchiveConversation={handleArchiveConversation}
          onExportConversation={handleExportConversation}
          onClearHistory={() => {
            void handleClearHistory();
          }}
          archivedConversations={archivedConversations}
        />
      </PanelDialog>

      <PanelDialog
        title="Память Kolibri"
        description="Отслеживайте статус загрузки знаний и ищите источники."
        isOpen={activePanel === "knowledge"}
        onClose={() => setActivePanel(null)}
      >
        <KnowledgeView
          status={knowledgeStatus}
          error={knowledgeError}
          isLoading={statusLoading}
          onRefresh={() => {
            void refreshKnowledgeStatus();
          }}
          usage={knowledgeUsage}
        />
      </PanelDialog>

      <PanelDialog
        title="Swarm"
        description="Настройте режимы генерации и распределение нагрузки."
        isOpen={activePanel === "swarm"}
        onClose={() => setActivePanel(null)}
      >
        <SwarmView
          kernelControls={kernelControls}
          kernelCapabilities={kernelCapabilities}
          onApplyControls={updateKernelControls}
          onModeChange={setMode}
          activeMode={mode}
          metrics={metrics}
          isBusy={isProcessing}
        />
      </PanelDialog>

      <PanelDialog
        title="Аналитика"
        description="Сводка по активности диалогов и использованию знаний."
        isOpen={activePanel === "analytics"}
        onClose={() => setActivePanel(null)}
      >
        <AnalyticsView analytics={analytics} />
      </PanelDialog>

      <PanelDialog
        title="Действия и макросы"
        description="Запускайте серверные инструменты, отслеживайте ход выполнения и собирайте личные рецепты."
        isOpen={activePanel === "actions"}
        onClose={() => setActivePanel(null)}
        maxWidthClass="max-w-6xl"
      >
        <ActionsPanel />
      </PanelDialog>

      <PanelDialog
        title="Настройки ядра"
        description="Переключайте режимы и просматривайте последние метрики."
        isOpen={activePanel === "controls"}
        onClose={() => setActivePanel(null)}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <KernelControlsPanel
            controls={kernelControls}
            capabilities={kernelCapabilities}
            onChange={updateKernelControls}
          />
          <InspectorPanel
            status={knowledgeStatus}
            error={knowledgeError}
            isLoading={statusLoading}
            metrics={metrics}
            capabilities={kernelCapabilities}
            latestAssistantMessage={latestAssistantMessage}
            onRefresh={handleRefreshKnowledge}
            session={inspectorSession}
          />
        </div>
      </PanelDialog>

    </>
  );
};

export default App;
