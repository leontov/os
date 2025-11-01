import { Fragment, Suspense, lazy, useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Menu, BarChart3, Database, SlidersHorizontal, PanelsTopLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Header } from "../components/layout/Header";
import { Sidebar } from "../components/layout/Sidebar";
import { RightDrawer } from "../components/layout/RightDrawer";
import { MessageList } from "../components/chat/MessageList";
import { Composer } from "../components/chat/Composer";
import { Button } from "../components/ui/Button";
import { useI18n } from "../app/i18n";
import { useToast } from "../components/feedback/Toast";
import { useTheme } from "../design/theme";
import { useOfflineQueue } from "../shared/hooks/useOfflineQueue";
import { ConversationHero } from "../components/chat/ConversationHero";
import { Badge } from "../components/ui/Badge";
import {
  useConversationState,
  getConversationMemoryEntries,
} from "../modules/history";
import { useMessageComposer, useHeroParticipants, useHeroMetrics } from "../modules/chat";
import { useConversationMode, getModelParameterEntries } from "../modules/models";
import { useDrawerSections } from "../modules/analytics";
import {
  useInstallPromptBanner,
  useResponsivePanels,
  useCommandMenuShortcut,
} from "../modules/core";

const CommandMenu = lazy(async () =>
  import("../components/layout/CommandMenu").then((module) => ({ default: module.CommandMenu })),
);

function ChatPage() {
  const { t, locale } = useI18n();
  const { setTheme, theme, resolvedTheme } = useTheme();
  const { publish } = useToast();
  const { isOffline } = useOfflineQueue();
  const navigate = useNavigate();
  const [isDrawerOpen, setDrawerOpen] = useState(true);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isCommandOpen, setCommandOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("analytics");
  const [draft, setDraft] = useState("");

  const conversationState = useConversationState(t("chat.newConversationTitle"), t("chat.updatedJustNow"));
  const { mode, setMode, modeLabel } = useConversationMode(t);
  const memoryEntries = useMemo(() => getConversationMemoryEntries(t), [t]);
  const parameterEntries = useMemo(() => getModelParameterEntries(t), [t]);
  const { sections } = useDrawerSections(t, { memoryEntries, parameterEntries });
  const { promptEvent, clearPrompt, dismissPrompt, dismissed } = useInstallPromptBanner();

  useResponsivePanels({ setDrawerOpen, setSidebarOpen });
  useCommandMenuShortcut(() => setCommandOpen(true));

  const activeMessages = conversationState.activeConversation
    ? conversationState.messages[conversationState.activeConversation] ?? []
    : [];

  const activeConversationEntry = useMemo(
    () =>
      conversationState.conversations.find(
        (conversation) => conversation.id === conversationState.activeConversation,
      ) ?? null,
    [conversationState.conversations, conversationState.activeConversation],
  );

  const headerSubtitle = activeConversationEntry
    ? `${activeConversationEntry.title} • ${activeConversationEntry.updatedAt}`
    : t("chat.emptyConversation");

  const heroParticipants = useHeroParticipants(activeConversationEntry, t);
  const heroMetrics = useHeroMetrics(t);
  const readMessages = useCallback(
    (id: string) => conversationState.messages[id] ?? [],
    [conversationState.messages],
  );

  const handleSend = useMessageComposer({
    activeConversation: conversationState.activeConversation,
    appendMessage: conversationState.appendMessage,
    authorLabel: "Вы",
    assistantLabel: "Колибри",
    setStatus: conversationState.setStatus,
    getMessages: readMessages,
    mode,
    locale,
  });

  return (
    <div className="grid min-h-screen grid-rows-[auto,1fr] bg-[var(--bg)] text-[var(--text)]">
      <a
        href="#chat-main"
        className="absolute left-4 top-4 z-50 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-black focus:translate-y-12 focus:outline-none"
      >
        {t("app.skip")}
      </a>
      <Header
        title={t("app.title")}
        subtitle={headerSubtitle}
        context={
          <span className="flex flex-wrap items-center gap-2 text-[var(--muted)]">
            <Badge tone="accent" className="bg-[rgba(74,222,128,0.16)] text-[var(--brand)]">
              {modeLabel}
            </Badge>
            <span>{t("hero.active")}</span>
          </span>
        }
        onSearch={() => publish({ title: t("header.actions.search"), tone: "success" })}
        onShare={() => publish({ title: t("header.actions.share"), tone: "success" })}
        onExport={() => publish({ title: t("header.actions.export"), tone: "success" })}
        onMenu={() => setDrawerOpen((value) => !value)}
        onOpenCommand={() => setCommandOpen(true)}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        resolvedTheme={resolvedTheme}
        onToggleSidebar={() => setSidebarOpen(true)}
        isOffline={isOffline}
        offlineLabel={t("header.offline")}
      />
      {isOffline ? (
        <div className="bg-[rgba(251,191,36,0.12)] px-4 py-2 text-center text-sm text-[var(--warn)]">
          {t("offline.banner")}
        </div>
      ) : null}
      {!isOffline && promptEvent && !dismissed ? (
        <div className="flex items-center justify-center gap-3 bg-[rgba(74,222,128,0.12)] px-4 py-2 text-sm text-[var(--brand)]">
          <span>{t("pwa.install")}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await promptEvent.prompt();
              const choice = await promptEvent.userChoice;
              if (choice.outcome === "accepted") {
                publish({ title: t("pwa.accepted"), tone: "success" });
              }
              clearPrompt();
            }}
          >
            {t("pwa.install")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              dismissPrompt();
            }}
          >
            {t("pwa.dismiss")}
          </Button>
        </div>
      ) : null}
      <div className="grid h-full w-full grid-cols-1 xl:grid-cols-[20rem_minmax(0,1fr)_26rem]">
        <aside className="hidden border-r border-[var(--border-subtle)] xl:flex">
          <Sidebar
            conversations={conversationState.conversations}
            activeConversationId={conversationState.activeConversation}
            onSelectConversation={conversationState.selectConversation}
            onNewConversation={conversationState.createConversation}
            onOpenSettings={() => navigate("/settings")}
            onCreateFolder={() => publish({ title: t("sidebar.folderCreated"), tone: "success" })}
          />
        </aside>
        <main
          id="chat-main"
          className="relative flex min-h-[calc(100vh-5rem)] flex-1 flex-col bg-[var(--bg)]"
          role="main"
          aria-label="Область диалога"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 opacity-90"
            style={{ background: "var(--gradient-backdrop)" }}
          />
          <div className="flex flex-1 flex-col gap-6 px-4 pb-[calc(6.5rem+var(--safe-area-bottom))] pt-6 sm:px-8 lg:px-12">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{t("header.dialogTitle")}</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="xl:hidden"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Открыть список бесед"
                >
                  <PanelsTopLeft aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="xl:hidden"
                  onClick={() => setDrawerOpen((value) => !value)}
                  aria-label="Переключить панель контекста"
                >
                  <Menu aria-hidden />
                </Button>
              </div>
            </div>
            <ConversationHero
              summary={t("hero.summary")}
              mode={mode}
              onModeChange={setMode}
              participants={heroParticipants}
              metrics={heroMetrics}
              isOffline={isOffline}
              offlineLabel={t("header.offline")}
            />
            <section className="flex-1">
              <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-[var(--surface-border)] bg-[var(--surface-card-strong)] shadow-[var(--shadow-1)]">
                <div className="flex items-center justify-between border-b border-[var(--surface-divider)] px-4 py-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--muted)]">
                    {t("chat.timeline")}
                  </span>
                  <Badge tone="neutral" className="bg-[rgba(255,255,255,0.06)] text-[var(--muted)]">
                    {t("chat.modeLabel")}: {modeLabel}
                  </Badge>
                </div>
                <div className="flex-1 overflow-hidden p-2 sm:p-4">
                  <MessageList
                    messages={activeMessages}
                    status={conversationState.status}
                    onRetry={() => {
                      if (conversationState.activeConversation) {
                        conversationState.selectConversation(conversationState.activeConversation);
                      }
                    }}
                  />
                </div>
              </div>
            </section>
          </div>
          <div className="sticky bottom-0 left-0 right-0 border-t border-[var(--border-subtle)] bg-[rgba(14,17,22,0.95)] px-4 pb-[calc(1.5rem+var(--safe-area-bottom))] pt-4 sm:px-8 lg:px-12">
            <Composer
              draft={draft}
              onChange={setDraft}
              onSend={handleSend}
              disabled={conversationState.status === "loading"}
            />
          </div>
        </main>
        <RightDrawer
          sections={sections}
          activeSection={activeTab}
          onChangeSection={setActiveTab}
          isOpen={isDrawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={t("rightDrawer.title")}
          menuLabel={t("rightDrawer.title")}
          closeLabel={t("rightDrawer.close")}
        />
      </div>
      <div className="lg:hidden">
        <nav className="flex items-center justify-around border-t border-[var(--border-subtle)] bg-[var(--bg-elev)] px-4 py-2 text-xs text-[var(--muted)]">
          <button type="button" className="flex flex-col items-center gap-1" onClick={() => setActiveTab("analytics")}>
            <BarChart3 aria-hidden className="h-5 w-5" />
            {t("drawer.analytics")}
          </button>
          <button type="button" className="flex flex-col items-center gap-1" onClick={() => setActiveTab("memory")}>
            <Database aria-hidden className="h-5 w-5" />
            {t("drawer.memory")}
          </button>
          <button type="button" className="flex flex-col items-center gap-1" onClick={() => setActiveTab("parameters")}>
            <SlidersHorizontal aria-hidden className="h-5 w-5" />
            {t("drawer.parameters")}
          </button>
        </nav>
        {isDrawerOpen ? (
          <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-elev)] p-4">
            {sections
              .filter((section) => section.value === activeTab)
              .map((section) => (
                <Fragment key={section.value}>{section.content}</Fragment>
              ))}
          </div>
        ) : null}
      </div>
      <Suspense fallback={null}>
        <CommandMenu open={isCommandOpen} onClose={() => setCommandOpen(false)} />
      </Suspense>
      {isSidebarOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-stretch justify-start bg-[rgba(6,8,10,0.7)] px-4 py-8 xl:hidden">
              <div className="absolute inset-0" onClick={() => setSidebarOpen(false)} aria-hidden />
              <div className="relative mr-auto flex h-full w-full max-w-xs flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-overlay)]">
                <Sidebar
                  conversations={conversationState.conversations}
                  activeConversationId={conversationState.activeConversation}
                  onSelectConversation={(id) => {
                    conversationState.selectConversation(id);
                    setSidebarOpen(false);
                  }}
                  onNewConversation={() => {
                    conversationState.createConversation();
                    setSidebarOpen(false);
                  }}
                  onOpenSettings={() => {
                    setSidebarOpen(false);
                    navigate("/settings");
                  }}
                  onCreateFolder={() => publish({ title: t("sidebar.folderCreated"), tone: "success" })}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export default ChatPage;
