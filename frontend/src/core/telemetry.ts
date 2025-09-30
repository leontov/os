type Primitive = boolean | number | string;

type Metadata = Record<string, Primitive>;

type TraceStatus = "success" | "error";

interface TraceOptions {
  readonly metadata?: Metadata;
  readonly traceHint?: string;
}

interface EventOptions {
  readonly metadata?: Metadata;
}

interface TelemetryEnvelope {
  readonly type: "trace" | "event";
  readonly action: string;
  readonly status?: TraceStatus;
  readonly durationMs?: number;
  readonly metadata: Metadata;
  readonly sessionId: string;
  readonly traceId?: string;
  readonly traceHash?: number;
  readonly timestamp: string;
}

const encoder = new TextEncoder();

const hasWindow = typeof window !== "undefined";
const hasNavigator = typeof navigator !== "undefined";
const hasCrypto = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function";
const hasPerformance = typeof performance !== "undefined" && typeof performance.now === "function";

const randomId = (): string => {
  if (hasCrypto) {
    return crypto.randomUUID();
  }
  return `${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
};

const readSessionId = (): string => {
  if (!hasWindow) {
    return randomId();
  }
  try {
    const stored = window.sessionStorage.getItem("kolibri.telemetry.sessionId");
    if (stored) {
      return stored;
    }
  } catch (error) {
    console.warn("Telemetry session storage unavailable", error);
  }
  const fresh = randomId();
  try {
    window.sessionStorage.setItem("kolibri.telemetry.sessionId", fresh);
  } catch (error) {
    console.warn("Telemetry session storage write failed", error);
  }
  return fresh;
};

const nowMs = (): number => {
  if (hasPerformance) {
    return performance.now();
  }
  return Date.now();
};

const sessionId = readSessionId();

const TELEMETRY_ENDPOINT = import.meta.env.VITE_TELEMETRY_ENDPOINT ?? "";

const ALLOWED_STRING_KEYS = new Set([
  "mode",
  "status",
  "errorType",
  "errorMessage",
  "phase",
  "reason",
]);

function computeTraceHash(input: string | undefined): number | undefined {
  if (!input) {
    return undefined;
  }
  const bytes = encoder.encode(input);
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function truncate(value: string, max = 120): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
}

function sanitiseMetadata(input: Metadata | undefined): Metadata {
  if (!input) {
    return {};
  }
  const safe: Metadata = {};
  for (const [key, raw] of Object.entries(input)) {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      safe[key] = Math.round(raw * 1000) / 1000;
      continue;
    }
    if (typeof raw === "boolean") {
      safe[key] = raw;
      continue;
    }
    if (typeof raw === "string" && ALLOWED_STRING_KEYS.has(key)) {
      safe[key] = truncate(raw);
    }
  }
  return safe;
}

function submitTelemetry(payload: TelemetryEnvelope): void {
  const serialised = JSON.stringify(payload);
  if (TELEMETRY_ENDPOINT) {
    try {
      const blob = new Blob([serialised], { type: "application/json" });
      if (hasNavigator && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon(TELEMETRY_ENDPOINT, blob);
        return;
      }
      void fetch(TELEMETRY_ENDPOINT, {
        method: "POST",
        body: serialised,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        mode: "cors",
        credentials: "omit",
      });
      return;
    } catch (error) {
      console.warn("Telemetry dispatch failed", error);
    }
  }
  console.debug("telemetry", payload);
}

class TelemetryTrace {
  private readonly action: string;
  private readonly traceId: string;
  private readonly traceHash?: number;
  private readonly start: number;
  private readonly baseMetadata: Metadata;

  constructor(action: string, options?: TraceOptions) {
    this.action = action;
    this.traceId = randomId();
    this.traceHash = computeTraceHash(options?.traceHint ?? action);
    this.start = nowMs();
    this.baseMetadata = sanitiseMetadata(options?.metadata);
  }

  success(metadata?: Metadata): void {
    this.emit("success", metadata);
  }

  error(error: unknown, metadata?: Metadata): void {
    const errorMetadata: Metadata = {
      errorType: error instanceof Error ? error.name : typeof error,
    };
    if (error instanceof Error && error.message) {
      errorMetadata.errorMessage = truncate(error.message, 96);
    } else if (typeof error === "string") {
      errorMetadata.errorMessage = truncate(error, 96);
    }
    this.emit("error", { ...metadata, ...errorMetadata });
  }

  private emit(status: TraceStatus, metadata?: Metadata): void {
    const durationMs = nowMs() - this.start;
    submitTelemetry({
      type: "trace",
      action: this.action,
      status,
      durationMs,
      metadata: { ...this.baseMetadata, ...sanitiseMetadata(metadata) },
      sessionId,
      traceId: this.traceId,
      traceHash: this.traceHash,
      timestamp: new Date().toISOString(),
    });
  }
}

export function startTrace(action: string, options?: TraceOptions): TelemetryTrace {
  return new TelemetryTrace(action, options);
}

export function trackEvent(action: string, options?: EventOptions): void {
  const metadata = sanitiseMetadata(options?.metadata);
  submitTelemetry({
    type: "event",
    action,
    metadata,
    sessionId,
    timestamp: new Date().toISOString(),
  });
}
