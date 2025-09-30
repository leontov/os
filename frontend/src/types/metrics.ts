export interface RawMetricsEntry {
  key?: string;
  name?: string;
  label?: string;
  value?: number | string;
  unit?: string;
}

export interface MetricsResponse {
  latency?: number;
  latency_ms?: number;
  latencyMs?: number;
  success_rate?: number;
  successRate?: number;
  success_ratio?: number;
  successCount?: number;
  success_count?: number;
  successes?: number;
  total_requests?: number;
  totalRequests?: number;
  timestamp?: string;
  updated_at?: string;
  updatedAt?: string;
  metrics?: RawMetricsEntry[];
  [key: string]: unknown;
}

export interface NormalizedMetrics {
  latencyMs?: number;
  successRate?: number;
  successCount?: number;
  totalRequests?: number;
  lastUpdated?: string;
}
