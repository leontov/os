import { Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import AnalyticsView from "./components/AnalyticsView";
import ChatInput from "./components/ChatInput";
import ChatView from "./components/ChatView";
import ConversationPreferencesBar from "./components/ConversationPreferencesBar";
import InspectorPanel from "./components/InspectorPanel";
import KernelControlsPanel from "./components/KernelControlsPanel";
import KnowledgeView from "./components/KnowledgeView";
import Sidebar from "./components/Sidebar";
import SwarmView from "./components/SwarmView";
import WelcomeScreen from "./components/WelcomeScreen";
import ChatLayout from "./components/layout/ChatLayout";
import useKolibriChat from "./core/useKolibriChat";
import { findModeLabel } from "./core/modes";
import useMediaQuery from "./core/useMediaQuery";

type PanelKey = "knowledge" | "swarm" | "analytics" | "controls" | "preferences" | null;

interface PanelDialogProps {
  title: string;
  description?: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

const PanelDialog = ({ title, description, isOpen, onClose, children }: PanelDialogProps) => {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-surface shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-text">{title}</h2>
            {description ? <p className="mt-1 text-sm text-text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 text-text-muted transition-colors hover:text-text"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="soft-scroll flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
};

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

  const handleCreateConversation = useCallback(() => {
    void createConversation();
  }, [createConversation]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      selectConversation(id);
    },
    [selectConversation],
  );

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
