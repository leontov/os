import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Menu, BarChart3, Database, SlidersHorizontal } from "lucide-react";
import { Header } from "../components/layout/Header";
import { Sidebar, type ConversationListItem } from "../components/layout/Sidebar";
import { RightDrawer, type DrawerSection } from "../components/layout/RightDrawer";
import { MessageList } from "../components/chat/MessageList";
import { Composer } from "../components/chat/Composer";
import { MessageBlock } from "../components/chat/Message";
import { Button } from "../components/ui/Button";
import { useI18n } from "../app/i18n";
import { useToast } from "../components/feedback/Toast";
import { useTheme } from "../design/theme";
import { useOfflineQueue } from "../shared/hooks/useOfflineQueue";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const initialConversations: ConversationListItem[] = [
  { id: "1", title: "Гайд по запуску релиза", updatedAt: "сегодня", folder: "Проекты" },
  { id: "2", title: "Daily standup", updatedAt: "вчера" },
  { id: "3", title: "Подготовка к демо Kolibri", updatedAt: "2 дня назад", folder: "Проекты" },
];

const initialMessages: MessageBlock[] = [
  {
    id: "m1",
    role: "assistant",
    authorLabel: "Колибри",
    content:
      "Привет! Я помогу тебе собрать отчет о прогрессе. Расскажи, какие ключевые события произошли, и я подготовлю резюме.",
    createdAt: "09:10",
  },
  {
    id: "m2",
    role: "user",
    authorLabel: "Вы",
    content: "Нам удалось завершить подготовку дизайн-системы и внедрить новую панель метрик.",
    createdAt: "09:11",
  },
];

function useChatData() {
  const [conversations, setConversations] = useState(initialConversations);
  const [activeConversation, setActiveConversation] = useState<string | null>(conversations[0]?.id ?? null);
  const [messages, setMessages] = useState<Record<string, MessageBlock[]>>({
    [conversations[0]?.id ?? "temp"]: initialMessages,
  });
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  const selectConversation = useCallback((id: string) => {
    setActiveConversation(id);
    if (!messages[id]) {
      setStatus("loading");
      window.setTimeout(() => {
        setMessages((current) => ({ ...current, [id]: [] }));
        setStatus("idle");
      }, 450);
    }
  }, [messages]);

  const createConversation = useCallback(() => {
    const id = crypto.randomUUID();
    const title = "Новый диалог";
    const entry: ConversationListItem = { id, title, updatedAt: "только что" };
    setConversations((current) => [entry, ...current]);
    setMessages((current) => ({ ...current, [id]: [] }));
    setActiveConversation(id);
  }, []);

  const appendMessage = useCallback((id: string, message: MessageBlock) => {
    setMessages((current) => {
      const next = [...(current[id] ?? []), message];
      return { ...current, [id]: next };
    });
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === id
          ? { ...conversation, updatedAt: "только что", title: conversation.title }
          : conversation,
      ),
    );
  }, []);

  const value = useMemo(
    () => ({
      conversations,
      activeConversation,
      messages,
      status,
      selectConversation,
      createConversation,
      appendMessage,
      setStatus,
    }),
    [conversations, activeConversation, messages, status, selectConversation, createConversation, appendMessage],
  );

  return value;
}

function renderDrawerSections(): DrawerSection[] {
  return [
    {
      value: "analytics",
      label: "Analytics",
      content: (
        <div className="space-y-2">
          <p className="text-sm text-[var(--muted)]">Средняя латентность ответов: 1.8 с</p>
          <p className="text-sm text-[var(--muted)]">NPS беты: 72</p>
          <p className="text-sm text-[var(--muted)]">Рекомендации: Запустить UX-интервью</p>
        </div>
      ),
    },
    {
      value: "memory",
      label: "Memory",
      content: (
        <div className="space-y-2">
          <p className="text-sm text-[var(--muted)]">Последние заметки сохранены в проект «Gaia».</p>
          <p className="text-sm text-[var(--muted)]">Долгосрочные цели обновлены вчера.</p>
        </div>
      ),
    },
    {
      value: "parameters",
      label: "Parameters",
      content: (
        <div className="space-y-2">
          <p className="text-sm text-[var(--muted)]">Температура: 0.8</p>
          <p className="text-sm text-[var(--muted)]">Макс. токены: 2048</p>
          <p className="text-sm text-[var(--muted)]">Память контекста: активна</p>
        </div>
      ),
    },
  ];
}

function ChatPage() {
  const { t } = useI18n();
  const { setTheme, theme } = useTheme();
  const { publish } = useToast();
  const { isOffline } = useOfflineQueue();
  const [isDrawerOpen, setDrawerOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("analytics");
  const [draft, setDraft] = useState("");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const { conversations, activeConversation, messages, status, selectConversation, createConversation, appendMessage } = useChatData();

  const activeMessages = activeConversation ? messages[activeConversation] ?? [] : [];

  const handleSend = useCallback(
    async (content: string) => {
      if (!activeConversation) {
        return;
      }
      const message: MessageBlock = {
        id: crypto.randomUUID(),
        role: "user",
        authorLabel: "Вы",
        content,
        createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      appendMessage(activeConversation, message);
      publish({ title: t("toast.sent"), tone: "success" });
    },
    [activeConversation, appendMessage, publish, t],
  );

  const sections = useMemo(() => renderDrawerSections(), []);

  useEffect(() => {
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)] text-[var(--text)]">
      <a href="#chat-main" className="absolute left-4 top-4 z-50 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-black focus:translate-y-12 focus:outline-none">
        {t("app.skip")}
      </a>
      <Header
        title={t("app.title")}
        onSearch={() => publish({ title: t("header.actions.search"), tone: "success" })}
        onShare={() => publish({ title: t("header.actions.share"), tone: "success" })}
        onExport={() => publish({ title: t("header.actions.export"), tone: "success" })}
        onMenu={() => setDrawerOpen((value) => !value)}
      />
      {isOffline ? (
        <div className="bg-[rgba(251,191,36,0.12)] px-4 py-2 text-center text-sm text-[var(--warn)]">
          {t("offline.banner")}
        </div>
      ) : null}
      {!isOffline && installPrompt && !installDismissed ? (
        <div className="flex items-center justify-center gap-3 bg-[rgba(74,222,128,0.12)] px-4 py-2 text-sm text-[var(--brand)]">
          <span>{t("pwa.install")}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await installPrompt.prompt();
              const choice = await installPrompt.userChoice;
              if (choice.outcome === "accepted") {
                publish({ title: t("offline.restore"), tone: "success" });
              }
              setInstallPrompt(null);
            }}
          >
            {t("pwa.install")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setInstallPrompt(null);
              setInstallDismissed(true);
            }}
          >
            {t("pwa.dismiss")}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-1 flex-col lg:flex-row">
        <Sidebar
          conversations={conversations}
          activeConversationId={activeConversation}
          onSelectConversation={selectConversation}
          onNewConversation={createConversation}
          onOpenSettings={() => setTheme(theme === "dark" ? "light" : "dark")}
          onCreateFolder={() => publish({ title: "Папка создана", tone: "success" })}
        />
        <main id="chat-main" className="relative flex min-h-[calc(100vh-4rem)] flex-1 flex-col bg-[var(--bg)]">
          <div className="flex flex-1 flex-col gap-6 px-4 pb-[calc(6.5rem+var(--safe-area-bottom))] pt-6 sm:px-8 lg:px-12">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{t("header.dialogTitle")}</h2>
              <Button
                variant="ghost"
                className="lg:hidden"
                onClick={() => setDrawerOpen((value) => !value)}
                aria-label="Toggle context drawer"
              >
                <Menu aria-hidden />
              </Button>
            </div>
            <section className="flex-1">
              <MessageList
                messages={activeMessages}
                status={status}
                onRetry={() => {
                  if (activeConversation) {
                    selectConversation(activeConversation);
                  }
                }}
              />
            </section>
          </div>
          <div className="sticky bottom-0 left-0 right-0 border-t border-[var(--border-subtle)] bg-[rgba(14,17,22,0.95)] px-4 pb-[calc(1.5rem+var(--safe-area-bottom))] pt-4 sm:px-8 lg:px-12">
            <Composer draft={draft} onChange={setDraft} onSend={handleSend} />
          </div>
        </main>
        <RightDrawer
          sections={sections.map((section) => ({
            ...section,
            label:
              section.value === "analytics"
                ? t("drawer.analytics")
                : section.value === "memory"
                  ? t("drawer.memory")
                  : t("drawer.parameters"),
          }))}
          activeSection={activeTab}
          onChangeSection={setActiveTab}
          isOpen={isDrawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      </div>
      <div className="lg:hidden">
        <nav className="flex items-center justify-around border-t border-[var(--border-subtle)] bg-[var(--bg-elev)] px-4 py-2 text-xs text-[var(--muted)]">
          <button type="button" className="flex flex-col items-center gap-1" onClick={() => setActiveTab("analytics")}> <BarChart3 aria-hidden className="h-5 w-5" />{t("drawer.analytics")}</button>
          <button type="button" className="flex flex-col items-center gap-1" onClick={() => setActiveTab("memory")}> <Database aria-hidden className="h-5 w-5" />{t("drawer.memory")}</button>
          <button type="button" className="flex flex-col items-center gap-1" onClick={() => setActiveTab("parameters")}> <SlidersHorizontal aria-hidden className="h-5 w-5" />{t("drawer.parameters")}</button>
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
    </div>
  );
}

export default ChatPage;
