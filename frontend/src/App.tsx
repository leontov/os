import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "./components/AppShell";
import AnalyticsView from "./components/AnalyticsView";
import ChatInput from "./components/ChatInput";
import ChatView from "./components/ChatView";
import ConversationPreferencesBar from "./components/ConversationPreferencesBar";
import MobileDock from "./components/MobileDock";
import InspectorPanel from "./components/InspectorPanel";
import KernelControlsPanel from "./components/KernelControlsPanel";
import KnowledgeView from "./components/KnowledgeView";
import NavigationRail from "./components/NavigationRail";
import type { NavigationSection } from "./components/navigation";
import OverlaySheet from "./components/OverlaySheet";
import Sidebar from "./components/Sidebar";
import SwarmView from "./components/SwarmView";
import TopBar from "./components/TopBar";
import WelcomeScreen from "./components/WelcomeScreen";
import useKolibriChat from "./core/useKolibriChat";
import { findModeLabel } from "./core/modes";
import useMediaQuery from "./core/useMediaQuery";

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

  const [activeSection, setActiveSection] = useState<NavigationSection>("dialog");
  const [isInspectorOpen, setInspectorOpen] = useState(false);
  const [isHistoryOpen, setHistoryOpen] = useState(false);
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

  const chatContent = useMemo(() => {
    if (!messages.length) {
      return <WelcomeScreen onSuggestionSelect={setDraft} />;
    }

    return (
      <ChatView
        messages={messages}
        isLoading={isProcessing}
        isBusy={isProcessing}
        conversationId={conversationId}
        conversationTitle={conversationTitle}
        metrics={metrics}
        modeLabel={modeLabel}
        onSuggestionSelect={handleSuggestionSelect}
      />
    );
  }, [conversationId, conversationTitle, handleSuggestionSelect, isProcessing, messages, metrics, modeLabel, setDraft]);

  useEffect(() => {
    if (isDesktop) {
      setInspectorOpen(false);
      setHistoryOpen(false);
    }
  }, [isDesktop]);

  useEffect(() => {
    if (activeSection !== "dialog") {
      setInspectorOpen(false);
      setHistoryOpen(false);
    }
  }, [activeSection]);

  const handleCreateConversation = useCallback(() => {
    void createConversation();
  }, [createConversation]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      selectConversation(id);
    },
    [selectConversation],
  );

  const renderSection = () => {
    switch (activeSection) {
      case "dialog":
        return (
          <div className="flex flex-1 flex-col gap-6 lg:flex-row">
            {isDesktop ? (
              <div className="w-full flex-none lg:max-w-xs xl:max-w-sm">
                <Sidebar
                  conversations={conversationSummaries}
                  activeConversationId={conversationId}
                  onConversationSelect={handleSelectConversation}
                  onCreateConversation={handleCreateConversation}
                />
              </div>
            ) : null}
            <div className="flex flex-1 flex-col gap-6">
              <div className="flex-1">{chatContent}</div>
              <ConversationPreferencesBar preferences={preferences} onChange={updatePreferences} />
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
                onOpenControls={!isDesktop ? () => setInspectorOpen(true) : undefined}
              />
            </div>
          </div>
        );
      case "knowledge":
        return (
          <KnowledgeView
            status={knowledgeStatus}
            error={knowledgeError}
            isLoading={statusLoading}
            onRefresh={() => {
              void refreshKnowledgeStatus();
            }}
          />
        );
      case "swarm":
        return <SwarmView />;
      case "analytics":
        return <AnalyticsView />;
      default:
        return null;
    }
  };

  return (
    <>
      <AppShell
        navigation={
          isDesktop ? (
            <NavigationRail
              onCreateConversation={handleCreateConversation}
              isBusy={isProcessing}
              metrics={metrics}
              activeSection={activeSection}
              onSectionChange={setActiveSection}
            />
          ) : undefined
        }
        mobileNavigation={
          !isDesktop ? (
            <MobileDock
              activeSection={activeSection}
              onSectionChange={setActiveSection}
              onCreateConversation={handleCreateConversation}
              onOpenHistory={() => setHistoryOpen(true)}
              onOpenControls={() => setInspectorOpen(true)}
              isBusy={isProcessing}
              metrics={metrics}
            />
          ) : undefined
        }
        header={
          <TopBar
            title={conversationTitle}
            onTitleChange={renameConversation}
            isProcessing={isProcessing}
            bridgeReady={bridgeReady}
            knowledgeStatus={knowledgeStatus}
            metrics={metrics}
            onRefreshKnowledge={() => {
              void refreshKnowledgeStatus();
            }}
            isKnowledgeLoading={statusLoading}
            showMobileActions={!isDesktop}
            onOpenHistory={() => setHistoryOpen(true)}
            onOpenControls={() => setInspectorOpen(true)}
            onlineAllowed={preferences.allowOnline}
          />
        }
        inspector={
          activeSection === "dialog" && isDesktop ? (
            <div className="flex h-full flex-col gap-4">
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
          ) : undefined
        }
      >
        {renderSection()}
      </AppShell>
      <OverlaySheet
        title="История диалогов"
        description="Быстро переключайтесь между недавними беседами."
        isOpen={!isDesktop && isHistoryOpen}
        onClose={() => setHistoryOpen(false)}
      >
        <Sidebar
          conversations={conversationSummaries}
          activeConversationId={conversationId}
          onConversationSelect={(id) => {
            handleSelectConversation(id);
            setHistoryOpen(false);
          }}
          onCreateConversation={() => {
            handleCreateConversation();
            setHistoryOpen(false);
          }}
        />
      </OverlaySheet>
      <OverlaySheet
        title="Управление ядром"
        description="Настройте режимы, параметры генерации и просмотрите метрики."
        isOpen={!isDesktop && isInspectorOpen}
        onClose={() => setInspectorOpen(false)}
        footer="Изменения применяются мгновенно и сохраняются для текущей сессии."
      >
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
            setInspectorOpen(false);
            void refreshKnowledgeStatus();
          }}
        />
      </OverlaySheet>
    </>
  );
};

export default App;
