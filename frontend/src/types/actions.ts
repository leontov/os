export type ActionInputType = "string" | "number" | "boolean" | "select";

export interface ActionInputOption {
  label: string;
  value: string;
  [key: string]: unknown;
}

export interface ActionInputSpec {
  key: string;
  label: string;
  type: ActionInputType;
  description?: string;
  placeholder?: string;
  default?: unknown;
  options?: ActionInputOption[];
  required?: boolean;
}

export interface ActionRecipe {
  name: string;
  title: string;
  description: string;
  categories: string[];
  tags: string[];
  estimatedDuration?: string;
  inputs: ActionInputSpec[];
}

export type ActionTimelineStatus = "queued" | "in_progress" | "completed" | "failed";

export interface ActionTimelineEntry {
  id: string;
  title: string;
  status: ActionTimelineStatus;
  message?: string;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
}

export type ActionLogLevel = "debug" | "info" | "warning" | "error";

export interface ActionLogEntry {
  id: string;
  stepId?: string;
  level: ActionLogLevel;
  message: string;
  timestamp: number;
}

export interface ActionPermissionEntry {
  id: string;
  name: string;
  granted: boolean;
  reason?: string;
  timestamp: number;
  stepId?: string;
}

export interface ActionRunResult {
  action: string;
  status: "succeeded" | "failed";
  parameters: Record<string, unknown>;
  output: Record<string, unknown>;
  timeline: ActionTimelineEntry[];
  logs: ActionLogEntry[];
  permissions: ActionPermissionEntry[];
}

export interface ActionCatalog {
  recipes: ActionRecipe[];
  categories: string[];
  tags: string[];
}

export interface ActionMacroPayload {
  name: string;
  action: string;
  parameters: Record<string, unknown>;
  tags: string[];
}

export interface ActionMacro extends ActionMacroPayload {
  id: string;
  createdAt: number;
  updatedAt: number;
}
