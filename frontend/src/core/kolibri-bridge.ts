/**
 * kolibri-bridge.ts
 *
 * Высокоуровневый мост между интерфейсом и ядром KolibriScript. Модуль
 * пытается загрузить WebAssembly-модуль `kolibri.wasm`, а при сбоях
 * gracefully деградирует до резервных реализаций (LLM или статическое
 * сообщение). Вся логика построения KolibriScript программ собрана здесь,
 * чтобы обеспечить прозрачность и детерминированность поведения фронтенда.
 */

import type { SerializedAttachment } from "../types/attachments";
import type { KnowledgeSnippet } from "../types/knowledge";
import { sendKnowledgeFeedback, teachKnowledge } from "./knowledge";
import { findModeLabel } from "./modes";
import {
  wasmUrl as importedWasmUrl,
  wasmInfoUrl as importedWasmInfoUrl,
  wasmAvailable as wasmBundleAvailable,
  wasmIsStub as wasmBundleIsStub,
  wasmError as wasmBundleError,
} from "virtual:kolibri-wasm";

export interface KernelControlPayload {
  lambdaB: number;
  lambdaD: number;
  targetB: number | null;
  targetD: number | null;
  temperature: number;
  topK: number;
  cfBeam: boolean;
}

export interface KernelCapabilities {
  wasm: boolean;
  simd: boolean;
  laneWidth: number;
}

export interface KolibriBridge {
  readonly ready: Promise<void>;
  ask(
    prompt: string,
    mode?: string,
    context?: KnowledgeSnippet[],
    attachments?: SerializedAttachment[],
    options?: KolibriAskOptions,
  ): Promise<string>;
  reset(): Promise<void>;
  configure(controls: KernelControlPayload): Promise<void>;
  capabilities(): Promise<KernelCapabilities>;
}

export interface KolibriChunkMetadata {
  done?: boolean;
  provider?: string;
  latencyMs?: number;
}

export interface KolibriAskOptions {
  model?: string;
  onToken?: (chunk: string, metadata?: KolibriChunkMetadata) => void;
  signal?: AbortSignal;
}

interface KolibriWasmExports {
  memory: WebAssembly.Memory;
  _malloc(size: number): number;
  _free(ptr: number): void;
  _kolibri_bridge_init(): number;
  _kolibri_bridge_reset(): number;
  _kolibri_bridge_execute(programPtr: number, outputPtr: number, outputCapacity: number): number;
  _kolibri_bridge_configure(
    lambdaB: number,
    lambdaD: number,
    targetB: number,
    targetD: number,
    temperature: number,
    topK: number,
    cfBeam: number,
  ): number;
  _kolibri_bridge_has_simd(): number;
  _kolibri_bridge_lane_width(): number;
}

const OUTPUT_CAPACITY = 8192;
const DEFAULT_MODE_LABEL = "Нейтральный";
const WASM_RESOURCE_URL = importedWasmUrl ?? "/kolibri.wasm";
const WASM_INFO_URL = importedWasmInfoUrl ?? "/kolibri.wasm.txt";
const WASM_BUNDLE_AVAILABLE = wasmBundleAvailable;
const WASM_BUNDLE_IS_STUB = wasmBundleIsStub;
const WASM_BUNDLE_ERROR = wasmBundleError?.trim() ?? "";
const DEFAULT_API_BASE = "/api";
const RESPONSE_MODE = (import.meta.env.VITE_KOLIBRI_RESPONSE_MODE ?? "script").toLowerCase();
const RAW_API_BASE = import.meta.env.VITE_KOLIBRI_API_BASE ?? DEFAULT_API_BASE;

const API_BASE = (() => {
  const trimmed = RAW_API_BASE.trim();
  if (!trimmed) {
    return DEFAULT_API_BASE;
  }
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
})();

const LLM_INFERENCE_URL = `${API_BASE}/v1/infer`;
const SHOULD_USE_LLM = RESPONSE_MODE === "llm";

const COMMAND_PATTERN = /^(показать|обучить|спросить|тикнуть|сохранить)/i;
const PROGRAM_START_PATTERN = /начало\s*:/i;
const PROGRAM_END_PATTERN = /конец\./i;

const textDecoder = new TextDecoder("utf-8");
const textEncoder = new TextEncoder();

interface ParsedSseEvent {
  event: string;
  data: string;
}

const parseSseEvent = (rawEvent: string): ParsedSseEvent => {
  const lines = rawEvent.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (!line) {
      continue;
    }
    if (line.startsWith(":")) {
      continue;
    }
    if (line.startsWith("event:")) {
      const value = line.slice(6).trim();
      if (value) {
        event = value;
      }
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  return { event, data: dataLines.join("\n") };
};

const coerceString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  return undefined;
};

const coerceNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const extractChunk = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return coerceString(record.text) ?? coerceString(record.delta) ?? coerceString(record.token);
  }
  return undefined;
};

const WASI_ERRNO_SUCCESS = 0;
const WASI_ERRNO_INVAL = 28;
const WASI_ERRNO_IO = 29;
const WASI_FILETYPE_CHARACTER_DEVICE = 2;

class WasiAdapter {
  private memory: WebAssembly.Memory | null = null;
  private view: DataView | null = null;

  constructor(
    private readonly stdout: (text: string) => void = (text) => console.debug("[kolibri-wasi]", text.trim()),
    private readonly stderr: (text: string) => void = (text) => console.warn("[kolibri-wasi][stderr]", text.trim()),
  ) {}

  attach(memory: WebAssembly.Memory): void {
    this.memory = memory;
    this.view = new DataView(memory.buffer);
  }

  private ensureView(): DataView {
    if (!this.memory) {
      throw new Error("WASI memory is not initialised");
    }
    if (!this.view || this.view.buffer !== this.memory.buffer) {
      this.view = new DataView(this.memory.buffer);
    }
    return this.view;
  }

  private ensureBytes(): Uint8Array {
    if (!this.memory) {
      throw new Error("WASI memory is not initialised");
    }
    return new Uint8Array(this.memory.buffer);
  }

  get imports(): Record<string, Record<string, WebAssembly.ImportValue>> {
    return {
      wasi_snapshot_preview1: {
        args_get: () => WASI_ERRNO_SUCCESS,
        args_sizes_get: (argcPtr: number, argvBufSizePtr: number) => {
          const view = this.ensureView();
          view.setUint32(argcPtr, 0, true);
          view.setUint32(argvBufSizePtr, 0, true);
          return WASI_ERRNO_SUCCESS;
        },
        environ_get: () => WASI_ERRNO_SUCCESS,
        environ_sizes_get: (countPtr: number, sizePtr: number) => {
          const view = this.ensureView();
          view.setUint32(countPtr, 0, true);
          view.setUint32(sizePtr, 0, true);
          return WASI_ERRNO_SUCCESS;
        },
        fd_close: () => WASI_ERRNO_SUCCESS,
        fd_fdstat_get: (_fd: number, statPtr: number) => {
          const view = this.ensureView();
          for (let offset = 0; offset < 24; offset += 1) {
            view.setUint8(statPtr + offset, 0);
          }
          view.setUint8(statPtr, WASI_FILETYPE_CHARACTER_DEVICE);
          return WASI_ERRNO_SUCCESS;
        },
        fd_seek: () => WASI_ERRNO_IO,
        fd_write: (fd: number, iovsPtr: number, iovsLen: number, nwrittenPtr: number) => {
          if (!this.memory) {
            return WASI_ERRNO_INVAL;
          }
          const view = this.ensureView();
          let bytesWritten = 0;
          for (let index = 0; index < iovsLen; index += 1) {
            const ptr = view.getUint32(iovsPtr + index * 8, true);
            const len = view.getUint32(iovsPtr + index * 8 + 4, true);
            bytesWritten += len;
            if (fd === 1 || fd === 2) {
              const chunk = new Uint8Array(this.memory.buffer, ptr, len);
              const text = textDecoder.decode(chunk);
              if (fd === 1) {
                this.stdout(text);
              } else {
                this.stderr(text);
              }
            }
          }
          view.setUint32(nwrittenPtr, bytesWritten >>> 0, true);
          view.setUint32(nwrittenPtr + 4, Math.floor(bytesWritten / 2 ** 32) >>> 0, true);
          return WASI_ERRNO_SUCCESS;
        },
        proc_exit: (status: number) => {
          throw new Error(`WASI program exited with code ${status}`);
        },
        random_get: (ptr: number, len: number) => {
          if (!this.memory) {
            return WASI_ERRNO_INVAL;
          }
          const bytes = new Uint8Array(this.memory.buffer, ptr, len);
          if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
            crypto.getRandomValues(bytes);
          } else {
            for (let index = 0; index < len; index += 1) {
              bytes[index] = Math.floor(Math.random() * 256);
            }
          }
          return WASI_ERRNO_SUCCESS;
        },
      },
    };
  }
}

const resolveMemory = (exports: WebAssembly.Exports): WebAssembly.Memory => {
  const memory = (exports as Record<string, unknown>).memory;
  if (memory instanceof WebAssembly.Memory) {
    return memory;
  }
  throw new Error("WASM-модуль не экспортирует память WebAssembly");
};

const resolveFunction = (exports: WebAssembly.Exports, candidates: readonly string[]): (...args: number[]) => number => {
  const lookup = exports as Record<string, unknown>;
  for (const name of candidates) {
    const candidate = lookup[name];
    if (typeof candidate === "function") {
      return candidate as (...args: number[]) => number;
    }
  }
  throw new Error(`WASM-модуль не экспортирует функции ${candidates.join(" или ")}`);
};

const createKolibriWasmExports = (rawExports: WebAssembly.Exports, wasi: WasiAdapter): KolibriWasmExports => {
  const memory = resolveMemory(rawExports);
  wasi.attach(memory);
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
    _kolibri_bridge_configure: resolveFunction(
      rawExports,
      ["_kolibri_bridge_configure", "kolibri_bridge_configure"],
    ) as (
      lambdaB: number,
      lambdaD: number,
      targetB: number,
      targetD: number,
      temperature: number,
      topK: number,
      cfBeam: number,
    ) => number,
    _kolibri_bridge_has_simd: resolveFunction(
      rawExports,
      ["_kolibri_bridge_has_simd", "kolibri_bridge_has_simd"],
    ) as () => number,
    _kolibri_bridge_lane_width: resolveFunction(
      rawExports,
      ["_kolibri_bridge_lane_width", "kolibri_bridge_lane_width"],
    ) as () => number,
  };
};

const escapeScriptString = (value: string): string =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, "\\n");

const normaliseLines = (input: string): string[] =>
  input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

export function buildScript(prompt: string, mode: string, context: KnowledgeSnippet[]): string {
  const trimmedPrompt = prompt.trim();
  const resolvedMode = mode ? findModeLabel(mode) : DEFAULT_MODE_LABEL;

  if (!trimmedPrompt) {
    return `начало:\n    показать "Пустой запрос"\nконец.\n`;
  }

  if (PROGRAM_START_PATTERN.test(trimmedPrompt) && PROGRAM_END_PATTERN.test(trimmedPrompt)) {
    return trimmedPrompt.endsWith("\n") ? trimmedPrompt : `${trimmedPrompt}\n`;
  }

  const lines: string[] = ["начало:"];

  if (resolvedMode && resolvedMode !== DEFAULT_MODE_LABEL) {
    lines.push(`    показать "Режим: ${escapeScriptString(resolvedMode)}"`);
  }

  lines.push(`    переменная вопрос = "${escapeScriptString(trimmedPrompt)}"`);
  lines.push(`    показать "Вопрос: ${escapeScriptString(trimmedPrompt)}"`);

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
    const sourceLabel = snippet.title || snippet.id;
    lines.push(`    переменная источник_${index + 1} = "${escapeScriptString(snippet.source ?? snippet.id)}"`);
    lines.push(`    обучить связь "${escapeScriptString(trimmedPrompt)}" -> "${escapeScriptString(normalised)}"`);
    lines.push(`    показать "Источник ${index + 1}: ${escapeScriptString(sourceLabel)}"`);
  });

  if (normaliseLines(trimmedPrompt).every((line) => COMMAND_PATTERN.test(line))) {
    lines.push("    вызвать эволюцию");
  }

  lines.push(`    создать формулу ответ из "ассоциация"`);
  lines.push("    вызвать эволюцию");
  lines.push(`    оценить ответ на задаче "${escapeScriptString(trimmedPrompt)}"`);
  lines.push("    показать итог");
  lines.push("конец.");

  return `${lines.join("\n")}\n`;
}

async function describeWasmFailure(error: unknown): Promise<string> {
  const baseReason = error instanceof Error && error.message ? error.message : String(error ?? "Неизвестная ошибка");

  try {
    const response = await fetch(WASM_INFO_URL, { cache: "no-store" });
    if (!response.ok) {
      return baseReason;
    }
    const infoText = (await response.text()).trim();
    return infoText ? `${baseReason}\n\n${infoText}` : baseReason;
  } catch {
    return baseReason;
  }
}

class KolibriWasmRuntime {
  private exports: KolibriWasmExports | null = null;
  private readonly wasi = new WasiAdapter();
  private capabilitiesSnapshot: KernelCapabilities = { wasm: true, simd: false, laneWidth: 1 };

  async initialise(): Promise<void> {
    const instance = await this.instantiate();
    const exports = createKolibriWasmExports(instance.exports, this.wasi);
    const initResult = exports._kolibri_bridge_init();
    if (initResult !== 0) {
      throw new Error(`Не удалось инициализировать KolibriScript (код ${initResult})`);
    }
    this.exports = exports;
    try {
      const hasSimd = exports._kolibri_bridge_has_simd() === 1;
      const rawLaneWidth = exports._kolibri_bridge_lane_width();
      const laneWidth =
        Number.isFinite(rawLaneWidth) && rawLaneWidth > 0 ? Math.floor(rawLaneWidth) : 1;
      this.capabilitiesSnapshot = { wasm: true, simd: hasSimd, laneWidth };
    } catch (error) {
      console.warn("[kolibri-bridge] Не удалось определить поддержку SIMD", error);
      this.capabilitiesSnapshot = { wasm: true, simd: false, laneWidth: 1 };
    }
  }

  private async instantiate(): Promise<WebAssembly.Instance> {
    const wasiImports = this.wasi.imports;
    const moduleImports: Record<string, Record<string, WebAssembly.ImportValue>> = {
      ...wasiImports,
    };

    const existingEnv = moduleImports.env;
    const envModule: Record<string, WebAssembly.ImportValue> = Object.create(null);
    if (existingEnv && typeof existingEnv === "object") {
      Object.assign(envModule, existingEnv);
    }

    if (typeof envModule.emscripten_notify_memory_growth !== "function") {
      envModule.emscripten_notify_memory_growth = () => {
        // Стандартные standalone-сборки emcc вызывают эту функцию при расширении памяти.
        // Наши адаптеры памяти обновляются лениво перед чтениями, поэтому тут достаточно no-op.
      };
    }

    moduleImports.env = envModule;

    if ("instantiateStreaming" in WebAssembly) {
      try {
        const streaming = await WebAssembly.instantiateStreaming(fetch(WASM_RESOURCE_URL), moduleImports);
        return streaming.instance;
      } catch (error) {
        console.warn("Kolibri WASM streaming instantiation failed, retrying with ArrayBuffer.", error);
      }
    }

    const response = await fetch(WASM_RESOURCE_URL);
    if (!response.ok) {
      throw new Error(`Не удалось загрузить kolibri.wasm: ${response.status} ${response.statusText}`);
    }
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, moduleImports);
    return instance;
  }

  getCapabilities(): KernelCapabilities {
    return this.capabilitiesSnapshot;
  }

  async execute(prompt: string, mode: string, context: KnowledgeSnippet[]): Promise<string> {
    if (!this.exports) {
      throw new Error("Kolibri WASM мост не инициализирован");
    }

    const script = buildScript(prompt, mode ?? DEFAULT_MODE_LABEL, context);
    const scriptBytes = textEncoder.encode(script);
    const exports = this.exports;
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
      const rawText = textDecoder.decode(outputBytes).trim();
      const answer = rawText.length === 0 ? "KolibriScript завершил работу без вывода." : rawText;

      void teachKnowledge(prompt, answer);
      void sendKnowledgeFeedback("good", prompt, answer);

      return answer;
    } finally {
      exports._free(programPtr);
      exports._free(outputPtr);
    }
  }

  async configure(controls: KernelControlPayload): Promise<void> {
    if (!this.exports) {
      throw new Error("Kolibri WASM мост не инициализирован");
    }

    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    const lambdaB = Math.max(0, Math.round(clamp(controls.lambdaB, 0, 2) * 1000));
    const lambdaD = Math.max(0, Math.round(clamp(controls.lambdaD, 0, 2) * 1000));
    const targetB =
      controls.targetB === null ? -1 : Math.round(clamp(controls.targetB, -10, 10) * 1000);
    const targetD =
      controls.targetD === null ? -1 : Math.round(clamp(controls.targetD, 0, 1) * 1000);
    const temperature = Math.max(1, Math.round(clamp(controls.temperature, 0.1, 2.5) * 100));
    const topK = Math.max(1, Math.round(clamp(controls.topK, 1, 64)));
    const cfBeam = controls.cfBeam ? 1 : 0;

    const result = this.exports._kolibri_bridge_configure(
      lambdaB,
      lambdaD,
      targetB,
      targetD,
      temperature,
      topK,
      cfBeam,
    );
    if (result !== 0) {
      throw new Error(`Не удалось обновить настройки KolibriScript (код ${result})`);
    }
  }

  async reset(): Promise<void> {
    if (!this.exports) {
      throw new Error("Kolibri WASM мост не инициализирован");
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

class KolibriScriptBridge implements KolibriBridge {
  readonly ready = Promise.resolve();

  constructor(private readonly runtime: KolibriWasmRuntime) {}

  async ask(
    prompt: string,
    mode: string = DEFAULT_MODE_LABEL,
    context: KnowledgeSnippet[] = [],
    attachments: SerializedAttachment[] = [],
    options?: KolibriAskOptions,
  ): Promise<string> {
    if (attachments.length) {
      console.info(
        `[kolibri-bridge] KolibriScript пока игнорирует ${attachments.length} вложения(ий).`,
      );
    }
    const answer = await this.runtime.execute(prompt, mode, context);
    options?.onToken?.(answer, { done: true, provider: "kolibri-script" });
    return answer;
  }

  async reset(): Promise<void> {
    await this.runtime.reset();
  }

  async configure(controls: KernelControlPayload): Promise<void> {
    await this.runtime.configure(controls);
  }

  capabilities(): Promise<KernelCapabilities> {
    return Promise.resolve(this.runtime.getCapabilities());
  }
}

class KolibriFallbackBridge implements KolibriBridge {
  readonly ready = Promise.resolve();

  private readonly capability: KernelCapabilities = { wasm: false, simd: false, laneWidth: 1 };

  constructor(private readonly reason: string) {}

  async ask(
    _prompt: string,
    _mode?: string,
    _context?: KnowledgeSnippet[],
    attachments: SerializedAttachment[] = [],
    options?: KolibriAskOptions,
  ): Promise<string> {
    void options;
    if (attachments.length) {
      console.info(
        `[kolibri-bridge] Получено ${attachments.length} вложения(ий), но KolibriScript недоступен.`,
      );
    }
    const details = this.reason.trim();
    const reasonText = details ? `Причина: ${details}` : "Причина: неизвестна.";
    const answer = [
      "KolibriScript недоступен: kolibri.wasm не был загружен.",
      reasonText,
      "Запустите scripts/build_wasm.sh или установите переменную KOLIBRI_ALLOW_WASM_STUB=1 для деградированного режима.",
    ].join("\n");
    options?.onToken?.(answer, { done: true, provider: "kolibri-fallback" });
    return answer;
  }

  async reset(): Promise<void> {
    // Нет состояния для сброса.
  }

  async configure(controls: KernelControlPayload): Promise<void> {
    void controls;
    // Настройки недоступны в деградированном режиме.
  }

  capabilities(): Promise<KernelCapabilities> {
    return Promise.resolve(this.capability);
  }
}

class KolibriLLMBridge implements KolibriBridge {
  readonly ready = Promise.resolve();

  constructor(private readonly endpoint: string, private readonly fallback: KolibriBridge) {}

  async ask(
    prompt: string,
    mode: string = DEFAULT_MODE_LABEL,
    context: KnowledgeSnippet[] = [],
    attachments: SerializedAttachment[] = [],
    options?: KolibriAskOptions,
  ): Promise<string> {
    const payload: Record<string, unknown> = { prompt, mode, context };
    if (attachments.length) {
      payload.attachments = attachments;
    }
    if (options?.model) {
      payload.model = options.model;
    }
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(payload),
        signal: options?.signal,
      });

      if (!response.ok) {
        throw new Error(`LLM proxy responded with ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get("Content-Type")?.toLowerCase() ?? "";
      if (contentType.includes("text/event-stream")) {
        return await this.consumeSseResponse(response, options);
      }

      const data = (await response.json()) as Record<string, unknown>;
      const text = coerceString(data.response);
      if (!text) {
        throw new Error("LLM proxy returned an unexpected payload.");
      }
      const provider = coerceString(data.provider) ?? "llm";
      const latencyMs = coerceNumber(data.latency_ms ?? data.latencyMs);
      options?.onToken?.(text, { done: true, provider, latencyMs });
      return text.trim();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      console.warn("[kolibri-bridge] Ошибка при запросе к LLM, выполняем KolibriScript.", error);
      const fallbackResponse = await this.fallback.ask(prompt, mode, context, attachments);
      const finalResponse = `${fallbackResponse}\n\n(Ответ сгенерирован KolibriScript из-за ошибки LLM.)`;
      options?.onToken?.("", { done: true, provider: "kolibri-script" });
      return finalResponse;
    }
  }

  async reset(): Promise<void> {
    await this.fallback.reset();
  }

  async configure(controls: KernelControlPayload): Promise<void> {
    await this.fallback.configure(controls);
  }

  capabilities(): Promise<KernelCapabilities> {
    return this.fallback.capabilities();
  }

  private async consumeSseResponse(response: Response, options?: KolibriAskOptions): Promise<string> {
    const body = response.body;
    if (!body) {
      throw new Error("Streaming response is not supported by this environment.");
    }
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulated = "";
    let provider: string | undefined = "llm";
    let latencyMs: number | undefined;
    let completed = false;

    const applyMetadata = (payload: unknown): void => {
      if (!payload || typeof payload !== "object") {
        return;
      }
      const record = payload as Record<string, unknown>;
      const providerCandidate = coerceString(record.provider);
      if (providerCandidate) {
        provider = providerCandidate;
      }
      const latencyCandidate = coerceNumber(record.latency_ms ?? record.latencyMs ?? record.latency);
      if (latencyCandidate !== undefined) {
        latencyMs = latencyCandidate;
      }
    };

    const processEvent = (rawEvent: string): void => {
      if (!rawEvent.trim()) {
        return;
      }
      const parsed = parseSseEvent(rawEvent);
      const data = parsed.data;
      let payload: unknown = data;
      if (data) {
        try {
          payload = JSON.parse(data);
        } catch {
          payload = data;
        }
      }

      applyMetadata(payload);

      if (parsed.event === "token") {
        const chunk = extractChunk(payload);
        if (chunk) {
          accumulated += chunk;
          options?.onToken?.(chunk, { done: false, provider, latencyMs });
        }
        return;
      }

      if (parsed.event === "done") {
        const explicitText = extractChunk(payload) ?? coerceString(payload);
        if (explicitText) {
          accumulated = explicitText;
        }
        options?.onToken?.("", { done: true, provider, latencyMs });
        completed = true;
        return;
      }

      if (parsed.event === "error") {
        const message =
          typeof payload === "string"
            ? payload
            : coerceString((payload as Record<string, unknown>).message) ?? "LLM streaming error";
        throw new Error(message);
      }

      // Metadata-only events update provider/latency without emitting tokens.
      applyMetadata(payload);
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let separatorIndex = buffer.indexOf("\n\n");
      while (separatorIndex !== -1) {
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        processEvent(rawEvent);
        separatorIndex = buffer.indexOf("\n\n");
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      processEvent(buffer);
    }

    if (!completed) {
      options?.onToken?.("", { done: true, provider, latencyMs });
    }
    return accumulated.trim();
  }
}

const createBridge = async (): Promise<KolibriBridge> => {
  if (!WASM_BUNDLE_AVAILABLE) {
    const fallbackReason = WASM_BUNDLE_ERROR || "kolibri.wasm недоступен. Запустите scripts/build_wasm.sh.";
    const reason = await describeWasmFailure(new Error(fallbackReason));
    console.warn("[kolibri-bridge] Переход в деградированный режим без WebAssembly.", reason);
    return new KolibriFallbackBridge(reason);
  }

  if (WASM_BUNDLE_IS_STUB) {
    const reason = await describeWasmFailure(new Error("kolibri.wasm собран как заглушка."));
    console.warn("[kolibri-bridge] Обнаружена заглушка kolibri.wasm, активирован деградированный режим.", reason);
    return new KolibriFallbackBridge(reason);
  }

  const runtime = new KolibriWasmRuntime();

  try {
    await runtime.initialise();
  } catch (error) {
    const reason = await describeWasmFailure(error);
    console.warn("[kolibri-bridge] Переход в деградированный режим без WebAssembly.", reason);
    return new KolibriFallbackBridge(reason);
  }

  const scriptBridge = new KolibriScriptBridge(runtime);

  if (SHOULD_USE_LLM) {
    return new KolibriLLMBridge(LLM_INFERENCE_URL, scriptBridge);
  }

  return scriptBridge;
};

const bridgePromise: Promise<KolibriBridge> = createBridge();

const kolibriBridge: KolibriBridge = {
  ready: bridgePromise.then(() => undefined),
  async ask(
    prompt: string,
    mode?: string,
    context: KnowledgeSnippet[] = [],
    attachments: SerializedAttachment[] = [],
    options?: KolibriAskOptions,
  ): Promise<string> {
    const bridge = await bridgePromise;
    return bridge.ask(prompt, mode, context, attachments, options);
  },
  async reset(): Promise<void> {
    const bridge = await bridgePromise;
    await bridge.reset();
  },
  async configure(controls: KernelControlPayload): Promise<void> {
    const bridge = await bridgePromise;
    await bridge.configure(controls);
  },
  async capabilities(): Promise<KernelCapabilities> {
    const bridge = await bridgePromise;
    return bridge.capabilities();
  },
};

export default kolibriBridge;
