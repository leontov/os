import { useCallback, useMemo, useState } from "react";
import AppShell from "./components/AppShell";
import AnalyticsView from "./components/AnalyticsView";
import ChatInput from "./components/ChatInput";
import ChatView from "./components/ChatView";
import InspectorPanel from "./components/InspectorPanel";
import KnowledgeView from "./components/KnowledgeView";
import NavigationRail, { type NavigationSection } from "./components/NavigationRail";
import Sidebar from "./components/Sidebar";
import SwarmView from "./components/SwarmView";
import TopBar from "./components/TopBar";
import WelcomeScreen from "./components/WelcomeScreen";
import useKolibriChat from "./core/useKolibriChat";

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

  const chatContent = useMemo(() => {
    if (!messages.length) {
      return <WelcomeScreen onSuggestionSelect={setDraft} />;
    }

    return <ChatView messages={messages} isLoading={isProcessing} conversationId={conversationId} />;
  }, [conversationId, isProcessing, messages, setDraft]);

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
        ) : undefined
      }
    >
      {renderSection()}
    </AppShell>
  );
};

export default App;
