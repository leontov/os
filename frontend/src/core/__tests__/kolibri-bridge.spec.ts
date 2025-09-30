import { describe, it, expect, vi, afterEach } from "vitest";

const encoder = new TextEncoder();

const createWasmExports = (output: string) => {
  const memory = new WebAssembly.Memory({ initial: 2 });
  let nextPtr = 1024;

  return {
    memory,
    _malloc: (size: number) => {
      const ptr = nextPtr;
      nextPtr += size;
      return ptr;
    },
    _free: () => {
      // Память освобождается сборщиком мусора в тестах.
    },
    _kolibri_bridge_init: () => 0,
    _kolibri_bridge_reset: () => 0,
    _kolibri_bridge_execute: (_programPtr: number, outputPtr: number) => {
      const bytes = encoder.encode(output);
      const heap = new Uint8Array(memory.buffer);
      heap.set(bytes, outputPtr);
      return bytes.length;
    },
  };
};

const originalInstantiateStreaming = (WebAssembly as Record<string, unknown>).instantiateStreaming;

const ensureInstantiateStreaming = () => {
  if (!("instantiateStreaming" in WebAssembly)) {
    Object.defineProperty(WebAssembly, "instantiateStreaming", {
      configurable: true,
      writable: true,
      value: async () => {
        throw new Error("Not implemented");
      },
    });
  }
};

afterEach(() => {
  vi.restoreAllMocks();
  if (!originalInstantiateStreaming) {
    delete (WebAssembly as Record<string, unknown>).instantiateStreaming;
  }
  vi.resetModules();
});

describe("kolibriBridge", () => {
  it("оставляет полноценный мост при отказе streaming и успешной повторной инициализации", async () => {
    ensureInstantiateStreaming();

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const instantiateStreamingSpy = vi
      .spyOn(WebAssembly as { instantiateStreaming: typeof WebAssembly.instantiateStreaming }, "instantiateStreaming")
      .mockRejectedValue(new Error("bad mime"));
    const instantiateSpy = vi
      .spyOn(WebAssembly, "instantiate")
      .mockResolvedValue({
        instance: { exports: createWasmExports("Готово") } as unknown as WebAssembly.Instance,
      } as unknown as WebAssembly.WebAssemblyInstantiatedSource);

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);

    const { default: kolibriBridge } = await import("../kolibri-bridge");

    await expect(kolibriBridge.ready).resolves.toBeUndefined();
    await expect(kolibriBridge.ask("показать \"Привет\"")).resolves.toBe("Готово");

    expect(instantiateStreamingSpy).toHaveBeenCalled();
    expect(instantiateSpy).toHaveBeenCalled();
    expect(
      warnSpy.mock.calls.some(
        ([message]) => typeof message === "string" && message.includes("[kolibri-bridge]")
      )
    ).toBe(false);
  });

  it("включает деградированный режим при реальной ошибке и сообщает причину", async () => {
    ensureInstantiateStreaming();

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.spyOn(WebAssembly as { instantiateStreaming: typeof WebAssembly.instantiateStreaming }, "instantiateStreaming").mockRejectedValue(
      new Error("bad mime"),
    );
    vi.spyOn(WebAssembly, "instantiate").mockRejectedValue(new Error("wasm unavailable"));

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);

    const { default: kolibriBridge } = await import("../kolibri-bridge");

    await expect(kolibriBridge.ready).resolves.toBeUndefined();
    const answer = await kolibriBridge.ask("Привет");

    expect(answer).toContain("KolibriScript недоступен");
    expect(answer).toContain("Причина: wasm unavailable");
    expect(
      warnSpy.mock.calls.some(
        ([message]) => typeof message === "string" && message.includes("[kolibri-bridge]")
      )
    ).toBe(true);
  });
});
