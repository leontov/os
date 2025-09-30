import { useCallback, useEffect, useRef, useState } from "react";
import type { ClusterTopology } from "../types/topology";

const TOPOLOGY_ENDPOINT = "/telemetry/topology";

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const validateTopology = (payload: unknown): ClusterTopology => {
  if (!payload || typeof payload !== "object") {
    throw new Error("Ответ телеметрии не похож на объект топологии.");
  }

  const candidate = payload as Partial<ClusterTopology> & { nodes?: unknown; links?: unknown };

  if (!isNonEmptyString(candidate.updatedAt)) {
    throw new Error("Отсутствует корректное поле updatedAt.");
  }

  if (!Array.isArray(candidate.nodes) || !Array.isArray(candidate.links)) {
    throw new Error("Узел или связи топологии переданы в неверном формате.");
  }

  for (const node of candidate.nodes) {
    if (!node || typeof node !== "object") {
      throw new Error("В списке узлов присутствует некорректный элемент.");
    }
    const { id, name, role, status, position } = node as Record<string, unknown>;
    if (!isNonEmptyString(id) || !isNonEmptyString(name)) {
      throw new Error("Каждый узел должен содержать строки id и name.");
    }
    if (!isNonEmptyString(role) || !isNonEmptyString(status)) {
      throw new Error("Узел должен иметь указанные роль и статус.");
    }
    if (!position || typeof position !== "object" || !isNumber((position as Record<string, unknown>).x) || !isNumber((position as Record<string, unknown>).y)) {
      throw new Error("Каждый узел должен содержать числовую позицию.");
    }
  }

  for (const link of candidate.links) {
    if (!link || typeof link !== "object") {
      throw new Error("В списке связей присутствует некорректный элемент.");
    }
    const { id, source, target } = link as Record<string, unknown>;
    if (!isNonEmptyString(id) || !isNonEmptyString(source) || !isNonEmptyString(target)) {
      throw new Error("Связь должна иметь строковые id, source и target.");
    }
  }

  return candidate as ClusterTopology;
};

const useClusterTopology = () => {
  const [topology, setTopology] = useState<ClusterTopology | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const reload = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(TOPOLOGY_ENDPOINT, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Сервер вернул ${response.status} ${response.statusText || ""}`.trim());
      }

      const payload = (await response.json()) as unknown;
      const validated = validateTopology(payload);

      if (!controller.signal.aborted) {
        setTopology(validated);
      }
    } catch (fetchError) {
      if (controller.signal.aborted) {
        return;
      }
      setTopology(null);
      setError(fetchError instanceof Error ? fetchError.message : "Неизвестная ошибка при загрузке телеметрии.");
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  return { topology, isLoading, error, reload };
};

export default useClusterTopology;
