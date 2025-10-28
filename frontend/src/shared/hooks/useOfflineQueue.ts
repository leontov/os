import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface OfflineQueueState {
  isOffline: boolean;
  queued: string[];
}

interface UseOfflineQueueReturn extends OfflineQueueState {
  enqueue: (message: string) => void;
  flush: (handler: (message: string) => Promise<void>) => Promise<void>;
}

const STORAGE_KEY = "kolibri-offline-queue";

export function useOfflineQueue(): UseOfflineQueueReturn {
  const [state, setState] = useState<OfflineQueueState>(() => {
    if (typeof window === "undefined") {
      return { isOffline: false, queued: [] };
    }
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const queued = saved ? (JSON.parse(saved) as string[]) : [];
    return { isOffline: !navigator.onLine, queued };
  });

  const savingRef = useRef(false);

  const persist = useCallback((queued: string[]) => {
    if (typeof window === "undefined") {
      return;
    }
    savingRef.current = true;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queued));
    savingRef.current = false;
  }, []);

  useEffect(() => {
    const handleOnline = () => setState((current) => ({ ...current, isOffline: false }));
    const handleOffline = () => setState((current) => ({ ...current, isOffline: true }));

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!savingRef.current) {
      persist(state.queued);
    }
  }, [state.queued, persist]);

  const enqueue = useCallback((message: string) => {
    setState((current) => ({ ...current, queued: [...current.queued, message] }));
  }, []);

  const flush = useCallback(
    async (handler: (message: string) => Promise<void>) => {
      const messagesToSend = [...state.queued];
      const remaining: string[] = [];
      for (const message of messagesToSend) {
        try {
          await handler(message);
        } catch (error) {
          remaining.push(message);
        }
      }
      setState((current) => ({ ...current, queued: remaining }));
    },
    [state.queued],
  );

  return useMemo(
    () => ({
      isOffline: state.isOffline,
      queued: state.queued,
      enqueue,
      flush,
    }),
    [state.isOffline, state.queued, enqueue, flush],
  );
}
