import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import ChatView from "../components/ChatView";
import type { ConversationMetrics } from "../core/useKolibriChat";
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
  },
  {
    id: "2",
    role: "assistant",
    content: "Здравствуйте! Я подготовлю структуру и предложу ближайшие шаги.",
    isoTimestamp: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
  },
  {
    id: "3",
    role: "user",
    content: "Отлично, добавь ссылку на прошлый анализ.",
    isoTimestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
];

const meta: Meta<typeof ChatView> = {
  title: "Conversation/ChatView",
  component: ChatView,
  args: {
    conversationId: "demo-convo",
    conversationTitle: "Исследование Kolibri",
    messages,
    metrics,
    modeLabel: "Нейтральный",
    isLoading: false,
    emptyState: <span>Нет сообщений</span>,
    onConversationTitleChange: fn(),
    onOpenSidebar: fn(),
    onOpenKnowledge: fn(),
    onOpenAnalytics: fn(),
    onOpenSwarm: fn(),
    onOpenPreferences: fn(),
    onOpenSettings: fn(),
    onOpenActions: fn(),
    onRefreshKnowledge: fn(),
    isKnowledgeLoading: false,
    bridgeReady: true,
    isZenMode: false,
    onToggleZenMode: fn(),
    personaName: "Aurora",
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
