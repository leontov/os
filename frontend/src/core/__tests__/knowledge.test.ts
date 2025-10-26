import { afterEach, describe, expect, it, vi } from "vitest";

const knowledgeMock = {
  knowledgeUrl: "/mock-knowledge.json",
  knowledgeHash: "",
  knowledgeAvailable: false,
  knowledgeError: "",
};

vi.mock("virtual:kolibri-knowledge", () => knowledgeMock);

class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

const importKnowledgeModule = async (env: Record<string, string | undefined>) => {
  vi.resetModules();
  Object.entries(env).forEach(([key, value]) => {
    if (value === undefined) {
      delete (process.env as Record<string, string | undefined>)[key];
    } else {
      (process.env as Record<string, string | undefined>)[key] = value;
    }
  });
  return import("../knowledge");
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  knowledgeMock.knowledgeAvailable = false;
  knowledgeMock.knowledgeUrl = "/mock-knowledge.json";
  knowledgeMock.knowledgeError = "";
  delete (process.env as Record<string, string | undefined>).VITE_KNOWLEDGE_MODE;
  delete (process.env as Record<string, string | undefined>).VITE_KNOWLEDGE_API;
});

describe("knowledge search helpers", () => {
  it("builds search URLs with optional limit in remote mode", async () => {
    const env = { VITE_KNOWLEDGE_MODE: "remote", VITE_KNOWLEDGE_API: "/api/knowledge/search" };
    const { buildSearchUrl } = await importKnowledgeModule(env);

    expect(buildSearchUrl("kolibri")).toBe("/api/knowledge/search?q=kolibri");
    expect(buildSearchUrl("kolibri", { topK: 5 })).toBe("/api/knowledge/search?q=kolibri&limit=5");
  });

  it("returns snippets when the remote backend responds successfully", async () => {
    const env = { VITE_KNOWLEDGE_MODE: "remote", VITE_KNOWLEDGE_API: "/api/knowledge/search" };
    const { searchKnowledge } = await importKnowledgeModule(env);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        snippets: [
          { id: "a", title: "Doc", content: "Kolibri description", score: 0.9 },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const snippets = await searchKnowledge("Kolibri", { topK: 2 });

    expect(fetchMock).toHaveBeenCalledWith("/api/knowledge/search?q=Kolibri&limit=2", {
      signal: undefined,
    });
    expect(snippets).toHaveLength(1);
    expect(snippets[0]).toMatchObject({ id: "a", title: "Doc", content: "Kolibri description", score: 0.9 });
  });

  it("throws descriptive error when the remote backend fails", async () => {
    const env = { VITE_KNOWLEDGE_MODE: "remote", VITE_KNOWLEDGE_API: "/api/knowledge/search" };
    const { searchKnowledge } = await importKnowledgeModule(env);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchKnowledge("Kolibri")).rejects.toThrow(/500/);
  });

  it("returns an empty list when remote payload structure is invalid", async () => {
    const env = { VITE_KNOWLEDGE_MODE: "remote", VITE_KNOWLEDGE_API: "/api/knowledge/search" };
    const { searchKnowledge } = await importKnowledgeModule(env);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invalid: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const snippets = await searchKnowledge("Kolibri");
    expect(snippets).toEqual([]);
  });

  it("prefers local knowledge when available", async () => {
    const env = { VITE_KNOWLEDGE_MODE: "local" };
    knowledgeMock.knowledgeAvailable = true;

    const dataset = {
      version: 1,
      generatedAt: "2024-01-01T00:00:00Z",
      documents: [
        { id: "docs/a.md", title: "Doc", content: "Kolibri description", source: "docs/a.md" },
      ],
    };

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === knowledgeMock.knowledgeUrl) {
        return Promise.resolve({
          ok: true,
          json: async () => dataset,
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ snippets: [] }),
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const { searchKnowledge } = await importKnowledgeModule(env);

    const snippets = await searchKnowledge("Kolibri", { topK: 3 });

    expect(fetchMock).toHaveBeenCalledWith(knowledgeMock.knowledgeUrl, { cache: "force-cache" });
    expect(snippets).toHaveLength(1);
    expect(snippets[0]).toMatchObject({ id: "docs/a.md", title: "Doc" });
  });

  it("stores taught answers in local memory when no bundle is available", async () => {
    knowledgeMock.knowledgeAvailable = false;
    knowledgeMock.knowledgeUrl = "";

    const storage = new MemoryStorage();
    const fakeWindow = {
      localStorage: storage,
      location: { origin: "http://localhost" },
    } as unknown as Window & typeof globalThis;
    vi.stubGlobal("window", fakeWindow);

    const fetchMock = vi.fn(() => Promise.reject(new Error("fetch should not be called")));
    vi.stubGlobal("fetch", fetchMock);

    const { teachKnowledge, searchKnowledge, fetchKnowledgeStatus } = await importKnowledgeModule({});

    await teachKnowledge("Сколько будет 2+2?", "Ответ: 4");

    const results = await searchKnowledge("2+2", { topK: 3 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      title: expect.stringContaining("2+2"),
      source: "Личная память",
    });
    expect(results[0].content).toContain("4");

    const status = await fetchKnowledgeStatus();
    expect(status.status).toBe("memory");
    expect(status.documents).toBe(1);
  });
});
