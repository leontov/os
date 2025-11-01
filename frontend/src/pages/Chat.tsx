import { Fragment, Suspense, lazy, useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3,
  Database,
  SlidersHorizontal,
  Sparkles,
  Calculator,
  FileText,
  Languages,
  Code2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Header } from "../components/layout/Header";
import { MessageList } from "../components/chat/MessageList";
import { Composer } from "../components/chat/Composer";
import { Button } from "../components/ui/Button";
import { useI18n, type Translator } from "../app/i18n";
import { useToast } from "../components/feedback/Toast";
import { useTheme } from "../design/theme";
import { useOfflineQueue } from "../shared/hooks/useOfflineQueue";
import { ConversationHero } from "../components/chat/ConversationHero";
import { Badge } from "../components/ui/Badge";
import { QuickActions, type QuickAction } from "../components/chat/QuickActions";
import {
  useConversationState,
  getConversationMemoryEntries,
} from "../modules/history";
import { useMessageComposer, useHeroParticipants, useHeroMetrics } from "../modules/chat";
import { useConversationMode, getModelParameterEntries } from "../modules/models";
import { useDrawerSections } from "../modules/analytics";
import { useProfileState } from "../modules/profile";
import {
  useInstallPromptBanner,
  useResponsivePanels,
  useCommandMenuShortcut,
} from "../modules/core";

const CommandMenu = lazy(async () =>
  import("../components/layout/CommandMenu").then((module) => ({ default: module.CommandMenu })),
);

const Sidebar = lazy(async () =>
  import("../components/layout/Sidebar").then((module) => ({ default: module.Sidebar })),
);

const RightDrawer = lazy(async () =>
  import("../components/layout/RightDrawer").then((module) => ({ default: module.RightDrawer })),
);

function SidebarFallback() {
  return (
    <div className="flex h-full flex-col gap-4 border-r border-[var(--surface-border)]/70 bg-[var(--bg-overlay)]/60 px-4 py-6 backdrop-blur-2xl">
      <div className="flex items-center gap-2">
        <div className="h-12 flex-1 rounded-2xl bg-[rgba(255,255,255,0.06)]" data-loading />
        <div className="h-12 w-12 rounded-2xl bg-[rgba(255,255,255,0.06)]" data-loading />
      </div>
      <div className="h-10 rounded-2xl bg-[rgba(255,255,255,0.04)]" data-loading />
      <div className="space-y-3 overflow-hidden">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-16 rounded-2xl bg-[rgba(255,255,255,0.04)]" data-loading />
        ))}
      </div>
      <div className="mt-auto h-12 rounded-2xl bg-[rgba(255,255,255,0.04)]" data-loading />
    </div>
  );
}

function DrawerFallback({ isOpen, title }: { isOpen: boolean; title: string }) {
  return (
    <>
      <aside
        className={`hidden h-full w-[26rem] flex-shrink-0 flex-col border-l border-[var(--surface-border)]/70 bg-[var(--bg-overlay)]/70 backdrop-blur-2xl xl:flex ${
          isOpen ? "" : "xl:hidden"
        }`.trim()}
        aria-label={title}
      >
        <div className="flex h-full flex-col gap-4 p-6 animate-pulse">
          <div className="h-5 w-32 rounded-full bg-[rgba(255,255,255,0.08)]" data-loading />
          <div className="space-y-3 overflow-y-auto">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-24 rounded-3xl border border-[var(--surface-border)] bg-[var(--surface-glass)]" data-loading />
            ))}
          </div>
        </div>
      </aside>
      {isOpen ? (
        <div className="xl:hidden">
          <div className="border-t border-[var(--surface-border)]/70 bg-[var(--bg-overlay)]/80 p-4 animate-pulse">
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-20 rounded-3xl border border-[var(--surface-border)] bg-[var(--surface-glass)]" data-loading />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ChatPage() {
  const { t, locale } = useI18n();
  const translate = useMemo<Translator>(() => t, [t]);
  const profileState = useProfileState();
  const { setTheme, theme, resolvedTheme } = useTheme();
  const { publish } = useToast();
  const { isOffline } = useOfflineQueue();
  const navigate = useNavigate();
  const [isDrawerOpen, setDrawerOpen] = useState(true);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isCommandOpen, setCommandOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("analytics");
  const [draft, setDraft] = useState("");

  const memoryEntries = useMemo(() => getConversationMemoryEntries(translate), [translate]);
  const parameterEntries = useMemo(() => getModelParameterEntries(translate), [translate]);

  const conversationState = useConversationState(
    translate("chat.newConversationTitle"),
    translate("chat.updatedJustNow"),
    profileState.activeProfileId,
  );
  const {
    conversations,
    conversationCounts,
    activeConversation,
    messages,
    status,
    selectConversation,
    createConversation,
    appendMessage,
    updateMessage,
    setStatus,
  } = conversationState;

  const { mode, setMode, modeLabel, isAdaptiveMode, setAdaptiveMode } = useConversationMode(translate);

  const activeConversationEntry = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversation) ?? null,
    [conversations, activeConversation],
  );

  const activeMessages = useMemo(
    () => (activeConversation ? messages[activeConversation] ?? [] : []),
    [activeConversation, messages],
  );

  const activeProfile = profileState.activeProfile;
  const profileName = activeProfile?.name ?? null;
  const profileMetrics = activeProfile?.metrics ?? null;
  const languages = useMemo(() => activeProfile?.languages ?? [], [activeProfile?.languages]);
  const conversationCount = conversationCounts[profileState.activeProfileId] ?? 0;

  const analyticsDependencies = useMemo(
    () => ({
      memoryEntries,
      parameterEntries,
      profileName,
      profileMetrics,
      languages,
      conversationCount,
    }),
    [memoryEntries, parameterEntries, profileName, profileMetrics, languages, conversationCount],
  );

  const { sections } = useDrawerSections(translate, analyticsDependencies);
  const { promptEvent, clearPrompt, dismissPrompt, dismissed } = useInstallPromptBanner();

  useResponsivePanels({ setDrawerOpen, setSidebarOpen });
  useCommandMenuShortcut(() => setCommandOpen(true));

  const headerSubtitle = useMemo(() => {
    const name = profileName ?? "";
    if (activeConversationEntry) {
      const parts = [name, activeConversationEntry.title, activeConversationEntry.updatedAt];
      return parts.filter(Boolean).join(" • ");
    }
    return name || t("chat.emptyConversation");
  }, [activeConversationEntry, profileName, t]);

  const heroParticipants = useHeroParticipants(activeConversationEntry, t);
  const heroMetrics = useHeroMetrics(t);
  const readMessages = useCallback((id: string) => messages[id] ?? [], [messages]);

  const handleCreateFolder = useCallback(() => {
    publish({ title: t("sidebar.folderCreated"), tone: "success" });
  }, [publish, t]);

  const handleOpenSettings = useCallback(() => {
    navigate("/settings");
  }, [navigate]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((value) => !value);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const handleMobileNewConversation = useCallback(() => {
    createConversation();
    setSidebarOpen(false);
  }, [createConversation]);

  const handleMobileOpenSettings = useCallback(() => {
    setSidebarOpen(false);
    navigate("/settings");
  }, [navigate]);

  const handleMobileCreateFolder = useCallback(() => {
    handleCreateFolder();
    setSidebarOpen(false);
  }, [handleCreateFolder]);

  const handleMobileCloseSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const handleMobileSelectConversation = useCallback(
    (id: string) => {
      selectConversation(id);
      setSidebarOpen(false);
    },
    [selectConversation],
  );

  const handleCloseCommandMenu = useCallback(() => {
    setCommandOpen(false);
  }, []);

  const handleSend = useMessageComposer({
    activeConversation,
    appendMessage,
    updateMessage,
    authorLabel: "Вы",
    assistantLabel: "Колибри",
    setStatus,
    getMessages: readMessages,
    mode,
    locale,
    adaptiveMode: isAdaptiveMode,
  });

  const quickActions = useMemo<QuickAction[]>(
    () => [
      {
        id: "math",
        title: t("chat.quickActions.actions.math.title"),
        description: t("chat.quickActions.actions.math.description"),
        prompt: t("chat.quickActions.actions.math.prompt"),
        icon: Calculator,
        accent: "#38bdf8",
      },
      {
        id: "summary",
        title: t("chat.quickActions.actions.summary.title"),
        description: t("chat.quickActions.actions.summary.description"),
        prompt: t("chat.quickActions.actions.summary.prompt"),
        icon: FileText,
        accent: "#a855f7",
      },
      {
        id: "translate",
        title: t("chat.quickActions.actions.translate.title"),
        description: t("chat.quickActions.actions.translate.description"),
        prompt: t("chat.quickActions.actions.translate.prompt"),
        icon: Languages,
        accent: "#f97316",
      },
      {
        id: "code",
        title: t("chat.quickActions.actions.code.title"),
        description: t("chat.quickActions.actions.code.description"),
        prompt: t("chat.quickActions.actions.code.prompt"),
        icon: Code2,
        accent: "#4ade80",
      },
    ],
    [t],
  );

  const handleSelectQuickAction = useCallback(
    (prompt: string) => {
      setDraft(prompt);
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          const textarea = document.querySelector<HTMLTextAreaElement>("[data-composer-input=\"true\"]");
          if (textarea) {
            textarea.focus();
            textarea.setSelectionRange(prompt.length, prompt.length);
          }
        });
      }
    },
    [setDraft],
  );

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-95"
        style={{ background: "var(--gradient-backdrop)" }}
      />
      <a
        href="#chat-main"
        className="absolute left-4 top-4 z-50 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-black shadow-[var(--brand-glow)] transition hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
      >
        {t("app.skip")}
      </a>
      <Header
        title={t("app.title")}
        subtitle={headerSubtitle}
        context={
          <div className="flex flex-wrap items-center gap-2 text-[var(--muted)]">
            <Badge tone="accent" className="bg-[rgba(74,222,128,0.16)] text-[var(--brand)]">
              {modeLabel}
            </Badge>
            <span>{t("hero.active")}</span>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                {t("profile.switcher.label")}
              </span>
              {profileState.profiles.map((profile) => {
                const isActive = profile.id === profileState.activeProfileId;
                return (
                  <Button
                    key={profile.id}
                    variant={isActive ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => profileState.selectProfile(profile.id)}
                  >
                    {profile.name}
                  </Button>
                );
              })}
            </div>
          </div>
        }
        onSearch={() => publish({ title: t("header.actions.search"), tone: "success" })}
        onShare={() => publish({ title: t("header.actions.share"), tone: "success" })}
        onExport={() => publish({ title: t("header.actions.export"), tone: "success" })}
        onMenu={() => setDrawerOpen((value) => !value)}
        onOpenCommand={() => setCommandOpen(true)}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        resolvedTheme={resolvedTheme}
        onToggleSidebar={handleToggleSidebar}
        isOffline={isOffline}
        offlineLabel={t("header.offline")}
      />
      {isOffline ? (
        <div className="bg-[rgba(251,191,36,0.18)] px-4 py-2 text-center text-sm text-[var(--warn)] backdrop-blur-xl">
          {t("offline.banner")}
        </div>
      ) : null}
      {!isOffline && promptEvent && !dismissed ? (
        <div className="flex items-center justify-center gap-3 bg-[rgba(74,222,128,0.16)] px-4 py-2 text-sm text-[var(--brand)] backdrop-blur-xl">
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
      <div className="flex flex-1 flex-col xl:flex-row">
        <aside className="hidden w-[21rem] flex-shrink-0 border-r border-[var(--surface-border)]/70 bg-[var(--bg-overlay)]/60 backdrop-blur-2xl xl:flex">
          <Suspense fallback={<SidebarFallback />}>
            <Sidebar
              conversations={conversations}
              activeConversationId={activeConversation}
              onSelectConversation={selectConversation}
              onNewConversation={createConversation}
              onOpenSettings={handleOpenSettings}
              onCreateFolder={handleCreateFolder}
            />
          </Suspense>
        </aside>
        <main
          id="chat-main"
          className="relative flex min-h-[calc(100vh-5rem)] flex-1 flex-col"
          role="main"
          aria-label="Область диалога"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 pb-[calc(9rem+var(--safe-area-bottom))] pt-10 sm:px-8 lg:px-12">
            <div className="space-y-10">
              <ConversationHero
                summary={t("hero.summary")}
                mode={mode}
                onModeChange={setMode}
                participants={heroParticipants}
                metrics={heroMetrics}
                isOffline={isOffline}
                offlineLabel={t("header.offline")}
              />
              <section aria-labelledby="quick-actions-title" className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p id="quick-actions-title" className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--muted)]">
                      {t("chat.quickActions.title")}
                    </p>
                    <h2 className="text-2xl font-semibold text-[var(--text)] sm:text-3xl">
                      {t("chat.quickActions.subtitle")}
                    </h2>
                  </div>
                  <p className="max-w-md text-sm text-[var(--text-subtle)]">
                    {t("chat.quickActions.description")}
                  </p>
                </div>
                <QuickActions actions={quickActions} onSelect={handleSelectQuickAction} />
              </section>
            </div>
            <section className="flex-1">
              <div className="relative flex h-full flex-col overflow-hidden rounded-[2.25rem] border border-[var(--surface-border)] bg-[var(--surface-card-strong)]/85 shadow-[0_40px_90px_rgba(10,12,18,0.55)] backdrop-blur-2xl">
                <div className="flex flex-col gap-3 border-b border-[var(--surface-divider)] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--muted)]">
                      {t("chat.timeline")}
                    </p>
                    <p className="text-sm text-[var(--text-subtle)]">
                      {t("chat.timelineSubtitle")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant={isAdaptiveMode ? "secondary" : "ghost"}
                      size="sm"
                      className="min-h-[2.5rem] rounded-full px-4"
                      onClick={() => setAdaptiveMode((value) => !value)}
                      aria-pressed={isAdaptiveMode}
                      aria-label={t("chat.strategyToggle.label")}
                    >
                      <Sparkles aria-hidden className="h-4 w-4" />
                      <span className="text-xs font-semibold uppercase tracking-[0.18em]">
                        {isAdaptiveMode ? t("chat.strategyToggle.on") : t("chat.strategyToggle.off")}
                      </span>
                    </Button>
                    <Badge tone="accent" className="rounded-full border border-[var(--border-ghost)] bg-[var(--brand-ghost)] px-3 py-1 text-xs uppercase tracking-[0.2em] text-[var(--brand)]">
                      {t("chat.modeLabel")}: {modeLabel}
                    </Badge>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden p-3 sm:p-6">
                  <MessageList
                    messages={activeMessages}
                    status={status}
                    onRetry={() => {
                      if (activeConversation) {
                        selectConversation(activeConversation);
                      }
                    }}
                  />
                </div>
              </div>
            </section>
          </div>
          <div className="sticky bottom-0 left-0 right-0 border-t border-[var(--surface-border)]/70 bg-[rgba(8,10,14,0.92)]/90 px-4 pb-[calc(2.5rem+var(--safe-area-bottom))] pt-6 shadow-[0_-20px_60px_rgba(4,6,8,0.65)] backdrop-blur-2xl sm:px-8 lg:px-12">
            <div className="mx-auto w-full max-w-5xl">
              <Composer draft={draft} onChange={setDraft} onSend={handleSend} disabled={status === "loading"} />
            </div>
          </div>
        </main>
        <Suspense fallback={<DrawerFallback isOpen={isDrawerOpen} title={t("rightDrawer.title")} />}>
          <RightDrawer
            sections={sections}
            activeSection={activeTab}
            onChangeSection={setActiveTab}
            isOpen={isDrawerOpen}
            onClose={handleCloseDrawer}
            title={t("rightDrawer.title")}
            menuLabel={t("rightDrawer.title")}
            closeLabel={t("rightDrawer.close")}
          />
        </Suspense>
      </div>
      <div className="lg:hidden">
        <nav className="flex items-center justify-around border-t border-[var(--surface-border)]/70 bg-[var(--bg-overlay)]/80 px-4 py-2 text-xs text-[var(--muted)] backdrop-blur-xl">
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
          <div className="border-t border-[var(--surface-border)]/70 bg-[var(--bg-overlay)]/80 p-4 backdrop-blur-xl">
            {sections
              .filter((section) => section.value === activeTab)
              .map((section) => (
                <Fragment key={section.value}>{section.content}</Fragment>
              ))}
          </div>
        ) : null}
      </div>
      <Suspense fallback={null}>
        <CommandMenu open={isCommandOpen} onClose={handleCloseCommandMenu} />
      </Suspense>
      {isSidebarOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-stretch justify-start bg-[rgba(6,8,10,0.72)] px-4 py-8 backdrop-blur-xl xl:hidden">
              <div className="absolute inset-0" onClick={handleMobileCloseSidebar} aria-hidden />
              <div className="relative mr-auto flex h-full w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-[var(--surface-border)]/70 bg-[var(--bg-overlay)]/90 backdrop-blur-2xl">
                <Suspense fallback={<SidebarFallback />}>
                  <Sidebar
                    conversations={conversations}
                    activeConversationId={activeConversation}
                    onSelectConversation={handleMobileSelectConversation}
                    onNewConversation={handleMobileNewConversation}
                    onOpenSettings={handleMobileOpenSettings}
                    onCreateFolder={handleMobileCreateFolder}
                  />
                </Suspense>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export default ChatPage;
