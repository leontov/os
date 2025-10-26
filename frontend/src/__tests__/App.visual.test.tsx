import { act, render } from "@testing-library/react";
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
import { fetchPopularGpts, fetchWhatsNewHighlights } from "../core/recommendations";

vi.mock("../core/useKolibriChat", () => ({
  default: vi.fn(),
}));

vi.mock("../core/useMediaQuery", () => ({
  default: vi.fn(),
}));

vi.mock("html2canvas", () => ({
  default: vi.fn(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 10;
    canvas.height = 10;
    const context = canvas.getContext("2d");
    context?.fillRect(0, 0, 10, 10);
    return canvas;
  }),
}));

vi.mock("../core/recommendations", () => ({
  fetchPopularGpts: vi.fn(),
  fetchWhatsNewHighlights: vi.fn(),
}));

const useKolibriChatMock = vi.mocked(useKolibriChat);
const useMediaQueryMock = vi.mocked(useMediaQuery);
const fetchPopularGptsMock = vi.mocked(fetchPopularGpts);
const fetchWhatsNewHighlightsMock = vi.mocked(fetchWhatsNewHighlights);

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
  archivedConversations: [],
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
  modelId: "kolibri-base",
  setModelId: vi.fn(),
  renameConversation: vi.fn(),
  deleteConversation: vi.fn(),
  attachFiles: vi.fn(),
  removeAttachment: vi.fn(),
  clearAttachments: vi.fn(),
  sendMessage: vi.fn(),
  resetConversation: vi.fn(),
  selectConversation: vi.fn(),
  createConversation: vi.fn(),
  refreshKnowledgeStatus: vi.fn(),
  archiveConversation: vi.fn(),
  clearConversationHistory: vi.fn(),
  exportConversationAsMarkdown: vi.fn(() => ""),
};

describe("App layout snapshots", () => {
  beforeEach(() => {
    fetchPopularGptsMock.mockReset();
    fetchWhatsNewHighlightsMock.mockReset();
    useKolibriChatMock.mockReturnValue({ ...baseState });
    useMediaQueryMock.mockReturnValue(true);
    fetchPopularGptsMock.mockResolvedValue([
      {
        id: "gpt-sales",
        title: "Kolibri Growth Strategist",
        description: "Помогает сформировать GTM-план и коммерческие сообщения на основе последних метрик.",
        prompt: "Собери GTM-план для Kolibri на следующий квартал.",
        badge: "Sales",
        author: "Команда RevOps",
      },
    ]);
    fetchWhatsNewHighlightsMock.mockResolvedValue([
      {
        id: "update-ops",
        title: "AI-ревью документов",
        summary: "Коллекция промтов для быстрого ревью договоров, презентаций и аналитических отчётов.",
        prompt: "Проверь этот документ на риски и сформируй резюме.",
        publishedAtIso: new Date("2024-09-18T10:00:00Z").toISOString(),
      },
    ]);
  });

  it("renders empty chat state", async () => {
    let view: ReturnType<typeof render> | null = null;
    await act(async () => {
      view = render(<App />);
      await Promise.resolve();
    });
    const { container } = view ?? render(<App />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders chat with history", async () => {
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

    let view: ReturnType<typeof render> | null = null;
    await act(async () => {
      view = render(<App />);
      await Promise.resolve();
    });
    const { container } = view ?? render(<App />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders mobile layout", async () => {
    useMediaQueryMock.mockReturnValue(false);
    useKolibriChatMock.mockReturnValue({
      ...baseState,
      messages: [],
    });

    let view: ReturnType<typeof render> | null = null;
    await act(async () => {
      view = render(<App />);
      await Promise.resolve();
    });
    const { container } = view ?? render(<App />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
