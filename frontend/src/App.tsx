import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import AnalyticsView from "./components/AnalyticsView";
import ChatInput from "./components/ChatInput";
import ChatView from "./components/ChatView";
import ConversationPreferencesBar from "./components/ConversationPreferencesBar";
import DemoPage, { DemoMetrics } from "./components/DemoPage";
import InspectorPanel from "./components/InspectorPanel";
import KernelControlsPanel from "./components/KernelControlsPanel";
import KnowledgeView from "./components/KnowledgeView";
import Sidebar from "./components/Sidebar";
import SwarmView from "./components/SwarmView";
import WelcomeScreen from "./components/WelcomeScreen";
import ChatLayout from "./components/layout/ChatLayout";
import PanelDialog from "./components/layout/PanelDialog";
import useKolibriChat from "./core/useKolibriChat";
import { findModeLabel } from "./core/modes";
import useMediaQuery from "./core/useMediaQuery";

type PanelKey = "knowledge" | "swarm" | "analytics" | "controls" | "preferences" | null;

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
    resetConversation,
    selectConversation,
    createConversation,
    refreshKnowledgeStatus,
  } = useKolibriChat();

  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelKey>(null);
  const [isDemoMode, setDemoMode] = useState(false);
  const [demoMetrics, setDemoMetrics] = useState<DemoMetrics>({
    coldStartMs: null,
    wasmBytes: null,
    offlineFallback: false,
    degradedReason: null,
  });
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const modeLabel = useMemo(() => findModeLabel(mode), [mode]);

  const handleSuggestionSelect = useCallback(
    (suggestion: string) => {
      const trimmedDraft = draft.trimEnd();
      const prefix = trimmedDraft.length > 0 ? `${trimmedDraft}\n\n` : "";
      setDraft(`${prefix}${suggestion}`);
    },
    [draft, setDraft],
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

  const handleCreateConversation = useCallback(() => {
    void createConversation();
  }, [createConversation]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      selectConversation(id);
    },
    [selectConversation],
  );

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
            <ChatInput
              value={draft}
              mode={mode}
              isBusy={isProcessing || !bridgeReady}
              attachments={attachments}
              onChange={setDraft}
              onModeChange={setMode}
              onSubmit={() => {
                void sendMessage();
              }}
              onReset={() => {
                void resetConversation();
              }}
              onAttach={attachFiles}
              onRemoveAttachment={removeAttachment}
              onClearAttachments={clearAttachments}
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
        }
      >
        <ChatView
          messages={messages}
          isLoading={isProcessing}
          conversationId={conversationId}
          conversationTitle={conversationTitle}
          metrics={metrics}
          modeLabel={modeLabel}
          emptyState={<WelcomeScreen onSuggestionSelect={setDraft} />}
          onConversationTitleChange={renameConversation}
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenKnowledge={() => setActivePanel("knowledge")}
          onOpenAnalytics={() => setActivePanel("analytics")}
          onOpenSwarm={() => setActivePanel("swarm")}
          onOpenPreferences={() => setActivePanel("preferences")}
          onRefreshKnowledge={() => {
            void refreshKnowledgeStatus();
          }}
          isKnowledgeLoading={statusLoading}
          bridgeReady={bridgeReady}
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
            onRefresh={() => {
              void refreshKnowledgeStatus();
            }}
          />
        </div>
      </PanelDialog>

      <PanelDialog
        title="Параметры беседы"
        description="Управляйте приватностью, режимами обучения и голосом ассистента."
        isOpen={activePanel === "preferences"}
        onClose={() => setActivePanel(null)}
      >
        <ConversationPreferencesBar preferences={preferences} onChange={updatePreferences} />
      </PanelDialog>
    </>
  );
};

export default App;
