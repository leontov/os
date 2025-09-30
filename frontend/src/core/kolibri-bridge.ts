/**
 * kolibri-bridge.ts
 *
 * WebAssembly-backed bridge that executes KolibriScript programs inside the
 * browser. The bridge loads `kolibri.wasm`, initialises the Kolibri runtime
 * exported by the module, and exposes a single `ask` method used by the UI.
 */

export interface GenomeBlock {
  nomer: number;
  pred_hash: string;
  payload: string;
  hmac_summa: string;
  itogovy_hash: string;
}

export interface FormulaSummary {
  name: string;
  code: string;
  fitness: number;
  parents: string[];
  context: string;
}

export interface SaveFormulaRequest {
  name?: string;
  code: string;
  context?: string;
}

export interface FormulaEvaluationRequest {
  name?: string;
  code: string;
  context?: string;
  payload?: string;
}

export interface FormulaEvaluationResult {
  success: boolean;
  output: string;
  fitness?: number;
  message?: string;
  metadata?: Record<string, string>;
}

export interface KolibriBridge {
  readonly ready: Promise<void>;
  ask(prompt: string, mode?: string): Promise<string>;
  reset(): Promise<void>;
  fetchGenome(): Promise<GenomeBlock[]>;
  fetchFormulas(): Promise<FormulaSummary[]>;
  saveFormula(update: SaveFormulaRequest): Promise<FormulaSummary>;
  evaluateFormula(request: FormulaEvaluationRequest): Promise<FormulaEvaluationResult>;
}

const API_BASE_URL = "/api";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const { headers: initHeaders, ...rest } = init ?? {};
  const headers: HeadersInit = {
    Accept: "application/json",
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...(initHeaders ?? {}),
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers,
    ...rest,
  });

  if (!response.ok) {
    const reason = await response.text().catch(() => "");
    throw new Error(
      reason ? `${response.status} ${response.statusText}: ${reason}` : `${response.status} ${response.statusText}`,
    );
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as unknown as T;
  }

  return JSON.parse(text) as T;
}

function normaliseGenomeBlock(raw: unknown): GenomeBlock | null {
  if (!isRecord(raw)) {
    return null;
  }

  const nomerRaw = raw.nomer;
  const nomer = typeof nomerRaw === "number" ? nomerRaw : Number.parseInt(String(nomerRaw ?? ""), 10);
  const predHash = typeof raw.pred_hash === "string" ? raw.pred_hash : "";
  const payload = typeof raw.payload === "string" ? raw.payload : "";
  const hmac = typeof raw.hmac_summa === "string" ? raw.hmac_summa : typeof raw.hmac === "string" ? raw.hmac : "";
  const totalHash = typeof raw.itogovy_hash === "string" ? raw.itogovy_hash : typeof raw.final_hash === "string" ? raw.final_hash : "";

  if (!Number.isFinite(nomer) || !predHash || !payload || !hmac || !totalHash) {
    return null;
  }

  return {
    nomer,
    pred_hash: predHash,
    payload,
    hmac_summa: hmac,
    itogovy_hash: totalHash,
  };
}

function normaliseGenomeResponse(raw: unknown): GenomeBlock[] {
  const extract = (value: unknown): GenomeBlock[] => {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((entry) => normaliseGenomeBlock(entry))
      .filter((entry): entry is GenomeBlock => entry !== null)
      .sort((a, b) => a.nomer - b.nomer);
  };

  if (Array.isArray(raw)) {
    return extract(raw);
  }

  if (isRecord(raw)) {
    if (Array.isArray(raw.blocks)) {
      return extract(raw.blocks);
    }
    if (Array.isArray(raw.data)) {
      return extract(raw.data);
    }
  }

  return [];
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function normaliseFormulaEntry(name: string | undefined, raw: unknown): FormulaSummary | null {
  if (!isRecord(raw)) {
    return null;
  }

  const detectedName = typeof raw.name === "string" ? raw.name : typeof raw.nazvanie === "string" ? raw.nazvanie : name;
  if (!detectedName) {
    return null;
  }

  const code = typeof raw.code === "string" ? raw.code : typeof raw.kod === "string" ? raw.kod : "";
  if (!code) {
    return null;
  }

  const fitnessRaw = raw.fitness;
  const fitness = typeof fitnessRaw === "number" ? fitnessRaw : Number.parseFloat(String(fitnessRaw ?? "0"));
  const parents = parseStringArray(raw.parents);
  const context = typeof raw.context === "string" ? raw.context : typeof raw.kontekst === "string" ? raw.kontekst : "";

  return {
    name: detectedName,
    code,
    fitness: Number.isFinite(fitness) ? fitness : 0,
    parents,
    context,
  };
}

function normaliseFormulaList(raw: unknown): FormulaSummary[] {
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => normaliseFormulaEntry(undefined, entry))
      .filter((entry): entry is FormulaSummary => entry !== null)
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  if (isRecord(raw)) {
    if (Array.isArray(raw.formulas)) {
      return normaliseFormulaList(raw.formulas);
    }

    return Object.entries(raw)
      .map(([name, value]) => normaliseFormulaEntry(name, value))
      .filter((entry): entry is FormulaSummary => entry !== null)
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  return [];
}

function normaliseFormulaResponse(raw: unknown, fallbackName?: string): FormulaSummary {
  const entry = normaliseFormulaEntry(fallbackName, raw);
  if (!entry) {
    throw new Error("Некорректный ответ сервера: отсутствуют данные формулы");
  }
  return entry;
}

function normaliseEvaluation(raw: unknown): FormulaEvaluationResult {
  if (!isRecord(raw)) {
    return {
      success: false,
      output: "",
      message: "Некорректный ответ сервера",
    };
  }

  const success = typeof raw.success === "boolean" ? raw.success : raw.error ? false : true;
  const output =
    typeof raw.output === "string"
      ? raw.output
      : typeof raw.result === "string"
        ? raw.result
        : raw.success && typeof raw.message === "string"
          ? raw.message
          : "";
  const message = typeof raw.message === "string" ? raw.message : typeof raw.error === "string" ? raw.error : undefined;
  const fitnessRaw = raw.fitness;
  const fitness = typeof fitnessRaw === "number" ? fitnessRaw : fitnessRaw != null ? Number.parseFloat(String(fitnessRaw)) : undefined;
  const metadata = isRecord(raw.metadata)
    ? Object.entries(raw.metadata)
        .filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string")
        .reduce<Record<string, string>>((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {})
    : undefined;

  return {
    success,
    output,
    fitness: Number.isFinite(fitness ?? NaN) ? fitness : undefined,
    message,
    metadata,
  };
}

async function fetchGenomeFromApi(): Promise<GenomeBlock[]> {
  const response = await requestJson<unknown>("/genome");
  const blocks = normaliseGenomeResponse(response);
  if (!blocks.length) {
    return [];
  }
  return blocks;
}

async function fetchFormulasFromApi(): Promise<FormulaSummary[]> {
  const response = await requestJson<unknown>("/formulas");
  return normaliseFormulaList(response);
}

async function saveFormulaToApi(update: SaveFormulaRequest): Promise<FormulaSummary> {
  const { name, code, context } = update;
  const payload: Record<string, unknown> = { code };
  if (context) {
    payload.context = context;
  }
  if (name) {
    payload.name = name;
  }

  const endpoint = name ? `/formulas/${encodeURIComponent(name)}` : "/formulas";
  const method = name ? "PUT" : "POST";
  const response = await requestJson<unknown>(endpoint, {
    method,
    body: JSON.stringify(payload),
  });
  return normaliseFormulaResponse(response, name);
}

async function evaluateFormulaViaApi(request: FormulaEvaluationRequest): Promise<FormulaEvaluationResult> {
  const payload: Record<string, unknown> = { code: request.code };
  if (request.name) {
    payload.name = request.name;
  }
  if (request.context) {
    payload.context = request.context;
  }
  if (request.payload) {
    payload.payload = request.payload;
  }

  const response = await requestJson<unknown>("/formulas/evaluate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return normaliseEvaluation(response);
}

interface KolibriWasmExports extends WebAssembly.Exports {
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

const COMMAND_PATTERN = /^(показать|обучить|спросить|тикнуть|сохранить)/i;
const PROGRAM_START_PATTERN = /начало\s*:/i;
const PROGRAM_END_PATTERN = /конец\./i;

function escapeScriptString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normaliseLines(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function buildScript(prompt: string, mode: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return `начало:\n    показать "Пустой запрос"\nконец.\n`;
  }

  if (PROGRAM_START_PATTERN.test(trimmed) && PROGRAM_END_PATTERN.test(trimmed)) {
    return trimmed.endsWith("\n") ? trimmed : `${trimmed}\n`;
  }

  const lines = normaliseLines(trimmed);
  const modeLine = mode && mode !== DEFAULT_MODE ? `    показать "Режим: ${escapeScriptString(mode)}"\n` : "";

  const scriptLines = lines.map((line) => {
    if (COMMAND_PATTERN.test(line)) {
      return `    ${line}`;
    }
    return `    показать "${escapeScriptString(line)}"`;
  });

  return `начало:\n${modeLine}${scriptLines.join("\n")}\nконец.\n`;
}

class KolibriWasmBridge implements KolibriBridge {
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder("utf-8");
  private exports: KolibriWasmExports | null = null;
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.initialise();
  }

  private async instantiateWasm(): Promise<WebAssembly.Instance> {
    const importObject: WebAssembly.Imports = {};

    if ("instantiateStreaming" in WebAssembly) {
      try {
        const streamingResult = await WebAssembly.instantiateStreaming(fetch(WASM_RESOURCE_URL), importObject);
        return streamingResult.instance;
      } catch (error) {
        // Fallback to ArrayBuffer path when MIME type is missing.
        console.warn("Kolibri WASM streaming instantiation failed, retrying with ArrayBuffer.", error);
      }
    }

    const response = await fetch(WASM_RESOURCE_URL);
    if (!response.ok) {
      throw new Error(`Не удалось загрузить kolibri.wasm: ${response.status} ${response.statusText}`);
    }
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, importObject);
    return instance;
  }

  private async initialise(): Promise<void> {
    const instance = await this.instantiateWasm();
    const exports = instance.exports as KolibriWasmExports;
    if (typeof exports._kolibri_bridge_init !== "function") {
      throw new Error("WASM-модуль не содержит kolibri_bridge_init");
    }
    const result = exports._kolibri_bridge_init();
    if (result !== 0) {
      throw new Error(`Не удалось инициализировать KolibriScript (код ${result})`);
    }
    this.exports = exports;
  }

  async ask(prompt: string, mode: string = DEFAULT_MODE): Promise<string> {
    await this.ready;
    if (!this.exports) {
      throw new Error("Kolibri WASM мост не готов");
    }

    const exports = this.exports;
    const script = buildScript(prompt, mode);
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
      const text = this.decoder.decode(outputBytes);
      return text.trim().length === 0 ? "KolibriScript завершил работу без вывода." : text.trimEnd();
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

  async fetchGenome(): Promise<GenomeBlock[]> {
    return fetchGenomeFromApi();
  }

  async fetchFormulas(): Promise<FormulaSummary[]> {
    return fetchFormulasFromApi();
  }

  async saveFormula(update: SaveFormulaRequest): Promise<FormulaSummary> {
    return saveFormulaToApi(update);
  }

  async evaluateFormula(request: FormulaEvaluationRequest): Promise<FormulaEvaluationResult> {
    return evaluateFormulaViaApi(request);
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

  async ask(_prompt: string, _mode?: string): Promise<string> {
    void _prompt;
    void _mode;
    return [
      "KolibriScript недоступен: kolibri.wasm не был загружен.",
      `Причина: ${this.reason}`,
      "Запустите scripts/build_wasm.sh и перезапустите фронтенд, чтобы восстановить работоспособность ядра.",
    ].join("\n");
  }

  async reset(): Promise<void> {
    // Нет состояния для сброса в режим без WASM.
  }

  async fetchGenome(): Promise<GenomeBlock[]> {
    return fetchGenomeFromApi();
  }

  async fetchFormulas(): Promise<FormulaSummary[]> {
    return fetchFormulasFromApi();
  }

  async saveFormula(update: SaveFormulaRequest): Promise<FormulaSummary> {
    return saveFormulaToApi(update);
  }

  async evaluateFormula(request: FormulaEvaluationRequest): Promise<FormulaEvaluationResult> {
    return evaluateFormulaViaApi(request);
  }
}

const createBridge = async (): Promise<KolibriBridge> => {
  const wasmBridge = new KolibriWasmBridge();

  try {
    await wasmBridge.ready;
    return wasmBridge;
  } catch (error) {
    console.warn("[kolibri-bridge] Переход в деградированный режим без WebAssembly.", error);
    return new KolibriFallbackBridge(error);
  }
};

const bridgePromise: Promise<KolibriBridge> = createBridge();

const kolibriBridge: KolibriBridge = {
  ready: bridgePromise.then(() => undefined),
  async ask(prompt: string, mode?: string): Promise<string> {
    const bridge = await bridgePromise;
    return bridge.ask(prompt, mode);
  },
  async reset(): Promise<void> {
    const bridge = await bridgePromise;
    await bridge.reset();
  },
  async fetchGenome(): Promise<GenomeBlock[]> {
    const bridge = await bridgePromise;
    return bridge.fetchGenome();
  },
  async fetchFormulas(): Promise<FormulaSummary[]> {
    const bridge = await bridgePromise;
    return bridge.fetchFormulas();
  },
  async saveFormula(update: SaveFormulaRequest): Promise<FormulaSummary> {
    const bridge = await bridgePromise;
    return bridge.saveFormula(update);
  },
  async evaluateFormula(request: FormulaEvaluationRequest): Promise<FormulaEvaluationResult> {
    const bridge = await bridgePromise;
    return bridge.evaluateFormula(request);
  },
};

export default kolibriBridge;
