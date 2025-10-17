import { useMemo, useState } from "react";
import AppShell from "./components/AppShell";
import AnalyticsView from "./components/AnalyticsView";
import ChatInput from "./components/ChatInput";
import ChatView from "./components/ChatView";
import InspectorPanel from "./components/InspectorPanel";
import KnowledgeView from "./components/KnowledgeView";
import NavigationRail from "./components/NavigationRail";
import TopBar from "./components/TopBar";
import SwarmView from "./components/SwarmView";
import WelcomeScreen from "./components/WelcomeScreen";
import useKolibriChat from "./core/useKolibriChat";
import type { SectionKey } from "./components/NavigationRail";

const App = () => {
  const {
    messages,
    draft,
    mode,
    isProcessing,
    bridgeReady,
    conversationId,
    conversationTitle,
    knowledgeStatus,
    knowledgeError,
    statusLoading,
    latestAssistantMessage,
    metrics,
    setDraft,
    setMode,
    renameConversation,
    sendMessage,
    resetConversation,
    refreshKnowledgeStatus,
  } = useKolibriChat();

  const [activeSection, setActiveSection] = useState<SectionKey>("dialog");

  const chatContent = useMemo(() => {
    if (!messages.length) {
      return <WelcomeScreen onSuggestionSelect={setDraft} />;
    }

    return <ChatView messages={messages} isLoading={isProcessing} conversationId={conversationId} />;
  }, [conversationId, isProcessing, messages, setDraft]);

  return (
    <AppShell
      navigation={
        <NavigationRail
          onCreateConversation={resetConversation}
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
          onRefreshKnowledge={refreshKnowledgeStatus}
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
            onRefresh={refreshKnowledgeStatus}
          />
        ) : undefined
      }
    >
      {activeSection === "dialog" && (
        <div className="flex h-full flex-1 flex-col gap-6">
          <div className="flex-1">{chatContent}</div>
          <ChatInput
            value={draft}
            mode={mode}
            isBusy={isProcessing || !bridgeReady}
            onChange={setDraft}
            onModeChange={setMode}
            onSubmit={sendMessage}
            onReset={resetConversation}
          />
        </div>
      )}
      {activeSection === "knowledge" && (
        <KnowledgeView
          status={knowledgeStatus}
          error={knowledgeError}
          isLoading={statusLoading}
          onRefresh={refreshKnowledgeStatus}
        />
      )}
      {activeSection === "swarm" && <SwarmView />}
      {activeSection === "analytics" && <AnalyticsView />}
    </AppShell>
  );
};

export default App;
