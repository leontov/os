import { afterEach, describe, expect, it, vi } from "vitest";

const knowledgeMock = {
  knowledgeUrl: "/mock-knowledge.json",
  knowledgeHash: "",
  knowledgeAvailable: false,
  knowledgeError: "",
};

vi.mock("virtual:kolibri-knowledge", () => knowledgeMock);

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
});
