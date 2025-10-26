import type {
  ActionCatalog,
  ActionLogEntry,
  ActionMacro,
  ActionMacroPayload,
  ActionPermissionEntry,
  ActionRecipe,
  ActionRunResult,
  ActionTimelineEntry,
} from "../types/actions";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

const jsonHeaders = { "Content-Type": "application/json" } as const;

interface RawTimelineEntry {
  id: string;
  title: string;
  status: ActionTimelineEntry["status"];
  message?: string;
  started_at: number;
  finished_at?: number;
  duration_ms?: number;
}

interface RawLogEntry {
  id: string;
  step_id?: string;
  level: ActionLogEntry["level"];
  message: string;
  timestamp: number;
}

interface RawPermissionEntry {
  id: string;
  name: string;
  granted: boolean;
  reason?: string;
  timestamp: number;
  step_id?: string;
}

interface RawRunResult {
  action: string;
  status: "succeeded" | "failed";
  parameters: Record<string, unknown>;
  output: Record<string, unknown>;
  timeline: RawTimelineEntry[];
  logs: RawLogEntry[];
  permissions: RawPermissionEntry[];
}

interface RawCatalog {
  recipes: Array<Omit<ActionRecipe, "estimatedDuration"> & { estimated_duration?: string }>;
  categories: string[];
  tags: string[];
}

interface RawMacro extends ActionMacroPayload {
  id: string;
  created_at: number;
  updated_at: number;
}

const buildUrl = (endpoint: string) => `${API_BASE_URL}${endpoint}`;

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (response.ok) {
    return (await response.json()) as T;
  }

  let detail = "Не удалось выполнить запрос.";
  try {
    const data = (await response.json()) as { detail?: string } | undefined;
    if (data?.detail) {
      detail = data.detail;
    }
  } catch {
    // Игнорируем ошибки парсинга и возвращаем сообщение по умолчанию.
  }
  throw new Error(detail);
};

const mapTimeline = (entries: RawTimelineEntry[]): ActionTimelineEntry[] =>
  entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    status: entry.status,
    message: entry.message,
    startedAt: entry.started_at,
    finishedAt: entry.finished_at,
    durationMs: entry.duration_ms,
  }));

const mapLogs = (entries: RawLogEntry[]): ActionLogEntry[] =>
  entries.map((entry) => ({
    id: entry.id,
    stepId: entry.step_id,
    level: entry.level,
    message: entry.message,
    timestamp: entry.timestamp,
  }));

const mapPermissions = (entries: RawPermissionEntry[]): ActionPermissionEntry[] =>
  entries.map((entry) => ({
    id: entry.id,
    name: entry.name,
    granted: entry.granted,
    reason: entry.reason,
    timestamp: entry.timestamp,
    stepId: entry.step_id,
  }));

const mapRunResult = (payload: RawRunResult): ActionRunResult => ({
  action: payload.action,
  status: payload.status,
  parameters: payload.parameters ?? {},
  output: payload.output ?? {},
  timeline: mapTimeline(payload.timeline ?? []),
  logs: mapLogs(payload.logs ?? []),
  permissions: mapPermissions(payload.permissions ?? []),
});

const mapRecipe = (recipe: RawCatalog["recipes"][number]): ActionRecipe => ({
  ...recipe,
  estimatedDuration: recipe.estimated_duration ?? undefined,
});

const mapMacro = (macro: RawMacro): ActionMacro => ({
  id: macro.id,
  name: macro.name,
  action: macro.action,
  parameters: macro.parameters ?? {},
  tags: macro.tags ?? [],
  createdAt: macro.created_at,
  updatedAt: macro.updated_at,
});

export const fetchActionCatalog = async (): Promise<ActionCatalog> => {
  const response = await fetch(buildUrl("/api/v1/actions/catalog"));
  const data = await handleResponse<RawCatalog>(response);
  return {
    recipes: data.recipes.map(mapRecipe),
    categories: data.categories ?? [],
    tags: data.tags ?? [],
  };
};

export const runAction = async (action: string, parameters: Record<string, unknown>): Promise<ActionRunResult> => {
  const response = await fetch(buildUrl("/api/v1/actions/run"), {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ action, parameters }),
  });
  const payload = await handleResponse<RawRunResult>(response);
  return mapRunResult(payload);
};

export const listMacros = async (): Promise<ActionMacro[]> => {
  const response = await fetch(buildUrl("/api/v1/actions/macros"));
  const data = await handleResponse<{ items: RawMacro[] }>(response);
  return (data.items ?? []).map(mapMacro);
};

export const createMacro = async (payload: ActionMacroPayload): Promise<ActionMacro> => {
  const response = await fetch(buildUrl("/api/v1/actions/macros"), {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  const data = await handleResponse<RawMacro>(response);
  return mapMacro(data);
};

export const updateMacro = async (id: string, payload: ActionMacroPayload): Promise<ActionMacro> => {
  const response = await fetch(buildUrl(`/api/v1/actions/macros/${id}`), {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  const data = await handleResponse<RawMacro>(response);
  return mapMacro(data);
};

export const deleteMacro = async (id: string): Promise<void> => {
  const response = await fetch(buildUrl(`/api/v1/actions/macros/${id}`), {
    method: "DELETE",
  });
  if (!response.ok) {
    await handleResponse<void>(response);
  }
};
