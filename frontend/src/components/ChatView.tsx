import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowDownWideNarrow,
  BarChart3,
  ChevronDown,
  Crosshair,
  Database,
  Download,
  ListChecks,
  Menu,
  PanelsTopLeft,
  Pencil,
  RefreshCcw,
  Sparkles,
  UserRoundCog,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import useMediaQuery from "../core/useMediaQuery";
import type {
  ConversationMetrics,
  ConversationPreferences,
  ConversationSummary,
} from "../core/useKolibriChat";
import type { ModeOption } from "../core/modes";
import type { ModelId, ModelOption } from "../core/models";
import { usePersonaTheme } from "../core/usePersonaTheme";
import type { ChatMessage } from "../types/chat";
import ChatMessageView from "./ChatMessageView";
import ConversationPreferencesBar from "./ConversationPreferencesBar";
import { MessageSkeleton } from "./loading";
import ChatSidebar from "./sidebar/ChatSidebar";

interface ChatViewProps {
  messages: ChatMessage[];
  isLoading: boolean;
  conversationId: string;
  conversationTitle: string;
  conversationSummaries: ConversationSummary[];
  mode: string;
  modeLabel: string;
  modeOptions: ModeOption[];
  modelId: ModelId;
  modelOptions: ModelOption[];
  metrics: ConversationMetrics;
  preferences: ConversationPreferences;
  emptyState?: ReactNode;
  composer?: ReactNode;
  onConversationTitleChange: (title: string) => void;
  onConversationCreate: () => void;
  onConversationSelect: (id: string) => void;
  onConversationRename: (id: string, title: string) => void;
  onConversationDelete: (id: string) => void;
  onModeChange: (mode: string) => void;
  onModelChange: (model: ModelId) => void;
  onOpenKnowledge: () => void;
  onOpenAnalytics: () => void;
  onOpenSwarm: () => void;
  onOpenSettings: () => void;
  onOpenActions: () => void;
  onRefreshKnowledge: () => void;
  onShareConversation: () => void | Promise<void>;
  onExportConversation: () => void;
  onManagePlan: () => void;
  isKnowledgeLoading: boolean;
  bridgeReady: boolean;
  isZenMode: boolean;
  onToggleZenMode: () => void;
  personaName: string;
  onPreferencesChange: (update: Partial<ConversationPreferences>) => void;
  onViewportElementChange?: (element: HTMLElement | null) => void;
  onMessageEdit?: (message: ChatMessage) => void;
  onMessageContinue?: (options: { assistantMessage: ChatMessage; userMessage?: ChatMessage }) => void;
  onMessageRegenerate?: (options: { assistantMessage: ChatMessage; userMessage?: ChatMessage }) => void;
  onMessageCopyLink?: (message: ChatMessage) => void;
}

type TimelineItem =
  | { type: "divider"; id: string; label: string }
  | { type: "message"; id: string; message: ChatMessage; contextUserMessage?: ChatMessage };

const ChatView = ({
  messages,
  isLoading,
  conversationId,
  conversationTitle,
  conversationSummaries,
  mode,
  modeLabel,
  modeOptions,
  modelId,
  modelOptions,
  metrics,
  preferences,
  emptyState,
  composer,
  onConversationTitleChange,
  onConversationCreate,
  onConversationSelect,
  onConversationRename,
  onConversationDelete,
  onModeChange,
  onModelChange,
  onOpenKnowledge,
  onOpenAnalytics,
  onOpenSwarm,
  onOpenSettings,
  onOpenActions,
  onRefreshKnowledge,
  onShareConversation,
  onExportConversation,
  onManagePlan,
  isKnowledgeLoading,
  bridgeReady,
  isZenMode,
  onToggleZenMode,
  personaName,
  onPreferencesChange,
  onViewportElementChange,
  onMessageEdit,
  onMessageContinue,
  onMessageRegenerate,
  onMessageCopyLink,
}: ChatViewProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isRenamingTitle, setIsRenamingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(conversationTitle);
  const [activeMenu, setActiveMenu] = useState<null | "model" | "share" | "export" | "settings">(null);
  const { resolvedMotion } = usePersonaTheme();
  const prefersReducedMotion = useReducedMotion();
  const shouldReduceMotion = resolvedMotion === "reduced" || Boolean(prefersReducedMotion);
  const easeCurve: [number, number, number, number] = [0.22, 0.61, 0.36, 1];
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isMobileViewport = useMediaQuery("(max-width: 1023px)");
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);

  const rootRef = useCallback(
    (element: HTMLElement | null) => {
      if (onViewportElementChange) {
        onViewportElementChange(element);
      }
    },
    [onViewportElementChange],
  );

  useEffect(() => {
    if (!isRenamingTitle) {
      setTitleDraft(conversationTitle);
    }
  }, [conversationTitle, isRenamingTitle]);

  useEffect(() => {
    if (isRenamingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isRenamingTitle]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return undefined;
    }

    const handleScroll = () => {
      const distance = container.scrollHeight - (container.scrollTop + container.clientHeight);
      setIsNearBottom(distance < 96);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    if (!isNearBottom) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    if (typeof container.scrollTo === "function") {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: shouldReduceMotion ? "auto" : "smooth",
      });
    } else {
      container.scrollTop = container.scrollHeight;
    }
  }, [isLoading, isNearBottom, messages, shouldReduceMotion]);

  useEffect(() => {
    if (isDesktop) {
      setSidebarOpen(false);
    }
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop) {
      setSidebarCollapsed(false);
    }
  }, [isDesktop]);

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    if (typeof container.scrollTo === "function") {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: shouldReduceMotion ? "auto" : "smooth",
      });
    } else {
      container.scrollTop = container.scrollHeight;
    }
  }, [shouldReduceMotion]);

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    let lastUserMessage: ChatMessage | undefined;
    let lastDateKey: string | undefined;

    messages.forEach((message, index) => {
      const contextUserMessage = message.role === "assistant" ? lastUserMessage : undefined;
      if (message.role === "user") {
        lastUserMessage = message;
      }

      const dateKey = message.isoTimestamp ? new Date(message.isoTimestamp).toDateString() : undefined;
      if (dateKey && dateKey !== lastDateKey) {
        lastDateKey = dateKey;
        const formattedDate = new Date(message.isoTimestamp!).toLocaleDateString("ru-RU", {
          day: "2-digit",
          month: "long",
        });
        items.push({ type: "divider", id: `divider-${dateKey}-${index}`, label: formattedDate });
      }

      items.push({ type: "message", id: message.id, message, contextUserMessage });
    });

    return items;
  }, [messages]);

  const conversationShortId = useMemo(() => conversationId.slice(0, 8), [conversationId]);

  const totalMessages = metrics.userMessages + metrics.assistantMessages;

  const currentModelOption = useMemo(
    () => modelOptions.find((option) => option.id === modelId) ?? null,
    [modelId, modelOptions],
  );

  const lastUpdatedLabel = useMemo(() => {
    if (!metrics.lastUpdatedIso) {
      return "—";
    }
    try {
      return new Date(metrics.lastUpdatedIso).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  }, [metrics.lastUpdatedIso]);

  const handleConversationSelect = useCallback(
    (id: string) => {
      onConversationSelect(id);
      if (!isDesktop) {
        setSidebarOpen(false);
      }
    },
    [isDesktop, onConversationSelect],
  );

  const handleConversationCreate = useCallback(() => {
    onConversationCreate();
    if (!isDesktop) {
      setSidebarOpen(false);
    }
  }, [isDesktop, onConversationCreate]);

  const handleToggleMemory = useCallback(() => {
    onPreferencesChange({ learningEnabled: !preferences.learningEnabled });
  }, [onPreferencesChange, preferences.learningEnabled]);

  const commitTitle = useCallback(() => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== conversationTitle) {
      onConversationTitleChange(trimmed);
    }
    if (!trimmed) {
      setTitleDraft(conversationTitle);
    }
    setIsRenamingTitle(false);
  }, [conversationTitle, onConversationTitleChange, titleDraft]);

  const cancelRename = useCallback(() => {
    setTitleDraft(conversationTitle);
    setIsRenamingTitle(false);
  }, [conversationTitle]);

  const handleTitleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitTitle();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancelRename();
      }
    },
    [cancelRename, commitTitle],
  );

  useEffect(() => {
    if (!activeMenu) {
      return undefined;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const containers = [
        modelMenuRef.current,
        shareMenuRef.current,
        exportMenuRef.current,
        settingsMenuRef.current,
      ];
      const isInside = containers.some((container) => container?.contains(target));
      if (!isInside) {
        setActiveMenu(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveMenu(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [activeMenu]);

  const closeMenu = useCallback(() => {
    setActiveMenu(null);
  }, []);

  const handleModelSelect = useCallback(
    (option: ModelOption) => {
      onModelChange(option.id);
      closeMenu();
    },
    [closeMenu, onModelChange],
  );

  return (
    <div ref={rootRef} className="flex h-full min-h-screen w-full bg-app-background text-text" data-zen-mode={isZenMode}>
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex max-w-full transform transition-transform duration-300 ease-gesture lg:static lg:z-auto ${
          isDesktop ? "translate-x-0" : isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!isDesktop && !isSidebarOpen}
      >
        <ChatSidebar
          conversations={conversationSummaries}
          activeConversationId={conversationId}
          mode={mode}
          modeOptions={modeOptions}
          isCollapsed={isSidebarCollapsed}
          onCollapseToggle={() => setSidebarCollapsed((previous) => !previous)}
          onCreateConversation={handleConversationCreate}
          onSelectConversation={handleConversationSelect}
          onRenameConversation={onConversationRename}
          onDeleteConversation={onConversationDelete}
          onModeChange={onModeChange}
          onClose={() => setSidebarOpen(false)}
        />
      </aside>

      {!isDesktop && isSidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/50"
          onClick={() => setSidebarOpen(false)}
          aria-label="Закрыть список бесед"
        />
      ) : null}

      <div className="flex min-h-screen flex-1 flex-col bg-background-main/95">
        <header className="sticky top-0 z-20 border-b border-border/60 bg-sidebar/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:text-text lg:hidden"
                aria-label="Открыть список бесед"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="flex flex-col gap-1">
                {isRenamingTitle ? (
                  <input
                    ref={titleInputRef}
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={handleTitleKeyDown}
                    className="w-full rounded-xl border border-border/70 bg-background-input px-3 py-2 text-sm font-semibold text-text focus:border-brand focus:outline-none"
                    aria-label="Название беседы"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsRenamingTitle(true)}
                    className="inline-flex items-center gap-2 text-left text-base font-semibold text-text transition-colors hover:text-primary"
                  >
                    <span className="truncate">{conversationTitle || "Новая беседа"}</span>
                    <Pencil className="h-3.5 w-3.5 text-text-muted" />
                  </button>
                )}
                <span className="text-xs font-medium uppercase tracking-[0.32em] text-text-muted">
                  Диалог #{conversationShortId}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div ref={modelMenuRef} className="relative hidden md:block">
                <button
                  type="button"
                  onClick={() => setActiveMenu((previous) => (previous === "model" ? null : "model"))}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                    activeMenu === "model"
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border/60 bg-surface text-text-muted hover:border-primary/50 hover:text-text"
                  }`}
                  aria-haspopup="menu"
                  aria-expanded={activeMenu === "model"}
                >
                  <span className="max-w-[8.5rem] truncate">
                    {currentModelOption ? currentModelOption.label : "Выбрать модель"}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {activeMenu === "model" ? (
                  <div
                    role="menu"
                    className="absolute right-0 z-30 mt-2 w-64 rounded-2xl border border-border/70 bg-surface/95 p-2 shadow-card"
                  >
                    <div className="space-y-1">
                      {modelOptions.map((option) => {
                        const isActive = option.id === modelId;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={isActive}
                            onClick={() => handleModelSelect(option)}
                            className={`w-full rounded-xl px-3 py-2 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                              isActive
                                ? "bg-primary/10 text-primary"
                                : "text-text-muted hover:bg-background-card hover:text-text"
                            }`}
                          >
                            <span className="flex items-center justify-between gap-3">
                              <span className="font-semibold">{option.label}</span>
                              {isActive ? (
                                <span className="text-[0.65rem] uppercase tracking-[0.28em] text-primary/80">Текущая</span>
                              ) : null}
                            </span>
                            <span className="mt-1 block text-xs text-text-muted/80">{option.description}</span>
                            <span className="mt-1 block text-[0.65rem] uppercase tracking-[0.28em] text-text-muted/70">
                              {option.contextWindow}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onToggleZenMode}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
                  isZenMode
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border/70 text-text-muted hover:text-text"
                }`}
                aria-pressed={isZenMode}
                aria-label={isZenMode ? "Отключить режим фокуса" : "Включить режим фокуса"}
              >
                <Crosshair className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onOpenKnowledge}
                className="hidden h-10 w-10 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:text-text sm:inline-flex"
                aria-label="Открыть знания"
              >
                <Sparkles className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onOpenAnalytics}
                className="hidden h-10 w-10 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:text-text lg:inline-flex"
                aria-label="Открыть аналитику"
              >
                <BarChart3 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onOpenActions}
                className="hidden h-10 w-10 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:text-text lg:inline-flex"
                aria-label="Открыть действия"
              >
                <ListChecks className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onOpenSwarm}
                className="hidden h-10 w-10 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:text-text xl:inline-flex"
                aria-label="Открыть swarm"
              >
                <PanelsTopLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:text-text"
                aria-label="Открыть память"
              >
                <Database className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="border-t border-border/60 bg-surface/70">
            <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-2 px-4 py-3 text-xs text-text-muted sm:px-6 lg:px-8">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.32em] ${
                  bridgeReady ? "border-primary/40 bg-primary/10 text-text" : "border-border/60 bg-surface text-text-muted"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${bridgeReady ? "bg-primary" : "bg-border"}`} />
                {bridgeReady ? "Ядро готово" : "Ожидание"}
              </span>
              {currentModelOption ? (
                <span className="rounded-full border border-border/60 bg-surface px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.3em] text-text-muted">
                  {currentModelOption.label}
                </span>
              ) : null}
              <span className="rounded-full border border-border/60 bg-surface px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.3em] text-text-muted">
                {modeLabel}
              </span>
              <span className="rounded-full border border-border/60 bg-surface px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.3em] text-text-muted">
                {personaName}
              </span>
              <button
                type="button"
                onClick={onManagePlan}
                className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.3em] text-text-muted transition-colors hover:border-primary hover:text-primary"
              >
                <UserRoundCog className="h-3.5 w-3.5" />
                Сменить план
              </button>
              <button
                type="button"
                onClick={onRefreshKnowledge}
                className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.3em] text-text-muted transition-colors hover:border-primary hover:text-primary"
                aria-label="Обновить память"
                disabled={isKnowledgeLoading}
              >
                <RefreshCcw className={`h-3.5 w-3.5 ${isKnowledgeLoading ? "animate-spin" : ""}`} />
                Память
              </button>
              <span className="ml-auto text-[0.68rem] uppercase tracking-[0.3em] text-text-muted">
                Сообщений: {totalMessages} · Обновлено: {lastUpdatedLabel}
              </span>
            </div>
          </div>
        </header>

        <div className="border-b border-border/60 bg-surface/70">
          <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 lg:px-8">
            <ConversationPreferencesBar preferences={preferences} onChange={onPreferencesChange} />
          </div>
        </div>

        <main className="relative flex-1 overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,163,127,0.12),_transparent_65%)]"
          />
          <div
            ref={containerRef}
            className="soft-scroll relative z-10 mx-auto flex h-full w-full max-w-3xl flex-col gap-6 overflow-y-auto px-4 pb-40 pt-10 sm:px-6 lg:px-8"
          >
            {timelineItems.length === 0 && !isLoading ? (
              <div className="rounded-3xl border border-dashed border-border/60 bg-surface/80 px-6 py-8 text-sm text-text-muted shadow-card">
                {emptyState}
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {timelineItems.map((item) => {
                  if (item.type === "divider") {
                    return (
                      <motion.div
                        key={item.id}
                        className="flex items-center gap-4 px-2"
                        layout="position"
                        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                        animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                        transition={shouldReduceMotion ? { duration: 0.12 } : { duration: 0.26, ease: easeCurve }}
                      >
                        <span className="h-px flex-1 bg-border/60" />
                        <span className="rounded-full border border-border/70 bg-surface px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-text-muted">
                          {item.label}
                        </span>
                        <span className="h-px flex-1 bg-border/60" />
                      </motion.div>
                    );
                  }

                  return (
                    <motion.div
                      key={item.id}
                      className="px-1"
                      layout="position"
                      initial={
                        shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }
                      }
                      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.98 }}
                      transition={shouldReduceMotion ? { duration: 0.18 } : { duration: 0.32, ease: easeCurve }}
                    >
                      <ChatMessageView
                        message={item.message}
                        latestUserMessage={item.contextUserMessage}
                        memoryEnabled={preferences.learningEnabled}
                        onToggleMemory={handleToggleMemory}
                        onEditMessage={onMessageEdit}
                        onContinueMessage={onMessageContinue}
                        onRegenerateMessage={onMessageRegenerate}
                        onCopyLink={onMessageCopyLink}
                      />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}

            <AnimatePresence>
              {isLoading ? (
                <motion.div
                  key="chat-loading"
                  className="px-1"
                  layout="position"
                  initial={shouldReduceMotion ? { opacity: 0.9 } : { opacity: 0, y: 16 }}
                  animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                  transition={shouldReduceMotion ? { duration: 0.12 } : { duration: 0.24, ease: easeCurve }}
                  role="status"
                  aria-live="polite"
                >
                  <MessageSkeleton />
                  <span className="sr-only">Kolibri формирует ответ…</span>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {!isNearBottom ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-32 z-20 flex justify-center">
              <button
                type="button"
                onClick={scrollToBottom}
                className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-card transition-transform hover:scale-[1.02]"
              >
                <ArrowDownWideNarrow className="h-4 w-4" />
                К последнему сообщению
              </button>
            </div>
          ) : null}
        </main>

        <footer className="border-t border-border/60 bg-sidebar/90">
          <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">{composer}</div>
          {isMobileViewport ? (
            <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2 px-4 pb-6 text-xs text-text-muted sm:px-6 lg:px-8">
              <button
                type="button"
                onClick={onOpenKnowledge}
                className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border/60 bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-primary hover:text-primary"
              >
                <Sparkles className="h-4 w-4" />
                Знания
              </button>
              <button
                type="button"
                onClick={onOpenAnalytics}
                className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border/60 bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-primary hover:text-primary"
              >
                <BarChart3 className="h-4 w-4" />
                Аналитика
              </button>
              <button
                type="button"
                onClick={onOpenActions}
                className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border/60 bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-primary hover:text-primary"
              >
                <ListChecks className="h-4 w-4" />
                Действия
              </button>
              <button
                type="button"
                onClick={onOpenSwarm}
                className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border/60 bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-primary hover:text-primary"
              >
                <PanelsTopLeft className="h-4 w-4" />
                Swarm
              </button>
            </div>
          ) : null}
        </footer>
      </div>
    </div>
  );
};

export default ChatView;
