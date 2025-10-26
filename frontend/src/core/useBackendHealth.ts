import { useCallback, useState } from "react";
import {
  fetchBackendHealth,
  getHealthErrorMessage,
  isAbortError,
  type BackendHealthSnapshot,
} from "./health";

interface RefreshOptions {
  signal?: AbortSignal;
  suppressLoading?: boolean;
}

interface UseBackendHealthResult {
  snapshot: BackendHealthSnapshot | null;
  error: string | null;
  checkedAt: string | null;
  isLoading: boolean;
  refresh: (options?: RefreshOptions) => Promise<void>;
}

export const useBackendHealth = (): UseBackendHealthResult => {
  const [snapshot, setSnapshot] = useState<BackendHealthSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(false);

  const refresh = useCallback(async ({ signal, suppressLoading }: RefreshOptions = {}) => {
    if (!suppressLoading) {
      setLoading(true);
      setError(null);
    }

    try {
      const result = await fetchBackendHealth({ signal });
      if (signal?.aborted) {
        return;
      }
      setSnapshot(result);
      setError(null);
    } catch (refreshError) {
      if (isAbortError(refreshError) || signal?.aborted) {
        return;
      }
      setSnapshot(null);
      setError(getHealthErrorMessage(refreshError));
    } finally {
      const aborted = signal?.aborted ?? false;
      if (!aborted) {
        if (!suppressLoading) {
          setLoading(false);
        }
        setCheckedAt(new Date().toISOString());
      }
    }
  }, []);

  return {
    snapshot,
    error,
    checkedAt,
    isLoading,
    refresh,
  };
};

export default useBackendHealth;
