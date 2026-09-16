import React, { useState } from "react";
import { VERIFIED_BENCHMARKS } from "../data/benchmarkData";
import { BenchmarkItem } from "../types/distributedSystem";

interface BenchmarksPageProps {
  onRunLiveBenchmark: (count: number, workers: number, onComplete: (res: BenchmarkItem) => void) => void;
}

export const BenchmarksPage: React.FC<BenchmarksPageProps> = ({
  onRunLiveBenchmark,
}) => {
  const [selectedEvents, setSelectedEvents] = useState<number>(100);
  const [selectedWorkers, setSelectedWorkers] = useState<number>(2);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentResult, setCurrentResult] = useState<BenchmarkItem | null>(null);
  const [benchmarkHistory, setBenchmarkHistory] = useState<BenchmarkItem[]>(VERIFIED_BENCHMARKS);

  const handleRun = () => {
    setIsRunning(true);
    setCurrentResult(null);

    onRunLiveBenchmark(selectedEvents, selectedWorkers, (res) => {
      setIsRunning(false);
      setCurrentResult(res);
      setBenchmarkHistory((prev) => [res, ...prev]);
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h2 className="text-base font-semibold text-gray-900">
          System Performance &amp; Scalability Benchmarks
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Measure real throughput and processing latency across different worker pool sizes
        </p>
      </div>

      {/* Benchmark Control Panel */}
      <div className="bg-white p-5 rounded-lg border border-gray-200 space-y-4">
        <div className="text-sm font-semibold text-gray-900">
          Configure Benchmark Run
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Number of Events */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1.5">
              Number of Events:
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[100, 1000, 5000, 10000].map((num) => (
                <button
                  type="button"
                  key={num}
                  onClick={() => setSelectedEvents(num)}
                  className={`py-1.5 px-2 rounded text-xs font-medium border transition-colors ${
                    selectedEvents === num
                      ? "bg-blue-50 text-blue-700 border-blue-300 font-bold"
                      : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Number of Workers */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1.5">
              Concurrent Workers:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 4].map((w) => (
                <button
                  type="button"
                  key={w}
                  onClick={() => setSelectedWorkers(w)}
                  className={`py-1.5 px-2 rounded text-xs font-medium border transition-colors ${
                    selectedWorkers === w
                      ? "bg-blue-50 text-blue-700 border-blue-300 font-bold"
                      : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {w} {w === 1 ? "Worker" : "Workers"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between border-t border-gray-100">
          <span className="text-xs text-gray-500">
            Simulates {selectedEvents} events dispatched across 4 partitions with {selectedWorkers} workers.
          </span>
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors disabled:opacity-50"
          >
            {isRunning ? "Running Benchmark..." : "Run Benchmark"}
          </button>
        </div>
      </div>

      {/* Latest Result Display */}
      {currentResult && (
        <div className="bg-blue-50/60 border border-blue-200 rounded-lg p-4">
          <div className="text-xs font-bold uppercase text-blue-800 tracking-wider mb-2">
            Latest Benchmark Run Result
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-white p-3 rounded border border-blue-100">
              <span className="text-gray-500 block">Events Processed</span>
              <span className="text-lg font-bold text-gray-900">
                {currentResult.numEvents}
              </span>
            </div>
            <div className="bg-white p-3 rounded border border-blue-100">
              <span className="text-gray-500 block">Processing Time</span>
              <span className="text-lg font-bold text-gray-900">
                {currentResult.totalTimeSeconds} s
              </span>
            </div>
            <div className="bg-white p-3 rounded border border-blue-100">
              <span className="text-gray-500 block">Throughput</span>
              <span className="text-lg font-bold text-blue-700">
                {currentResult.throughputEps} eps
              </span>
            </div>
            <div className="bg-white p-3 rounded border border-blue-100">
              <span className="text-gray-500 block">Avg Latency</span>
              <span className="text-lg font-bold text-gray-900">
                {currentResult.avgLatencyMs} ms
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Comparison Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-900">
            Benchmark Comparison Table
          </h3>
          <p className="text-xs text-gray-500">
            Recorded execution measurements comparing 1, 2, and 4 concurrent workers
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-200 text-gray-500 font-semibold">
                <th className="py-2.5 px-3">Workers</th>
                <th className="py-2.5 px-3">Events</th>
                <th className="py-2.5 px-3">Processing Time</th>
                <th className="py-2.5 px-3">Throughput (eps)</th>
                <th className="py-2.5 px-3">Average Latency</th>
                <th className="py-2.5 px-3">Mode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {benchmarkHistory.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="py-2.5 px-3 font-semibold text-gray-900">
                    {row.workerCount} {row.workerCount === 1 ? "worker" : "workers"}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-gray-800">
                    {row.numEvents}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-gray-800">
                    {row.totalTimeSeconds} s
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                    {row.throughputEps} eps
                  </td>
                  <td className="py-2.5 px-3 font-mono text-gray-800">
                    {row.avgLatencyMs} ms
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
                        row.mode === "Autoscaled"
                          ? "bg-sky-100 text-sky-800"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {row.mode}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Student Explanation Note */}
      <div className="p-4 bg-white rounded-lg border border-gray-200 text-xs text-gray-600 space-y-1.5">
        <div className="font-semibold text-gray-900">
          What the Benchmark Results Show:
        </div>
        <p>
          1. <strong>Scalability:</strong> Increasing workers from 1 to 4 increases throughput from ~341 events/sec to ~618 events/sec (+81% speedup) because partitions are processed in parallel.
        </p>
        <p>
          2. <strong>Amdahl&apos;s Law:</strong> Scaling is not completely 4x because there is minor overhead in broker coordination and database writing.
        </p>
      </div>
    </div>
  );
};
