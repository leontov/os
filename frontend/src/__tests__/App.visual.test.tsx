import { render } from "@testing-library/react";
import { vi } from "vitest";
import App from "../App";
import type {
  ConversationMetrics,
  ConversationPreferences,
  ConversationSummary,
  KnowledgeUsageOverview,
} from "../core/useKolibriChat";
import type { ChatMessage } from "../types/chat";
import useKolibriChat from "../core/useKolibriChat";
import useMediaQuery from "../core/useMediaQuery";

vi.mock("../core/useKolibriChat", () => ({
  default: vi.fn(),
}));

vi.mock("../core/useMediaQuery", () => ({
  default: vi.fn(),
}));

const useKolibriChatMock = vi.mocked(useKolibriChat);
const useMediaQueryMock = vi.mocked(useMediaQuery);

const baseMetrics: ConversationMetrics = {
  userMessages: 0,
  assistantMessages: 0,
  knowledgeReferences: 0,
  lastUpdatedIso: new Date("2024-01-01T10:00:00Z").toISOString(),
  conservedRatio: 0,
  stability: 0.5,
  auditability: 0.5,
  returnToAttractor: 0.5,
  latencyP50: 1500,
};

const basePreferences: ConversationPreferences = {
  learningEnabled: true,
  privateMode: false,
  allowOnline: true,
  profilePreset: "balanced",
  safeTone: true,
};

const baseKnowledgeUsage: KnowledgeUsageOverview = {
  totalReferences: 0,
  uniqueSources: 0,
  conversationsWithKnowledge: 0,
  recentEntries: [],
};

const baseSummaries: ConversationSummary[] = [
  {
    id: "conv-1",
    title: "Новая беседа",
    preview: "Нет сообщений",
    createdAtIso: new Date("2024-01-01T09:00:00Z").toISOString(),
    updatedAtIso: new Date("2024-01-01T09:00:00Z").toISOString(),
  },
];

const baseMessages: ChatMessage[] = [];

const baseState = {
  messages: baseMessages,
  draft: "",
  mode: "balanced",
  isProcessing: false,
  bridgeReady: true,
  conversationId: "conv-1",
  conversationTitle: "Новая беседа",
  conversationSummaries: baseSummaries,
  knowledgeStatus: null,
  knowledgeError: undefined,
  statusLoading: false,
  latestAssistantMessage: undefined,
  metrics: baseMetrics,
  analytics: {
    totals: {
      conversations: 1,
      activeToday: 0,
      messages: 0,
      userMessages: 0,
      assistantMessages: 0,
      knowledgeReferences: 0,
      averageMessagesPerConversation: 0,
    },
    timeline: [],
    modeUsage: [],
    preferenceBreakdown: {
      learningEnabled: 1,
      privateMode: 0,
      allowOnline: 1,
      safeTone: 1,
      total: 1,
    },
    leaderboard: [],
  },
  knowledgeUsage: baseKnowledgeUsage,
  attachments: [],
  setDraft: vi.fn(),
  setMode: vi.fn(),
  kernelControls: { b0: 0.5, d0: 0.5, temperature: 0.8, topK: 4, cfBeam: false },
  kernelCapabilities: { wasm: true, simd: true, laneWidth: 2 },
  updateKernelControls: vi.fn(),
  preferences: basePreferences,
  updatePreferences: vi.fn(),
  renameConversation: vi.fn(),
  attachFiles: vi.fn(),
  removeAttachment: vi.fn(),
  clearAttachments: vi.fn(),
  sendMessage: vi.fn(),
  resetConversation: vi.fn(),
  selectConversation: vi.fn(),
  createConversation: vi.fn(),
  refreshKnowledgeStatus: vi.fn(),
};

describe("App layout snapshots", () => {
  beforeEach(() => {
    useKolibriChatMock.mockReturnValue({ ...baseState });
    useMediaQueryMock.mockReturnValue(true);
  });

  it("renders empty chat state", () => {
    const { container } = render(<App />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders chat with history", () => {
    const populatedMessages: ChatMessage[] = [
      {
        id: "m-1",
        role: "user",
        content: "Привет, Колибри!",
        timestamp: "10:00",
      },
      {
        id: "m-2",
        role: "assistant",
        content: "Здравствуйте! Чем могу помочь?",
        timestamp: "10:01",
        modeLabel: "Сбалансированный",
      },
    ];

    useKolibriChatMock.mockReturnValue({
      ...baseState,
      messages: populatedMessages,
      metrics: {
        ...baseMetrics,
        userMessages: 1,
        assistantMessages: 1,
        knowledgeReferences: 0,
      },
      conversationTitle: "Проект Kolibri",
    });

    const { container } = render(<App />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders mobile layout", () => {
    useMediaQueryMock.mockReturnValue(false);
    useKolibriChatMock.mockReturnValue({
      ...baseState,
      messages: [],
    });

    const { container } = render(<App />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
