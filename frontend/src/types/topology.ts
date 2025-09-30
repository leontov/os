export type NodeRole = "control" | "compute" | "storage" | "ingress" | "database";

export type NodeStatus = "online" | "offline" | "degraded";

export interface ClusterNode {
  id: string;
  name: string;
  role: NodeRole;
  status: NodeStatus;
  metrics?: {
    cpuLoad?: number;
    memoryUsage?: number;
  };
  position: {
    x: number;
    y: number;
  };
};

export interface ClusterLink {
  id: string;
  source: ClusterNode["id"];
  target: ClusterNode["id"];
  bandwidthGbps?: number;
  latencyMs?: number;
};

export interface ClusterTopology {
  updatedAt: string;
  nodes: ClusterNode[];
  links: ClusterLink[];
}
