export type BackendHealthStatus = "ok" | "warning" | "error";

export interface BackendHealthSnapshot {
  status: BackendHealthStatus;
  rawStatus: string;
  responseMode: string;
  ssoEnabled: boolean;
  prometheusNamespace: string | null;
}

export interface FetchBackendHealthOptions {
  signal?: AbortSignal;
  endpoint?: string;
}

const DEFAULT_ENDPOINT = "/api/health";

const normaliseStatus = (value: unknown): BackendHealthStatus => {
  if (typeof value !== "string") {
    return "warning";
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "warning";
  }

  if (trimmed === "ok" || trimmed === "healthy" || trimmed === "ready") {
    return "ok";
  }

  if (trimmed === "degraded" || trimmed === "warn" || trimmed === "warning") {
    return "warning";
  }

  return "error";
};

const resolveResponseMode = (value: unknown): string => {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return "unknown";
};

const resolvePrometheusNamespace = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
};

const isFetchAbortError = (error: unknown): error is DOMException =>
  error instanceof DOMException && error.name === "AbortError";

const resolveEndpoint = (endpoint?: string): string => {
  if (!endpoint) {
    return DEFAULT_ENDPOINT;
  }
  const trimmed = endpoint.trim();
  if (!trimmed) {
    return DEFAULT_ENDPOINT;
  }
  if (trimmed.startsWith("http")) {
    try {
      const parsed = new URL(trimmed);
      return parsed.toString();
    } catch {
      return DEFAULT_ENDPOINT;
    }
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

export const fetchBackendHealth = async (
  options: FetchBackendHealthOptions = {},
): Promise<BackendHealthSnapshot> => {
  const { signal, endpoint } = options;
  const target = resolveEndpoint(endpoint);

  const response = await fetch(target, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Запрос статуса бекенда вернул ${response.status}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;

  const rawStatus = typeof payload.status === "string" && payload.status.trim().length > 0
    ? payload.status.trim()
    : "unknown";

  return {
    status: normaliseStatus(rawStatus),
    rawStatus,
    responseMode: resolveResponseMode(payload.response_mode),
    ssoEnabled: Boolean(payload.sso_enabled),
    prometheusNamespace: resolvePrometheusNamespace(payload.prometheus_namespace),
  };
};

export const getHealthErrorMessage = (error: unknown): string => {
  if (isFetchAbortError(error)) {
    return "Запрос был отменён";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Неизвестная ошибка";
};

export const isAbortError = isFetchAbortError;
