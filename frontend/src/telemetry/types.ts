export type TelemetryEventType =
  | "performance-mark"
  | "distribution"
  | "emotion-feedback"
  | "ux-journey"
  | "policy-hint";

export interface BaseTelemetryEvent<T extends TelemetryEventType, P = unknown> {
  type: T;
  timestamp: number;
  payload: P;
}

export interface PerformanceMarkPayload {
  name: string;
  duration?: number;
  detail?: Record<string, unknown>;
}

export interface DistributionPayload {
  name: string;
  value: number;
  unit?: string;
  attributes?: Record<string, unknown>;
}

export interface EmotionFeedbackPayload {
  messageId: string;
  reaction: "up" | "down" | null;
  role: "user" | "assistant";
  context?: Record<string, unknown>;
}

export interface UxJourneyPayload {
  step: string;
  attributes?: Record<string, unknown>;
}

export type PolicySeverity = "info" | "warn" | "block";

export interface PolicyHintPayload {
  messageId: string;
  severity: PolicySeverity;
  code: string;
  label: string;
  explanation: string;
  role: "user" | "assistant";
}

export type TelemetryEvent =
  | BaseTelemetryEvent<"performance-mark", PerformanceMarkPayload>
  | BaseTelemetryEvent<"distribution", DistributionPayload>
  | BaseTelemetryEvent<"emotion-feedback", EmotionFeedbackPayload>
  | BaseTelemetryEvent<"ux-journey", UxJourneyPayload>
  | BaseTelemetryEvent<"policy-hint", PolicyHintPayload>;

export interface TelemetryInitOptions {
  serviceName?: string;
  traceEndpoint?: string;
  metricsEndpoint?: string;
  dashboardChannel?: string;
}
