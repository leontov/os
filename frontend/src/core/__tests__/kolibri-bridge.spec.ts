import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_INSTANTIATE = WebAssembly.instantiate;
const ORIGINAL_STREAMING = (WebAssembly as typeof WebAssembly & {
  instantiateStreaming?: typeof WebAssembly.instantiateStreaming;
}).instantiateStreaming;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8");

type MockFn = ReturnType<typeof vi.fn>;

type WasmExports = {
  memory: WebAssembly.Memory;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  _kolibri_bridge_init: () => number;
  _kolibri_bridge_reset: () => number;
  _kolibri_bridge_execute: (programPtr: number, outputPtr: number, outputCapacity: number) => number;
};

type WasmInstanceFixture = {
  instance: WebAssembly.Instance;
  exports: WasmExports & Record<string, MockFn>;
  getLastScript: () => string | null;
};

const createWasmInstance = (outputText: string): WasmInstanceFixture => {
  const memory = new WebAssembly.Memory({ initial: 4 });
  let nextPtr = 64;
  let lastScript: string | null = null;

  const exports: WasmExports & Record<string, MockFn> = {
    memory,
    _malloc: vi.fn((size: number) => {
      const ptr = nextPtr;
      nextPtr += size;
      return ptr;
    }),
    _free: vi.fn(() => {
      // no-op for the test harness
    }),
    _kolibri_bridge_init: vi.fn(() => 0),
    _kolibri_bridge_reset: vi.fn(() => 0),
    _kolibri_bridge_execute: vi.fn((programPtr: number, outputPtr: number) => {
      const heap = new Uint8Array(memory.buffer);
      let end = programPtr;
      while (heap[end] !== 0) {
        end += 1;
      }
      const scriptBytes = heap.slice(programPtr, end);
      lastScript = decoder.decode(scriptBytes);

      const bytes = encoder.encode(outputText);
      heap.set(bytes, outputPtr);
      return bytes.length;
    }),
  };

  return {
    instance: { exports } as unknown as WebAssembly.Instance,
    exports,
    getLastScript: () => lastScript,
  };
};

const createMockResponse = (bytes: Uint8Array): Response => {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    arrayBuffer: async () => bytes.buffer,
  } as unknown as Response;
};

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

afterEach(() => {
  if (ORIGINAL_STREAMING) {
    (WebAssembly as typeof WebAssembly & { instantiateStreaming?: typeof WebAssembly.instantiateStreaming }).instantiateStreaming = ORIGINAL_STREAMING;
  } else {
    delete (WebAssembly as typeof WebAssembly & { instantiateStreaming?: typeof WebAssembly.instantiateStreaming }).instantiateStreaming;
  }
  WebAssembly.instantiate = ORIGINAL_INSTANTIATE;
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("kolibri-bridge WebAssembly initialisation", () => {
  it("prefers streaming instantiation when available", async () => {
    const fixture = createWasmInstance("Готово\n");
    const streamingMock = vi
      .fn(async () => ({ instance: fixture.instance }))
      .mockName("instantiateStreaming");

    (WebAssembly as typeof WebAssembly & { instantiateStreaming?: typeof WebAssembly.instantiateStreaming }).instantiateStreaming = streamingMock;
    vi.spyOn(WebAssembly, "instantiate");

    const fetchMock = vi.fn(async () => createMockResponse(new Uint8Array([0x00])));
    globalThis.fetch = fetchMock as typeof fetch;

    const { default: kolibriBridge } = await import("../kolibri-bridge");

    await expect(kolibriBridge.ready).resolves.toBeUndefined();

    const answer = await kolibriBridge.ask("Привет, Колибри!");
    expect(answer).toBe("Готово");

    expect(streamingMock).toHaveBeenCalledTimes(1);
    expect(WebAssembly.instantiate).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fixture.exports._kolibri_bridge_init).toHaveBeenCalledTimes(1);
    expect(fixture.exports._kolibri_bridge_execute).toHaveBeenCalledTimes(1);

    const script = fixture.getLastScript();
    expect(script).toContain('показать "Привет, Колибри!"');
  });

  it("falls back to ArrayBuffer instantiation when streaming fails", async () => {
    const fixture = createWasmInstance("Ответ готов\n");
    const streamingError = new Error("Missing MIME");
    const streamingMock = vi
      .fn(async () => {
        throw streamingError;
      })
      .mockName("instantiateStreaming");

    (WebAssembly as typeof WebAssembly & { instantiateStreaming?: typeof WebAssembly.instantiateStreaming }).instantiateStreaming = streamingMock;

    const instantiateMock = vi
      .spyOn(WebAssembly, "instantiate")
      .mockResolvedValue({ instance: fixture.instance } as WebAssembly.WebAssemblyInstantiatedSource);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const fetchMock = vi
      .fn(async () => createMockResponse(new Uint8Array([0x00, 0x61, 0x73, 0x6d])))
      .mockName("fetch");
    globalThis.fetch = fetchMock as typeof fetch;

    const { default: kolibriBridge } = await import("../kolibri-bridge");

    await expect(kolibriBridge.ready).resolves.toBeUndefined();

    const answer = await kolibriBridge.ask("показать \"Ответ\"");
    expect(answer).toBe("Ответ готов");

    expect(streamingMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(instantiateMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "Kolibri WASM streaming instantiation failed, retrying with ArrayBuffer.",
      streamingError,
    );
  });

  it("switches to the fallback bridge when instantiation fails", async () => {
    const instantiateError = new Error("WASM init failed");

    (WebAssembly as typeof WebAssembly & { instantiateStreaming?: typeof WebAssembly.instantiateStreaming }).instantiateStreaming = vi
      .fn(async () => {
        throw instantiateError;
      })
      .mockName("instantiateStreaming");

    vi.spyOn(WebAssembly, "instantiate").mockRejectedValue(instantiateError);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const fetchMock = vi
      .fn(async () => createMockResponse(new Uint8Array([0x00])))
      .mockName("fetch");
    globalThis.fetch = fetchMock as typeof fetch;

    const { default: kolibriBridge } = await import("../kolibri-bridge");

    await expect(kolibriBridge.ready).resolves.toBeUndefined();

    const message = await kolibriBridge.ask("Любой ввод");
    expect(message).toContain("KolibriScript недоступен");
    expect(message).toContain(instantiateError.message);

    expect(warnSpy).toHaveBeenCalledWith(
      "[kolibri-bridge] Переход в деградированный режим без WebAssembly.",
      instantiateError,
    );
  });
});
