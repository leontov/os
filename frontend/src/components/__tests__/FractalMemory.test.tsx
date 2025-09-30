import { render, screen, waitFor } from "@testing-library/react";
import FractalMemory from "../FractalMemory";

declare global {
  interface Window {
    KolibriSim?: {
      poluchit_canvas: (glubina?: number) => number[][];
    };
  }
}

describe("FractalMemory", () => {
  afterEach(() => {
    delete window.KolibriSim;
  });

  it("renders layers from KolibriSim", async () => {
    const sampleLayers = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [1, 3, 5, 7, 9, 0, 2, 4, 6, 8],
      [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
    ];
    window.KolibriSim = {
      poluchit_canvas: () => sampleLayers,
    };

    const { container } = render(<FractalMemory isReady depth={3} refreshToken={1} />);

    await waitFor(() => {
      expect(screen.getByText("Слой 1")).toBeInTheDocument();
    });

    expect(container).toMatchSnapshot();
  });

  it("renders placeholder when KolibriSim is missing", async () => {
    const { container } = render(<FractalMemory isReady />);

    await waitFor(() => {
      expect(screen.getByText(/KolibriSim недоступен/i)).toBeInTheDocument();
    });

    expect(container).toMatchSnapshot();
  });
});
