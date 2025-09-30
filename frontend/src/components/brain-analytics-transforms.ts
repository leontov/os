export interface BrainMetricRecord {
  minute: number;
  formula: string;
  fitness: number;
  genome: number;
  mutationCount?: number;
}

export interface BrainMetricMetadata {
  source?: string;
  generatedAt?: string;
  windowMinutes?: number;
}

export interface FitnessPoint {
  minute: number;
  fitness: number;
  rollingAverage: number;
}

export interface MutationPoint {
  minute: number;
  mutations: number;
  genome: number;
}

export interface BrainMetricSummary {
  latestFitness: number | null;
  peakFitness: number | null;
  averageFitness: number | null;
  totalMutations: number;
  mutationRate: number | null;
}

export function buildFitnessSeries(
  records: BrainMetricRecord[],
  windowSize = 5
): FitnessPoint[] {
  if (windowSize <= 0 || !Number.isFinite(windowSize)) {
    windowSize = 1;
  }

  const size = Math.max(1, Math.floor(windowSize));
  const sorted = [...records].sort((a, b) => a.minute - b.minute);
  const window: number[] = [];
  let windowSum = 0;

  return sorted.map((record) => {
    window.push(record.fitness);
    windowSum += record.fitness;

    if (window.length > size) {
      windowSum -= window.shift() ?? 0;
    }

    const rollingAverage = windowSum / window.length;

    return {
      minute: record.minute,
      fitness: record.fitness,
      rollingAverage,
    };
  });
}

export function buildMutationSeries(records: BrainMetricRecord[]): MutationPoint[] {
  const sorted = [...records].sort((a, b) => a.minute - b.minute);
  const points: MutationPoint[] = [];
  let previousGenome: number | null = null;

  for (const record of sorted) {
    let mutations = 0;

    if (typeof record.mutationCount === "number" && Number.isFinite(record.mutationCount)) {
      mutations = Math.max(0, record.mutationCount);
    } else if (previousGenome !== null) {
      const delta = record.genome - previousGenome;
      mutations = delta > 0 ? delta : 0;
    }

    points.push({
      minute: record.minute,
      mutations,
      genome: record.genome,
    });

    previousGenome = record.genome;
  }

  return points;
}

export function summarizeBrainMetrics(records: BrainMetricRecord[]): BrainMetricSummary {
  if (!records.length) {
    return {
      latestFitness: null,
      peakFitness: null,
      averageFitness: null,
      totalMutations: 0,
      mutationRate: null,
    };
  }

  const sorted = [...records].sort((a, b) => a.minute - b.minute);
  const fitnessValues = sorted.map((record) => record.fitness);
  const latestFitness = sorted[sorted.length - 1]?.fitness ?? null;
  const peakFitness = Math.max(...fitnessValues);
  const totalFitness = fitnessValues.reduce((sum, value) => sum + value, 0);
  const averageFitness = totalFitness / fitnessValues.length;
  const mutationSeries = buildMutationSeries(sorted);
  const totalMutations = mutationSeries.reduce((sum, point) => sum + point.mutations, 0);
  const mutationRate = sorted.length > 1 ? totalMutations / (sorted.length - 1) : 0;

  return {
    latestFitness,
    peakFitness,
    averageFitness,
    totalMutations,
    mutationRate,
  };
}
