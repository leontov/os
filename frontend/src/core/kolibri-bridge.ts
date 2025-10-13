/**
 * kolibri-bridge.ts
 *
 * WebAssembly-backed bridge that executes KolibriScript programs inside the
 * browser. The bridge loads `kolibri.wasm`, initialises the Kolibri runtime
 * exported by the module, and exposes a single `ask` method used by the UI.
 */
import { createWasiContext } from "./wasi";
import { teachKnowledge, sendKnowledgeFeedback } from "./knowledge";
import type { KnowledgeSnippet } from "../types/knowledge";

import { createWasiPreview1 } from "./wasi";

import { getWasiImports, resetWasi, setMemory } from "./wasi";

export interface KolibriBridge {
  readonly ready: Promise<void>;
  ask(prompt: string, mode?: string, context?: KnowledgeSnippet[]): Promise<string>;
  reset(): Promise<void>;
}

interface KolibriWasmExports {
  memory: WebAssembly.Memory;
  _malloc(size: number): number;
  _free(ptr: number): void;
  _kolibri_bridge_init(): number;
  _kolibri_bridge_reset(): number;
  _kolibri_bridge_execute(programPtr: number, outputPtr: number, outputCapacity: number): number;
}

const OUTPUT_CAPACITY = 8192;
const DEFAULT_MODE = "Быстрый ответ";
const WASM_RESOURCE_URL = "/kolibri.wasm";
const DEFAULT_API_BASE = "/api";

const RESPONSE_MODE = (import.meta.env.VITE_KOLIBRI_RESPONSE_MODE ?? "script").toLowerCase();
const RAW_API_BASE = import.meta.env.VITE_KOLIBRI_API_BASE ?? DEFAULT_API_BASE;

function normaliseApiBase(base: string): string {
  const trimmed = base.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

const API_BASE = normaliseApiBase(RAW_API_BASE) || DEFAULT_API_BASE;
const LLM_INFERENCE_URL = `${API_BASE}/v1/infer`;
const SHOULD_USE_LLM = RESPONSE_MODE === "llm";
const WASM_INFO_URL = "/kolibri.wasm.txt";

const COMMAND_PATTERN = /^(показать|обучить|спросить|тикнуть|сохранить)/i;
const PROGRAM_START_PATTERN = /начало\s*:/i;
const PROGRAM_END_PATTERN = /конец\./i;

type WasiInstanceContext = ReturnType<typeof createWasiContext>;
type WasmExportFunction = (...args: number[]) => number;

const resolveMemory = (exports: WebAssembly.Exports): WebAssembly.Memory => {
  const memory = (exports as Record<string, unknown>).memory;
  if (memory instanceof WebAssembly.Memory) {
    return memory;
  }
  throw new Error("WASM-модуль не экспортирует память WebAssembly");
};

const resolveFunction = (exports: WebAssembly.Exports, candidates: readonly string[]): WasmExportFunction => {
  const lookup = exports as Record<string, unknown>;
  for (const name of candidates) {
    const candidate = lookup[name];
    if (typeof candidate === "function") {
      return candidate as WasmExportFunction;
    }
  }
  throw new Error(`WASM-модуль не экспортирует функции ${candidates.join(" или ")}`);
};

const createKolibriWasmExports = (
  rawExports: WebAssembly.Exports,
  wasi: WasiInstanceContext,
): KolibriWasmExports => {
  const memory = resolveMemory(rawExports);
  wasi.setMemory(memory);

  return {
    memory,
    _malloc: resolveFunction(rawExports, ["_malloc", "malloc"]) as (size: number) => number,
    _free: resolveFunction(rawExports, ["_free", "free"]) as (ptr: number) => void,
    _kolibri_bridge_init: resolveFunction(rawExports, ["_kolibri_bridge_init", "kolibri_bridge_init"]) as () => number,
    _kolibri_bridge_reset: resolveFunction(rawExports, ["_kolibri_bridge_reset", "kolibri_bridge_reset"]) as () => number,
    _kolibri_bridge_execute: resolveFunction(rawExports, ["_kolibri_bridge_execute", "kolibri_bridge_execute"]) as (
      programPtr: number,
      outputPtr: number,
      outputCapacity: number,
    ) => number,
  };
};

function escapeScriptString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, "\\n");
}

function normaliseLines(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function buildScript(prompt: string, mode: string, context: KnowledgeSnippet[]): string {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return `начало:\n    показать "Пустой запрос"\nконец.\n`;
  }

  if (PROGRAM_START_PATTERN.test(trimmed) && PROGRAM_END_PATTERN.test(trimmed)) {
    return trimmed.endsWith("\n") ? trimmed : `${trimmed}\n`;
  }

  const lines: string[] = ["начало:"];

  if (mode && mode !== DEFAULT_MODE) {
    lines.push(`    показать "Режим: ${escapeScriptString(mode)}"`);
  }

  lines.push(`    переменная вопрос = "${escapeScriptString(trimmed)}"`);
  lines.push(`    показать "Вопрос: ${escapeScriptString(trimmed)}"`);

  const uniqueAnswers = new Set<string>();
  context.forEach((snippet, index) => {
    const answer = snippet.content.trim();
    if (!answer) {
      return;
    }
    const normalised = answer.length > 400 ? `${answer.slice(0, 397)}…` : answer;
    if (uniqueAnswers.has(normalised)) {
      return;
    }
    uniqueAnswers.add(normalised);
    lines.push(`    переменная источник_${index + 1} = "${escapeScriptString(snippet.source ?? snippet.id)}"`);
    lines.push(`    обучить связь "${escapeScriptString(trimmed)}" -> "${escapeScriptString(normalised)}"`);
    const sourceLabel = snippet.title || snippet.id;
    lines.push(`    показать "Источник ${index + 1}: ${escapeScriptString(sourceLabel)}"`);
  });

  lines.push(`    создать формулу ответ из "ассоциация"`);
  lines.push("    вызвать эволюцию");
  lines.push(`    оценить ответ на задаче "${escapeScriptString(trimmed)}"`);
  lines.push("    показать итог");
  lines.push("конец.");

  return `${lines.join("\n")}\n`;
}

async function describeWasmFailure(error: unknown): Promise<string> {
  const baseReason =
    error instanceof Error && error.message ? error.message : String(error ?? "Неизвестная ошибка");

  try {
    const response = await fetch(WASM_INFO_URL);
    if (!response.ok) {
      return baseReason;
    }

    const infoText = (await response.text()).trim();
    if (!infoText) {
      return baseReason;
    }

    return `${baseReason}\n\n${infoText}`;
  } catch (infoError) {
    console.debug("[kolibri-bridge] Не удалось получить информацию о kolibri.wasm.", infoError);
    return baseReason;
  }
}

class KolibriWasmBridge implements KolibriBridge {
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder("utf-8");
  private exports: KolibriWasmExports | null = null;
  private readonly wasi = createWasiPreview1();
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.initialise();
  }

  private async instantiateWasm(): Promise<WebAssembly.Instance> {
    const importObject: WebAssembly.Imports = { ...getWasiImports() };

    const importObject: WebAssembly.Imports = { ...this.wasi.imports };
  private async instantiateWasm(): Promise<KolibriWasmExports> {
    const wasi = createWasiContext((text) => {
      console.debug("[kolibri-bridge][wasi]", text);
    });
    const importObject: WebAssembly.Imports = {
      wasi_snapshot_preview1: wasi.imports,
    };

    let instance: WebAssembly.Instance | null = null;
    if ("instantiateStreaming" in WebAssembly) {
      try {
        const streamingResult = await WebAssembly.instantiateStreaming(fetch(WASM_RESOURCE_URL), importObject);
        this.wasi.onInstance(streamingResult.instance);
        return streamingResult.instance;
        instance = streamingResult.instance;
      } catch (error) {
        // Fallback to ArrayBuffer path when MIME type is missing.
        console.warn("Kolibri WASM streaming instantiation failed, retrying with ArrayBuffer.", error);
      }
    }

    if (!instance) {
      const response = await fetch(WASM_RESOURCE_URL);
      if (!response.ok) {
        throw new Error(`Не удалось загрузить kolibri.wasm: ${response.status} ${response.statusText}`);
      }
      const bytes = await response.arrayBuffer();
      const fallbackResult = await WebAssembly.instantiate(bytes, importObject);
      instance = fallbackResult.instance;
    }
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, importObject);
    this.wasi.onInstance(instance);
    return instance;

    return createKolibriWasmExports(instance.exports, wasi);
  }

  private async initialise(): Promise<void> {
    resetWasi();
    const instance = await this.instantiateWasm();
    const exports = instance.exports as KolibriWasmExports;
    if (!(exports.memory instanceof WebAssembly.Memory)) {
      throw new Error("WASM-модуль не предоставил память");
    }
    setMemory(exports.memory);
    if (typeof exports._kolibri_bridge_init !== "function") {
      throw new Error("WASM-модуль не содержит kolibri_bridge_init");
    }
    const exports = await this.instantiateWasm();
    const result = exports._kolibri_bridge_init();
    if (result !== 0) {
      throw new Error(`Не удалось инициализировать KolibriScript (код ${result})`);
    }
    this.exports = exports;
  }

  async ask(prompt: string, mode: string = DEFAULT_MODE, context: KnowledgeSnippet[] = []): Promise<string> {
    await this.ready;
    if (!this.exports) {
      throw new Error("Kolibri WASM мост не готов");
    }

    const exports = this.exports;
   const script = buildScript(prompt, mode, context);
    console.debug("[kolibri-bridge] generated script:\n", script);
    const scriptBytes = this.encoder.encode(script);
    const programPtr = exports._malloc(scriptBytes.length + 1);
    const outputPtr = exports._malloc(OUTPUT_CAPACITY);

    if (!programPtr || !outputPtr) {
      if (programPtr) {
        exports._free(programPtr);
      }
      if (outputPtr) {
        exports._free(outputPtr);
      }
      throw new Error("Недостаточно памяти для выполнения KolibriScript");
    }

    try {
      const heap = new Uint8Array(exports.memory.buffer);
      heap.set(scriptBytes, programPtr);
      heap[programPtr + scriptBytes.length] = 0;

      const written = exports._kolibri_bridge_execute(programPtr, outputPtr, OUTPUT_CAPACITY);
      if (written < 0) {
        throw new Error(this.describeExecutionError(written));
      }

      const outputBytes = heap.subarray(outputPtr, outputPtr + written);
      const text = this.decoder.decode(outputBytes).trim();
      const answer = text.length === 0 ? "KolibriScript завершил работу без вывода." : text;

      // Автоматическое самообучение: фиксируем связку вопрос -> ответ
      void teachKnowledge(prompt, answer);
      void sendKnowledgeFeedback("good", prompt, answer);

      return answer;
    } finally {
      exports._free(programPtr);
      exports._free(outputPtr);
    }
  }

  async reset(): Promise<void> {
    await this.ready;
    if (!this.exports) {
      throw new Error("Kolibri WASM мост не готов");
    }

    const result = this.exports._kolibri_bridge_reset();
    if (result !== 0) {
      throw new Error(`Не удалось сбросить KolibriScript (код ${result})`);
    }
  }

  private describeExecutionError(code: number): string {
    switch (code) {
      case -1:
        return "Не удалось инициализировать KolibriScript.";
      case -2:
        return "WASM-модуль не смог подготовить временный вывод.";
      case -3:
        return "KolibriScript сообщил об ошибке при разборе программы.";
      case -4:
        return "Во время выполнения KolibriScript произошла ошибка.";
      case -5:
        return "Некорректные аргументы вызова KolibriScript.";
      default:
        return `Неизвестная ошибка KolibriScript (код ${code}).`;
    }
  }
}

class KolibriFallbackBridge implements KolibriBridge {
  readonly ready = Promise.resolve();
  private readonly reason: string;

  constructor(error: unknown) {
    if (error instanceof Error && error.message) {
      this.reason = error.message;
    } else {
      this.reason = String(error ?? "Неизвестная ошибка");
    }
  }

  async ask(_prompt: string, _mode?: string, _context: KnowledgeSnippet[] = []): Promise<string> {
    void _prompt;
    void _mode;
    void _context;
    return [
      "KolibriScript недоступен: kolibri.wasm не был загружен.",
      `Причина: ${this.reason}`,
      "Запустите scripts/build_wasm.sh и перезапустите фронтенд, чтобы восстановить работоспособность ядра.",
    ].join("\n");
  }

  async reset(): Promise<void> {
    // Нет состояния для сброса в режим без WASM.
  }
}

class KolibriLLMBridge implements KolibriBridge {
  readonly ready = Promise.resolve();

  constructor(private readonly endpoint: string, private readonly fallback: KolibriBridge) {}

  async ask(prompt: string, mode: string = DEFAULT_MODE): Promise<string> {
    const payload = {
      prompt,
      mode,
    };

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`LLM proxy responded with ${response.status} ${response.statusText}`);
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch (jsonError) {
        throw new Error(`Failed to parse LLM proxy response: ${String(jsonError)}`);
      }

      if (!data || typeof data !== "object" || typeof (data as { response?: unknown }).response !== "string") {
        throw new Error("LLM proxy returned an unexpected payload.");
      }

      const text = ((data as { response: string }).response || "").trim();
      if (!text) {
        throw new Error("LLM proxy returned an empty response.");
      }

      return text;
    } catch (error) {
      console.warn("[kolibri-bridge] Ошибка при запросе к LLM, выполняем KolibriScript.", error);
      const fallbackResponse = await this.fallback.ask(prompt, mode);
      return `${fallbackResponse}\n\n(Ответ сгенерирован KolibriScript из-за ошибки LLM.)`;
    }
  }

  async reset(): Promise<void> {
    await this.fallback.reset();
  }
}

const createBridge = async (): Promise<KolibriBridge> => {
  const wasmBridge = new KolibriWasmBridge();

  let fallback: KolibriBridge;
  try {
    await wasmBridge.ready;
    fallback = wasmBridge;
  } catch (error) {
    console.warn("[kolibri-bridge] Переход в деградированный режим без WebAssembly.", error);
    fallback = new KolibriFallbackBridge(error);
    const reason = await describeWasmFailure(error);
    return new KolibriFallbackBridge(reason);
  }

  if (SHOULD_USE_LLM) {
    return new KolibriLLMBridge(LLM_INFERENCE_URL, fallback);
  }

  return fallback;
};

const bridgePromise: Promise<KolibriBridge> = createBridge();

const kolibriBridge: KolibriBridge = {
  ready: bridgePromise.then(() => undefined),
  async ask(prompt: string, mode?: string, context: KnowledgeSnippet[] = []): Promise<string> {
    const bridge = await bridgePromise;
    return bridge.ask(prompt, mode, context);
  },
  async reset(): Promise<void> {
    const bridge = await bridgePromise;
    await bridge.reset();
  },
};

export default kolibriBridge;
