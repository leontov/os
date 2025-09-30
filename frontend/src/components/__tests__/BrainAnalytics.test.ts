import { describe, expect, it } from "vitest";
import {
  buildFitnessSeries,
  buildMutationSeries,
  summarizeBrainMetrics,
  type BrainMetricRecord,
} from "../brain-analytics-transforms";

describe("BrainAnalytics data transforms", () => {
  const baseRecords: BrainMetricRecord[] = [
    { minute: 0, formula: "f0", fitness: 0.4, genome: 100 },
    { minute: 1, formula: "f1", fitness: 0.5, genome: 102, mutationCount: 2 },
    { minute: 2, formula: "f2", fitness: 0.6, genome: 105 },
    { minute: 3, formula: "f3", fitness: 0.7, genome: 109 },
  ];

  it("buildFitnessSeries should compute rolling averages with provided window", () => {
    const series = buildFitnessSeries(baseRecords, 2);

    expect(series).toHaveLength(baseRecords.length);
    expect(series.map((point) => point.minute)).toEqual([0, 1, 2, 3]);
    expect(series.map((point) => Number(point.rollingAverage.toFixed(3)))).toEqual([
      0.4,
      0.45,
      0.55,
      0.65,
    ]);
  });

  it("buildMutationSeries should prefer explicit mutation counts and fall back to genome delta", () => {
    const series = buildMutationSeries(baseRecords);

    expect(series).toEqual([
      { minute: 0, mutations: 0, genome: 100 },
      { minute: 1, mutations: 2, genome: 102 },
      { minute: 2, mutations: 3, genome: 105 },
      { minute: 3, mutations: 4, genome: 109 },
    ]);
  });

  it("summarizeBrainMetrics should calculate aggregate statistics", () => {
    const summary = summarizeBrainMetrics(baseRecords);

    expect(summary.latestFitness).toBeCloseTo(0.7);
    expect(summary.peakFitness).toBeCloseTo(0.7);
    expect(summary.averageFitness).toBeCloseTo(0.55);
    expect(summary.totalMutations).toBe(9);
    expect(summary.mutationRate).toBeCloseTo(3);
  });
});
