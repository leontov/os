import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import App from "./App";
import { MODE_OPTIONS } from "./core/modes";
import type { KernelControlPayload } from "./core/kolibri-bridge";

type AskFunction = (prompt: string, mode?: string) => Promise<string>;

type ResetFunction = () => Promise<void>;
type SearchFunction = (
  query: string,
  options?: { topK?: number; signal?: AbortSignal }
) => Promise<Array<{ id: string; title: string; content: string; score: number }>>;

const { askMock, resetMock, searchMock, configureMock, capabilitiesMock } = vi.hoisted(() => ({
  askMock: vi.fn<Parameters<AskFunction>, ReturnType<AskFunction>>(),
  resetMock: vi.fn<Parameters<ResetFunction>, ReturnType<ResetFunction>>(),
  searchMock: vi.fn<Parameters<SearchFunction>, ReturnType<SearchFunction>>(),
  configureMock: vi.fn<[KernelControlPayload], Promise<void>>(),
  capabilitiesMock: vi.fn<[], Promise<{ wasm: boolean; simd: boolean; laneWidth: number }>>(),
}));

const originalFetch = globalThis.fetch;

vi.mock("./core/kolibri-bridge", () => ({
  default: {
    ready: Promise.resolve(),
    ask: askMock,
    reset: resetMock,
    configure: configureMock,
    capabilities: capabilitiesMock,
  },
}));

vi.mock("./core/knowledge", () => ({
  searchKnowledge: searchMock,
}));

vi.mock("./core/recommendations", () => ({
  fetchPopularGpts: vi.fn(async () => []),
  fetchWhatsNewHighlights: vi.fn(async () => []),
}));

describe("App contextual retrieval", () => {
  let consoleErrorSpy: MockInstance<Parameters<typeof console.error>, ReturnType<typeof console.error>>;

  beforeEach(() => {
    askMock.mockReset();
    resetMock.mockReset();
    searchMock.mockReset();
    configureMock.mockReset();
    capabilitiesMock.mockReset();
    resetMock.mockResolvedValue();
    configureMock.mockResolvedValue();
    capabilitiesMock.mockResolvedValue({ wasm: true, simd: false, laneWidth: 1 });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: "ok",
        response_mode: "script",
        sso_enabled: false,
        prometheus_namespace: "kolibri",
      }),
    } as Response);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    globalThis.fetch = originalFetch;
  });

  it("prepends retrieved context to the prompt and surfaces it in the UI", async () => {
    searchMock.mockResolvedValue([
      { id: "1", title: "Документ", content: "Описание Kolibri", score: 0.92 },
    ]);
    askMock.mockResolvedValue("Ответ с контекстом");

    await act(async () => {
      render(<App />);
      await Promise.resolve();
    });

    const textarea = screen.getByPlaceholderText("Сообщение для Колибри");
    const sendButton = screen.getByRole("button", { name: "Отправить" });

    await userEvent.type(textarea, "Что такое Kolibri?");
    await waitFor(() => expect(sendButton).not.toBeDisabled());
    await userEvent.click(sendButton);

    await waitFor(() => expect(askMock).toHaveBeenCalled());

    const [prompt, mode] = askMock.mock.calls[0] ?? [];
    expect(prompt).toContain("Контекст:");
    expect(prompt).toContain("Описание Kolibri");
    expect(mode).toBe(MODE_OPTIONS[0]?.value ?? "neutral");

    await waitFor(() => expect(screen.getAllByText("Ответ с контекстом").length).toBeGreaterThan(0));

    const toggle = screen.getByRole("button", { name: "Показать контекст (1)" });
    await userEvent.click(toggle);
    expect(screen.getAllByText("Документ").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Описание Kolibri").length).toBeGreaterThan(0);
  });

  it("falls back gracefully when contextual search fails", async () => {
    searchMock.mockRejectedValue(new Error("модуль памяти недоступен"));
    askMock.mockResolvedValue("Ответ без контекста");

    await act(async () => {
      render(<App />);
      await Promise.resolve();
    });

    const textarea = screen.getByPlaceholderText("Сообщение для Колибри");
    const sendButton = screen.getByRole("button", { name: "Отправить" });

    await userEvent.type(textarea, "Где хранится знание?");
    await waitFor(() => expect(sendButton).not.toBeDisabled());
    await userEvent.click(sendButton);

    await waitFor(() => expect(askMock).toHaveBeenCalled());

    const [prompt] = askMock.mock.calls[0] ?? [];
    expect(prompt).toBe("Где хранится знание?");

    await waitFor(() => expect(screen.getAllByText("Ответ без контекста").length).toBeGreaterThan(0));

    expect(screen.getByText(/Контекст недоступен:/)).toHaveTextContent("модуль памяти недоступен");
    expect(screen.queryByRole("button", { name: /Контекст/ })).not.toBeInTheDocument();
  });
});
