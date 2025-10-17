import { useMemo, useState } from "react";
import AppShell from "./components/AppShell";
import AnalyticsView from "./components/AnalyticsView";
import ChatInput from "./components/ChatInput";
import ChatView from "./components/ChatView";
import InspectorPanel from "./components/InspectorPanel";
import KnowledgeView from "./components/KnowledgeView";
import NavigationRail from "./components/NavigationRail";
import type { NavigationSection } from "./components/NavigationRail";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import SwarmView from "./components/SwarmView";
import WelcomeScreen from "./components/WelcomeScreen";
import useKolibriChat from "./core/useKolibriChat";
import type { SectionKey } from "./components/NavigationRail";

const App = () => {
  const [activeSection, setActiveSection] = useState<NavigationSection>("dialog");
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
    conversations,
    attachments,
    setDraft,
    setMode,
    renameConversation,
    sendMessage,
    resetConversation,
    refreshKnowledgeStatus,
    selectConversation,
    attachFiles,
    removeAttachment,
    clearAttachments,
  } = useKolibriChat();

  const [activeSection, setActiveSection] = useState<SectionKey>("dialog");

  const chatContent = useMemo(() => {
    if (!messages.length) {
      return <WelcomeScreen onSuggestionSelect={setDraft} />;
    }

    return <ChatView messages={messages} isLoading={isProcessing} conversationId={conversationId} />;
  }, [conversationId, isProcessing, messages, setDraft]);

  const renderSection = () => {
    if (activeSection === "dialog") {
      return (
        <div className="flex flex-1 flex-col gap-6 lg:flex-row">
          <div className="order-1 w-full flex-none lg:max-w-xs xl:max-w-sm">
            <Sidebar
              conversations={conversations}
              activeConversationId={conversationId}
              onSelectConversation={selectConversation}
              onCreateConversation={resetConversation}
              isBusy={isProcessing}
            />
          </div>
          <div className="order-2 flex flex-1 flex-col gap-6">
            <div className="flex-1">{mainContent}</div>
            <ChatInput
              value={draft}
              mode={mode}
              isBusy={isProcessing || !bridgeReady}
              onChange={setDraft}
              onModeChange={setMode}
              onSubmit={sendMessage}
              onReset={resetConversation}
              onAttach={attachFiles}
              onRemoveAttachment={removeAttachment}
              onClear={clearAttachments}
              attachments={attachments}
            />
          </div>
        </div>
      );
    }

    const sectionCopy: Record<Exclude<NavigationSection, "dialog">, { title: string; description: string }> = {
      knowledge: {
        title: "Раздел знаний",
        description:
          "Здесь появится управление корпоративной памятью и инструменты поиска по загруженным документам.",
      },
      swarm: {
        title: "Модуль роя",
        description:
          "Планировщик параллельных агентов находится в разработке. Следите за обновлениями Колибри.",
      },
      analytics: {
        title: "Аналитика",
        description:
          "В этом разделе будут собраны метрики продуктивности, история обращений и визуализации качества ответов.",
      },
    };

    const placeholder = sectionCopy[activeSection as Exclude<NavigationSection, "dialog">];

    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-2xl rounded-3xl border border-border-strong bg-background-card/80 p-10 text-center shadow-xl">
          <h2 className="text-2xl font-semibold text-text-primary">{placeholder.title}</h2>
          <p className="mt-4 text-sm leading-relaxed text-text-secondary">{placeholder.description}</p>
        </div>
      </div>
    );
  };

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
      }
    >
      {renderSection()}
      )}
      {activeSection === "swarm" && <SwarmView />}
      {activeSection === "analytics" && <AnalyticsView />}
    </AppShell>
  );
};

export default App;
