import { useCallback, useEffect, useMemo, useState } from "react";
import {
  connectKnowledgeConnector,
  disconnectKnowledgeConnector,
  formatConnectorStatus,
  formatProviderLabel,
  getAvailableConnectorPresets,
  listKnowledgeConnectors,
  subscribeToConnectorChanges,
  syncKnowledgeConnector,
  toggleKnowledgeConnectorOffline,
  type KnowledgeConnector,
  type KnowledgeConnectorProvider,
} from "./connectors";

interface UseKnowledgeConnectorsResult {
  connectors: KnowledgeConnector[];
  isLoading: boolean;
  error: string | null;
  pendingId: string | null;
  availablePresets: KnowledgeConnectorProvider[];
  refresh: () => Promise<void>;
  connect: (provider: KnowledgeConnectorProvider) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  toggleOffline: (id: string) => Promise<void>;
  sync: (id: string) => Promise<void>;
  getStatusLabel: (status: KnowledgeConnector["status"]) => string;
  getProviderLabel: (provider: KnowledgeConnectorProvider) => string;
}

const resolveErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Не удалось обновить источники знаний";
};

const useKnowledgeConnectors = (): UseKnowledgeConnectorsResult => {
  const [connectors, setConnectors] = useState<KnowledgeConnector[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const availablePresets = useMemo(() => getAvailableConnectorPresets(), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listKnowledgeConnectors();
      setConnectors(data);
      setError(null);
    } catch (reason) {
      setError(resolveErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeToConnectorChanges(() => {
      void refresh();
    });
    return unsubscribe;
  }, [refresh]);

  const withPending = useCallback(
    async (id: string, action: () => Promise<unknown>) => {
      setPendingId(id);
      try {
        await action();
        await refresh();
      } catch (reason) {
        setError(resolveErrorMessage(reason));
      } finally {
        setPendingId(null);
      }
    },
    [refresh],
  );

  const connect = useCallback(
    async (provider: KnowledgeConnectorProvider) => {
      await withPending(provider, () => connectKnowledgeConnector(provider));
    },
    [withPending],
  );

  const disconnect = useCallback(
    async (id: string) => {
      await withPending(id, () => disconnectKnowledgeConnector(id));
    },
    [withPending],
  );

  const toggleOffline = useCallback(
    async (id: string) => {
      await withPending(id, () => toggleKnowledgeConnectorOffline(id));
    },
    [withPending],
  );

  const sync = useCallback(
    async (id: string) => {
      await withPending(id, () => syncKnowledgeConnector(id));
    },
    [withPending],
  );

  const getStatusLabel = useCallback(
    (status: KnowledgeConnector["status"]) => formatConnectorStatus(status),
    [],
  );

  const getProviderLabel = useCallback(
    (provider: KnowledgeConnectorProvider) => formatProviderLabel(provider),
    [],
  );

  return {
    connectors,
    isLoading,
    error,
    pendingId,
    availablePresets,
    refresh,
    connect,
    disconnect,
    toggleOffline,
    sync,
    getStatusLabel,
    getProviderLabel,
  };
};

export default useKnowledgeConnectors;

