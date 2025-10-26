import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { DocumentLoadInstrumentation } from "@opentelemetry/instrumentation-document-load";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { UserInteractionInstrumentation } from "@opentelemetry/instrumentation-user-interaction";
import type {
  DistributionPayload,
  EmotionFeedbackPayload,
  PerformanceMarkPayload,
  PolicyHintPayload,
  TelemetryEvent,
  TelemetryInitOptions,
  UxJourneyPayload,
} from "./types";

const DEFAULT_TRACE_ENDPOINT = "/telemetry/v1/traces";
const DEFAULT_METRICS_ENDPOINT = "/telemetry/v1/events";
const DEFAULT_DASHBOARD_CHANNEL = "kolibri-telemetry-dashboard";
const DEFAULT_SERVICE_NAME = "kolibri-frontend";

const RETRY_WINDOW_MS = 15_000;

const isAbortError = (error: unknown): error is DOMException =>
  error instanceof DOMException && error.name === "AbortError";

export class TelemetryClient {
  private static instance: TelemetryClient | null = null;

  private initialized = false;

  private dashboardChannelName: string = DEFAULT_DASHBOARD_CHANNEL;

  private dashboardChannel: BroadcastChannel | null = null;

  private metricsEndpoint: string = DEFAULT_METRICS_ENDPOINT;

  private serviceName: string = DEFAULT_SERVICE_NAME;

  private originalFetch: typeof fetch | null = null;

  private retryAttempts = new Map<string, { count: number; lastStart: number }>();

  private constructor() {}

  public static getInstance(): TelemetryClient {
    if (!TelemetryClient.instance) {
      TelemetryClient.instance = new TelemetryClient();
    }
    return TelemetryClient.instance;
  }

  public initialize(options: TelemetryInitOptions = {}): void {
    if (this.initialized) {
      return;
    }

    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    this.serviceName = options.serviceName ?? DEFAULT_SERVICE_NAME;
    this.metricsEndpoint = options.metricsEndpoint ?? DEFAULT_METRICS_ENDPOINT;
    this.dashboardChannelName = options.dashboardChannel ?? DEFAULT_DASHBOARD_CHANNEL;

    this.setupTracing(options.traceEndpoint ?? DEFAULT_TRACE_ENDPOINT);
    this.instrumentFetchMetrics();
    this.recordNavigationTTFB();

    this.initialized = true;
  }

  public recordPerformanceMark(payload: PerformanceMarkPayload): void {
    if (typeof performance !== "undefined" && performance.mark) {
      try {
        performance.mark(payload.name, payload.detail ? { detail: payload.detail } : undefined);
      } catch (error) {
        console.warn("[telemetry] Не удалось создать performance mark", error);
      }
    }

    this.emit({
      type: "performance-mark",
      timestamp: Date.now(),
      payload,
    });
  }

  public recordDistribution(payload: DistributionPayload): void {
    this.emit({
      type: "distribution",
      timestamp: Date.now(),
      payload,
    });
  }

  public recordEmotionFeedback(payload: EmotionFeedbackPayload): void {
    this.emit({
      type: "emotion-feedback",
      timestamp: Date.now(),
      payload,
    });
  }

  public recordUxJourney(payload: UxJourneyPayload): void {
    this.emit({
      type: "ux-journey",
      timestamp: Date.now(),
      payload,
    });
  }

  public recordPolicyHint(payload: PolicyHintPayload): void {
    this.emit({
      type: "policy-hint",
      timestamp: Date.now(),
      payload,
    });
  }

  private emit(event: TelemetryEvent): void {
    this.broadcast(event);
    void this.flush(event);
  }

  private resolveUrl(endpoint: string): string {
    if (!endpoint) {
      return endpoint;
    }

    try {
      return new URL(endpoint).toString();
    } catch {
      let base = "http://localhost";
      if (typeof window !== "undefined" && window.location?.href) {
        base = window.location.href;
      } else if (typeof globalThis !== "undefined") {
        const globalLocation = (globalThis as { location?: Location }).location;
        if (globalLocation?.href) {
          base = globalLocation.href;
        }
      }
      try {
        return new URL(endpoint, base).toString();
      } catch {
        return endpoint;
      }
    }
  }

  private setupTracing(traceEndpoint: string): void {
    try {
      const provider = new WebTracerProvider({
        resource: new Resource({
          [SemanticResourceAttributes.SERVICE_NAME]: this.serviceName,
          [SemanticResourceAttributes.SERVICE_NAMESPACE]: "kolibri",
        }),
      });

      const exporter = new OTLPTraceExporter({
        url: this.resolveUrl(traceEndpoint),
      });

      provider.addSpanProcessor(new BatchSpanProcessor(exporter));
      provider.register();

      registerInstrumentations({
        instrumentations: [
          new DocumentLoadInstrumentation(),
          new UserInteractionInstrumentation(),
          new FetchInstrumentation({
            propagateTraceHeaderCorsUrls: [/.*/u],
            clearTimingResources: true,
          }),
        ],
      });
    } catch (error) {
      console.warn("[telemetry] Не удалось инициализировать OpenTelemetry", error);
    }
  }

  private broadcast(event: TelemetryEvent): void {
    if (typeof BroadcastChannel === "undefined") {
      return;
    }

    if (!this.dashboardChannel) {
      try {
        this.dashboardChannel = new BroadcastChannel(this.dashboardChannelName);
      } catch (error) {
        console.warn("[telemetry] Не удалось открыть канал BroadcastChannel", error);
        this.dashboardChannel = null;
      }
    }

    this.dashboardChannel?.postMessage(event);
  }

  private async flush(event: TelemetryEvent): Promise<void> {
    const payload = JSON.stringify(event);

    if (!payload || !this.metricsEndpoint) {
      return;
    }

    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
      return;
    }

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      const endpoint = this.resolveUrl(this.metricsEndpoint);
      const sent = navigator.sendBeacon(endpoint, blob);
      if (sent) {
        return;
      }
    }

    const endpoint = this.resolveUrl(this.metricsEndpoint);

    try {
      await fetch(endpoint, {
        method: "POST",
        body: payload,
        headers: {
          "Content-Type": "application/json",
        },
        keepalive: true,
        mode: "cors",
      });
    } catch (error) {
      console.warn("[telemetry] Не удалось отправить событие", error);
    }
  }

  private instrumentFetchMetrics(): void {
    if (typeof window === "undefined" || typeof fetch !== "function") {
      return;
    }

    if (this.originalFetch) {
      return;
    }

    this.originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      const method = init?.method ?? "GET";
      const url = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
      const key = `${method}:${url}`;
      this.noteRetryAttempt(key, startedAt);

      try {
        const response = await this.originalFetch!(input, init);
        const finishedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
        const ttfb = Math.max(0, finishedAt - startedAt);
        this.recordDistribution({
          name: "network.ttfb",
          value: ttfb,
          unit: "ms",
          attributes: {
            method,
            status: response.status,
            ok: response.ok,
          },
        });

        const attempt = this.retryAttempts.get(key);
        if (attempt && attempt.count > 1) {
          this.recordDistribution({
            name: "network.retries",
            value: attempt.count,
            attributes: {
              method,
              status: response.status,
            },
          });
        }

        return response;
      } catch (error) {
        const attempt = this.retryAttempts.get(key);
        if (isAbortError(error)) {
          this.recordDistribution({
            name: "network.cancellations",
            value: 1,
            attributes: {
              method,
              retried: attempt ? attempt.count : 1,
            },
          });
        } else {
          this.recordDistribution({
            name: "network.failures",
            value: 1,
            attributes: {
              method,
              message: error instanceof Error ? error.message : String(error),
            },
          });
        }
        throw error;
      } finally {
        this.expireAttempt(key);
      }
    };
  }

  private recordNavigationTTFB(): void {
    if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") {
      return;
    }

    const entries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (!entries?.length) {
      return;
    }

    const navigationEntry = entries[0];
    const ttfb = navigationEntry.responseStart;
    this.recordDistribution({
      name: "navigation.ttfb",
      value: Math.max(0, ttfb),
      unit: "ms",
      attributes: {
        path: typeof window !== "undefined" ? window.location.pathname : "unknown",
      },
    });
  }

  private noteRetryAttempt(key: string, startedAt: number): void {
    const current = this.retryAttempts.get(key);
    if (current && startedAt - current.lastStart < RETRY_WINDOW_MS) {
      this.retryAttempts.set(key, {
        count: current.count + 1,
        lastStart: startedAt,
      });
      return;
    }

    this.retryAttempts.set(key, {
      count: 1,
      lastStart: startedAt,
    });
  }

  private expireAttempt(key: string): void {
    const current = this.retryAttempts.get(key);
    if (!current) {
      return;
    }

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - current.lastStart > RETRY_WINDOW_MS) {
      this.retryAttempts.delete(key);
    }
  }
}
