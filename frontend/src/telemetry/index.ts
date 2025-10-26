import { TelemetryClient } from "./client";
import type { PolicyHint } from "./policyHints";
import { detectPolicyHints } from "./policyHints";
import type { TelemetryInitOptions } from "./types";

const telemetryClient = TelemetryClient.getInstance();

const sessionId = (() => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `session-${Math.random().toString(36).slice(2)}`;
})();

export const initializeTelemetry = (options: TelemetryInitOptions = {}): void => {
  telemetryClient.initialize(options);
  telemetryClient.recordUxJourney({
    step: "session:start",
    attributes: {
      sessionId,
    },
  });
};

export const markPerformance = (
  name: string,
  detail?: Record<string, unknown>,
): void => {
  telemetryClient.recordPerformanceMark({
    name,
    detail: {
      ...detail,
      sessionId,
    },
  });
};

export const startPerformanceTimer = (
  name: string,
  detail?: Record<string, unknown>,
): ((extraDetail?: Record<string, unknown>) => void) => {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  markPerformance(`${name}:start`, detail);

  return (extraDetail?: Record<string, unknown>) => {
    const finishedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const duration = Math.max(0, finishedAt - startedAt);
    telemetryClient.recordPerformanceMark({
      name,
      duration,
      detail: {
        ...detail,
        ...extraDetail,
        sessionId,
      },
    });
  };
};

export const recordEmotionFeedback = (
  messageId: string,
  role: "user" | "assistant",
  reaction: "up" | "down" | null,
  context?: Record<string, unknown>,
): void => {
  telemetryClient.recordEmotionFeedback({
    messageId,
    reaction,
    role,
    context: {
      ...context,
      sessionId,
    },
  });
};

export const recordUxJourneyStep = (
  step: string,
  attributes?: Record<string, unknown>,
): void => {
  telemetryClient.recordUxJourney({
    step,
    attributes: {
      ...attributes,
      sessionId,
    },
  });
};

export const collectPolicyHints = (
  messageId: string,
  role: "user" | "assistant",
  content: string,
): PolicyHint[] => {
  const hints = detectPolicyHints(content);
  hints.forEach((hint) => {
    telemetryClient.recordPolicyHint({
      messageId,
      role,
      ...hint,
    });
  });
  return hints;
};

export type { PolicyHint } from "./policyHints";
