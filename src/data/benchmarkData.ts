import { BenchmarkItem } from "../types/distributedSystem";

/**
 * Benchmark data collected from real automated Python benchmark suite runs
 * on the Distributed Event Processing System.
 */
export const VERIFIED_BENCHMARKS: BenchmarkItem[] = [
  {
    mode: "Static",
    workerCount: 1,
    peakWorkers: 1,
    numEvents: 200,
    totalTimeSeconds: 0.585,
    throughputEps: 341.66,
    avgLatencyMs: 1.29,
  },
  {
    mode: "Static",
    workerCount: 2,
    peakWorkers: 2,
    numEvents: 200,
    totalTimeSeconds: 0.448,
    throughputEps: 446.92,
    avgLatencyMs: 1.55,
  },
  {
    mode: "Static",
    workerCount: 4,
    peakWorkers: 4,
    numEvents: 200,
    totalTimeSeconds: 0.381,
    throughputEps: 525.17,
    avgLatencyMs: 4.04,
  },
  {
    mode: "Static",
    workerCount: 4,
    peakWorkers: 4,
    numEvents: 1000,
    totalTimeSeconds: 1.617,
    throughputEps: 618.53,
    avgLatencyMs: 3.39,
  },
  {
    mode: "Static",
    workerCount: 1,
    peakWorkers: 1,
    numEvents: 300,
    totalTimeSeconds: 0.851,
    throughputEps: 352.69,
    avgLatencyMs: 1.31,
  },
  {
    mode: "Autoscaled",
    workerCount: 1,
    peakWorkers: 4,
    numEvents: 300,
    totalTimeSeconds: 5.855,
    throughputEps: 51.24,
    avgLatencyMs: 20.19,
  },
];
