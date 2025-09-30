import { useMemo } from "react";
import type { ClusterTopology, ClusterNode, ClusterLink, NodeStatus } from "../types/topology";

interface NodeGraphProps {
  topology: ClusterTopology | null;
  isLoading?: boolean;
  error?: string | null;
  onReload?: () => void;
}

const STATUS_LABELS: Record<NodeStatus, string> = {
  online: "В работе",
  offline: "Отключён",
  degraded: "Проблемы",
};

const STATUS_COLORS: Record<NodeStatus, string> = {
  online: "#22c55e",
  offline: "#ef4444",
  degraded: "#f97316",
};

const VIEWBOX_WIDTH = 720;
const VIEWBOX_HEIGHT = 420;

const formatPercentage = (value?: number) =>
  typeof value === "number" ? `${Math.round(value * 100)}%` : "—";

const NodeGraph = ({ topology, isLoading = false, error = null, onReload }: NodeGraphProps) => {
  const nodeLookup = useMemo(() => {
    if (!topology) {
      return new Map<string, ClusterNode>();
    }

    return new Map<string, ClusterNode>(topology.nodes.map((node) => [node.id, node]));
  }, [topology]);

  const connectionCounts = useMemo(() => {
    if (!topology) {
      return new Map<string, number>();
    }

    const counts = new Map<string, number>();
    for (const link of topology.links) {
      counts.set(link.source, (counts.get(link.source) ?? 0) + 1);
      counts.set(link.target, (counts.get(link.target) ?? 0) + 1);
    }
    return counts;
  }, [topology]);

  const updatedAt = useMemo(() => {
    if (!topology) {
      return null;
    }

    const timestamp = new Date(topology.updatedAt);
    return Number.isNaN(timestamp.getTime()) ? null : timestamp;
  }, [topology?.updatedAt]);

  const renderLink = (link: ClusterLink) => {
    const source = nodeLookup.get(link.source);
    const target = nodeLookup.get(link.target);

    if (!source || !target) {
      return null;
    }

    return (
      <g key={link.id} stroke="#94a3b8" strokeWidth={2} opacity={0.7}>
        <line x1={source.position.x} y1={source.position.y} x2={target.position.x} y2={target.position.y} />
      </g>
    );
  };

  const renderNode = (node: ClusterNode) => (
    <g key={node.id} transform={`translate(${node.position.x}, ${node.position.y})`}>
      <circle r={26} fill="white" stroke={STATUS_COLORS[node.status]} strokeWidth={4} />
      <text textAnchor="middle" y={-36} className="fill-slate-500 text-[10px] font-medium uppercase tracking-wide">
        {node.role}
      </text>
      <text textAnchor="middle" y={6} className="fill-slate-700 text-xs font-semibold">
        {node.name}
      </text>
      <text textAnchor="middle" y={24} className="fill-slate-500 text-[10px]">
        {STATUS_LABELS[node.status]}
      </text>
    </g>
  );

  const nodes = topology?.nodes ?? [];
  const links = topology?.links ?? [];
  const hasNodes = nodes.length > 0;

  const handleReload = () => {
    if (!onReload || isLoading) {
      return;
    }
    onReload();
  };

  let body: JSX.Element;

  if (isLoading) {
    body = (
      <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center text-text-light">
        <span className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-500" />
        <p className="text-base font-medium">Загружаю данные топологии…</p>
        <p className="text-sm">Это может занять несколько секунд.</p>
      </div>
    );
  } else if (error) {
    body = (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-center">
        <p className="text-base font-semibold text-rose-500">Не удалось загрузить топологию кластера</p>
        <p className="max-w-md text-sm text-text-light">{error}</p>
        {onReload ? (
          <button
            type="button"
            onClick={handleReload}
            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
          >
            Повторить попытку
          </button>
        ) : null}
      </div>
    );
  } else if (!hasNodes) {
    body = (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-center text-text-light">
        <p className="text-base font-medium text-text-dark">Данные топологии недоступны</p>
        <p className="max-w-md text-sm">
          Kolibri ещё не передал снимок кластера. Как только телеметрия поступит, узлы и связи появятся на этой
          схеме автоматически.
        </p>
        {onReload ? (
          <button
            type="button"
            onClick={handleReload}
            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
          >
            Запросить данные
          </button>
        ) : null}
      </div>
    );
  } else {
    body = (
      <>
        <div className="mt-6 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 p-4">
          <svg
            role="img"
            aria-label="Схема соединений кластера"
            viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
            className="h-[360px] w-full"
          >
            {links.map(renderLink)}
            {nodes.map(renderNode)}
          </svg>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {nodes.map((node) => (
            <article
              key={node.id}
              className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm"
              data-testid="node-graph-node"
            >
              <header className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{node.role}</p>
                  <h2 className="text-lg font-semibold text-text-dark">{node.name}</h2>
                </div>
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: STATUS_COLORS[node.status] }}
                >
                  {STATUS_LABELS[node.status][0]}
                </span>
              </header>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm text-text-light">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">CPU</dt>
                  <dd className="text-base font-semibold text-text-dark">{formatPercentage(node.metrics?.cpuLoad)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Память</dt>
                  <dd className="text-base font-semibold text-text-dark">{formatPercentage(node.metrics?.memoryUsage)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Состояние</dt>
                  <dd className="font-medium text-text-dark">{STATUS_LABELS[node.status]}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Связи</dt>
                  <dd className="font-medium text-text-dark">{connectionCounts.get(node.id) ?? 0}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </>
    );
  }

  return (
    <section
      aria-labelledby="cluster-topology-heading"
      className="rounded-3xl bg-white/90 p-6 shadow-card backdrop-blur"
      data-testid="node-graph"
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 id="cluster-topology-heading" className="text-2xl font-semibold text-text-dark">
            Топология кластера
          </h1>
          {updatedAt ? (
            <p className="text-sm text-text-light">
              Обновлено {updatedAt.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          ) : null}
        </div>
        {hasNodes ? (
          <div className="flex flex-wrap gap-3">
            {Object.entries(STATUS_LABELS).map(([status, label]) => (
              <div key={status} className="flex items-center gap-2 text-sm text-text-light">
                <span className="block h-3 w-3 rounded-full" style={{ backgroundColor: STATUS_COLORS[status as NodeStatus] }} />
                {label}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {body}
    </section>
  );
};

export default NodeGraph;
