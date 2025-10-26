import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import AnalyticsView from "./components/AnalyticsView";
import ChatComposer from "./components/ChatComposer";
import ChatView from "./components/ChatView";
import ConversationPreferencesBar from "./components/ConversationPreferencesBar";
import DemoPage, { DemoMetrics } from "./components/DemoPage";
import InspectorPanel from "./components/InspectorPanel";
import KernelControlsPanel from "./components/KernelControlsPanel";
import KnowledgeView from "./components/KnowledgeView";
import Sidebar from "./components/Sidebar";
import SwarmView from "./components/SwarmView";
import ActionsPanel from "./features/actions/ActionsPanel";
import WelcomeScreen from "./components/WelcomeScreen";
import ChatLayout from "./components/layout/ChatLayout";
import PanelDialog from "./components/layout/PanelDialog";
import useKolibriChat from "./core/useKolibriChat";
import { findModeLabel } from "./core/modes";
import useMediaQuery from "./core/useMediaQuery";
import { usePersonaTheme } from "./core/usePersonaTheme";
import useInspectorSession from "./core/useInspectorSession";
import type { ChatMessage } from "./types/chat";
import type { ConversationPreferences } from "./core/useKolibriChat";

type PanelKey = "knowledge" | "swarm" | "analytics" | "controls" | "preferences" | "actions" | null;

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
    isStreaming,
    bridgeReady,
    conversationId,
    conversationTitle,
    conversationSummaries,
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
    renameConversation,
    attachFiles,
    removeAttachment,
    clearAttachments,
    sendMessage,
    regenerateMessage,
    resetConversation,
    selectConversation,
    createConversation,
    refreshKnowledgeStatus,
    stopGeneration,
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

  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelKey>(null);
  const [isDemoMode, setDemoMode] = useState(false);
  const [isZenMode, setZenMode] = useState(false);
  const [demoMetrics, setDemoMetrics] = useState<DemoMetrics>({
    coldStartMs: null,
    wasmBytes: null,
    offlineFallback: false,
    degradedReason: null,
  });
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const { motion, activePersona } = usePersonaTheme();

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

  const handleStopGeneration = useCallback(() => {
    logInspectorAction("message.stop", "Остановлена генерация ответа");
    stopGeneration();
  }, [logInspectorAction, stopGeneration]);

  const handleRegenerateMessage = useCallback(
    (message?: ChatMessage, userMessage?: ChatMessage) => {
      logInspectorAction("message.regenerate", "Повтор генерации ответа", {
        messageId: message?.id,
        userMessageId: userMessage?.id,
      });
      void regenerateMessage(message, userMessage);
    },
    [logInspectorAction, regenerateMessage],
  );

  const handleComposerRegenerate = useCallback(() => {
    if (latestAssistantMessage) {
      handleRegenerateMessage(latestAssistantMessage);
    } else {
      handleRegenerateMessage();
    }
  }, [handleRegenerateMessage, latestAssistantMessage]);

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

  const handleRefreshKnowledge = useCallback(() => {
    logInspectorAction("knowledge.refresh", "Запрошено обновление памяти");
    void refreshKnowledgeStatus();
  }, [logInspectorAction, refreshKnowledgeStatus]);

  const handleUpdatePreferences = useCallback(
    (next: Partial<ConversationPreferences>) => {
      logInspectorAction("preferences.update", "Изменены настройки беседы", { preferences: next });
      updatePreferences(next);
    },
    [logInspectorAction, updatePreferences],
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

  useEffect(() => {
    if (isDesktop) {
      setSidebarOpen(false);
    }
  }, [isDesktop]);

  useEffect(() => {
    if (isZenMode) {
      setSidebarOpen(false);
    }
  }, [isZenMode]);

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
      <ChatLayout
        sidebar={
          <Sidebar
            conversations={conversationSummaries}
            activeConversationId={conversationId}
            onConversationSelect={handleSelectConversation}
            onCreateConversation={handleCreateConversation}
          />
        }
        isSidebarOpen={isSidebarOpen}
        onSidebarOpenChange={setSidebarOpen}
        footer={
          <div className="flex flex-col gap-4">
            <ChatComposer
              value={draft}
              mode={mode}
              isBusy={isProcessing || !bridgeReady}
              isStreaming={isStreaming}
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
              onStop={handleStopGeneration}
              onRegenerate={latestAssistantMessage ? handleComposerRegenerate : undefined}
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
        }
        isZenMode={isZenMode}
        motionPattern={motion}
        sidebarLabel="Навигация по беседам"
      >
        <ChatView
          messages={messages}
          isLoading={isProcessing}
          conversationId={conversationId}
          conversationTitle={conversationTitle}
          metrics={metrics}
          modeLabel={modeLabel}
          emptyState={<WelcomeScreen onSuggestionSelect={setDraft} />}
          onConversationTitleChange={handleRenameConversation}
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenKnowledge={() => setActivePanel("knowledge")}
          onOpenAnalytics={() => setActivePanel("analytics")}
          onOpenActions={() => setActivePanel("actions")}
          onOpenSwarm={() => setActivePanel("swarm")}
          onOpenPreferences={() => setActivePanel("preferences")}
          onRefreshKnowledge={handleRefreshKnowledge}
          isKnowledgeLoading={statusLoading}
          bridgeReady={bridgeReady}
          isZenMode={isZenMode}
          onToggleZenMode={handleToggleZenMode}
          personaName={activePersona.name}
          onViewportElementChange={registerCaptureTarget}
          onRegenerateMessage={handleRegenerateMessage}
        />
      </ChatLayout>

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

      <PanelDialog
        title="Параметры беседы"
        description="Управляйте приватностью, режимами обучения и голосом ассистента."
        isOpen={activePanel === "preferences"}
        onClose={() => setActivePanel(null)}
      >
        <ConversationPreferencesBar preferences={preferences} onChange={handleUpdatePreferences} />
      </PanelDialog>
    </>
  );
};

export default App;
