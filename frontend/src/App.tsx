import { useCallback, useMemo, useState } from "react";
import AppShell from "./components/AppShell";
import AnalyticsView from "./components/AnalyticsView";
import ChatInput from "./components/ChatInput";
import ChatView from "./components/ChatView";
import InspectorPanel from "./components/InspectorPanel";
import KernelControlsPanel from "./components/KernelControlsPanel";
import KnowledgeView from "./components/KnowledgeView";
import NavigationRail, { type NavigationSection } from "./components/NavigationRail";
import Sidebar from "./components/Sidebar";
import SwarmView from "./components/SwarmView";
import TopBar from "./components/TopBar";
import WelcomeScreen from "./components/WelcomeScreen";
import useKolibriChat from "./core/useKolibriChat";
import { findModeLabel } from "./core/modes";

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
    updateKernelControls,
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
            <div className="w-full flex-none lg:max-w-xs xl:max-w-sm">
              <Sidebar
                conversations={conversationSummaries}
                activeConversationId={conversationId}
                onConversationSelect={handleSelectConversation}
                onCreateConversation={handleCreateConversation}
              />
            </div>
            <div className="flex flex-1 flex-col gap-6">
              <div className="flex-1">{chatContent}</div>
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
    <AppShell
      navigation={
        <NavigationRail
          onCreateConversation={handleCreateConversation}
          isBusy={isProcessing}
          metrics={metrics}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />
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
        />
      }
      inspector={
        activeSection === "dialog" ? (
          <div className="flex h-full flex-col gap-4">
            <KernelControlsPanel controls={kernelControls} onChange={updateKernelControls} />
            <InspectorPanel
              status={knowledgeStatus}
              error={knowledgeError}
              isLoading={statusLoading}
              metrics={metrics}
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
  );
};

export default App;
