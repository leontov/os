import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import ChatView from "../components/ChatView";
import type { ConversationMetrics, ConversationPreferences, ConversationSummary } from "../core/useKolibriChat";
import { MODE_OPTIONS } from "../core/modes";
import type { ChatMessage } from "../types/chat";

const metrics: ConversationMetrics = {
  userMessages: 18,
  assistantMessages: 22,
  knowledgeReferences: 6,
  lastUpdatedIso: new Date().toISOString(),
  conservedRatio: 0.68,
  stability: 0.81,
  auditability: 0.59,
  returnToAttractor: 0.46,
  latencyP50: 1.4,
};

const messages: ChatMessage[] = [
  {
    id: "1",
    role: "user",
    content: "Привет! Давай составим план исследования.",
    isoTimestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    timestamp: "10:00",
  },
  {
    id: "2",
    role: "assistant",
    content: "Здравствуйте! Я подготовлю структуру и предложу ближайшие шаги.",
    isoTimestamp: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
    timestamp: "10:01",
  },
  {
    id: "3",
    role: "user",
    content: "Отлично, добавь ссылку на прошлый анализ.",
    isoTimestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    timestamp: "10:03",
  },
];

const summaries: ConversationSummary[] = [
  {
    id: "demo-convo",
    title: "Исследование Kolibri",
    preview: "Последние новости о запуске Kolibri.",
    createdAtIso: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    updatedAtIso: new Date().toISOString(),
  },
  {
    id: "archive-convo",
    title: "План релиза",
    preview: "Обсуждение задач и сроков.",
    createdAtIso: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    updatedAtIso: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
  },
];

const preferences: ConversationPreferences = {
  learningEnabled: true,
  privateMode: false,
  allowOnline: false,
  profilePreset: "balanced",
  safeTone: false,
};

const meta: Meta<typeof ChatView> = {
  title: "Conversation/ChatView",
  component: ChatView,
  args: {
    conversationId: "demo-convo",
    conversationTitle: "Исследование Kolibri",
    conversationSummaries: summaries,
    messages,
    metrics,
    mode: "neutral",
    modeLabel: "Нейтральный",
    modeOptions: MODE_OPTIONS,
    isLoading: false,
    emptyState: <span>Нет сообщений</span>,
    onConversationTitleChange: fn(),
    onConversationCreate: fn(),
    onConversationSelect: fn(),
    onConversationRename: fn(),
    onConversationDelete: fn(),
    onModeChange: fn(),
    onOpenKnowledge: fn(),
    onOpenAnalytics: fn(),
    onOpenActions: fn(),
    onOpenSwarm: fn(),
    onOpenSettings: fn(),
    onRefreshKnowledge: fn(),
    isKnowledgeLoading: false,
    bridgeReady: true,
    isZenMode: false,
    onToggleZenMode: fn(),
    personaName: "Aurora",
    preferences,
    onPreferencesChange: fn(),
    composer: (
      <div className="rounded-xl border border-dashed border-border/60 px-4 py-3 text-sm text-text-muted">
        Composer placeholder
      </div>
    ),
  },
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof ChatView>;

export const Default: Story = {};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};

export const Empty: Story = {
  args: {
    messages: [],
  },
};

export const FocusMode: Story = {
  args: {
    isZenMode: true,
  },
};
