import { render, screen } from "@testing-library/react";
import NodeGraph from "../NodeGraph";
import type { ClusterTopology } from "../../types/topology";

describe("NodeGraph", () => {
  const topology: ClusterTopology = {
    updatedAt: "2025-09-30T11:00:00.000Z",
    nodes: [
      {
        id: "control-1",
        name: "control-1",
        role: "control",
        status: "online",
        position: { x: 320, y: 100 },
      },
      {
        id: "compute-1",
        name: "compute-1",
        role: "compute",
        status: "degraded",
        position: { x: 320, y: 280 },
      },
    ],
    links: [
      { id: "link-1", source: "control-1", target: "compute-1" },
    ],
  };

  it("renders provided topology", () => {
    render(<NodeGraph topology={topology} />);

    expect(screen.getByRole("heading", { name: /топология кластера/i })).toBeInTheDocument();
    expect(screen.getAllByTestId("node-graph-node")).not.toHaveLength(0);
  });

  it("shows empty state when no data is available", () => {
    render(<NodeGraph topology={null} />);

    expect(screen.getByText(/данные топологии недоступны/i)).toBeInTheDocument();
  });
});
