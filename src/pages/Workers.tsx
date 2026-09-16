import React from "react";
import { WorkerInfo, WorkerState } from "../types/distributedSystem";

interface WorkersPageProps {
  workers: WorkerInfo[];
  onAddWorker: () => void;
  onRemoveWorker: () => void;
  onCrashWorker: (workerId: string) => void;
  minWorkers: number;
  maxWorkers: number;
}

export const WorkersPage: React.FC<WorkersPageProps> = ({
  workers,
  onAddWorker,
  onRemoveWorker,
  onCrashWorker,
  minWorkers,
  maxWorkers,
}) => {
  return (
    <div className="space-y-5">
      {/* Top Action Bar */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Worker Pool Management
          </h2>
          <p className="text-xs text-gray-500">
            Concurrent worker consumer processes processing events from partitions
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            Count: <strong>{workers.length}</strong> (Min: {minWorkers}, Max: {maxWorkers})
          </span>
          <button
            onClick={onRemoveWorker}
            disabled={workers.length <= minWorkers}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 rounded text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            - Remove Worker
          </button>
          <button
            onClick={onAddWorker}
            disabled={workers.length >= maxWorkers}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Add Worker
          </button>
        </div>
      </div>

      {/* Workers Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {workers.map((worker) => {
          const isUnhealthy = worker.state === WorkerState.UNHEALTHY;
          const isBusy = worker.state === WorkerState.BUSY;
          const isIdle = worker.state === WorkerState.IDLE;

          return (
            <div
              key={worker.workerId}
              className={`p-4 rounded-lg border flex flex-col justify-between transition-all ${
                isUnhealthy
                  ? "bg-red-50/70 border-red-300"
                  : isBusy
                  ? "bg-amber-50/50 border-amber-200"
                  : "bg-white border-gray-200"
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                  <span className="font-bold text-sm text-gray-900">
                    {worker.workerId}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      isUnhealthy
                        ? "bg-red-100 text-red-800"
                        : isBusy
                        ? "bg-amber-100 text-amber-800"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    {worker.state}
                  </span>
                </div>

                {/* Details */}
                <div className="space-y-2 my-3 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>Current Load:</span>
                    <span className="font-semibold text-gray-900">
                      {Math.round(worker.currentLoad * 100)}%
                    </span>
                  </div>

                  {/* Load Bar */}
                  <div className="w-full bg-gray-100 h-1.5 rounded overflow-hidden">
                    <div
                      className={`h-full rounded transition-all ${
                        isUnhealthy
                          ? "bg-red-500"
                          : worker.currentLoad > 0.6
                          ? "bg-amber-500"
                          : "bg-blue-600"
                      }`}
                      style={{ width: `${Math.round(worker.currentLoad * 100)}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-gray-600 pt-1">
                    <span>Processed (ACKed):</span>
                    <span className="font-semibold text-gray-900">
                      {worker.processedCount}
                    </span>
                  </div>

                  <div className="flex justify-between text-gray-600">
                    <span>Failed Events:</span>
                    <span className="font-semibold text-red-600">
                      {worker.failedCount}
                    </span>
                  </div>

                  <div className="flex justify-between text-gray-600">
                    <span>Assigned Partitions:</span>
                    <span className="font-medium text-gray-800">
                      {worker.assignedPartitions.length > 0
                        ? worker.assignedPartitions.map((p) => `P${p}`).join(", ")
                        : "Work Stealing"}
                    </span>
                  </div>

                  <div className="flex justify-between text-gray-500 text-[11px] pt-1 border-t border-gray-100">
                    <span>Heartbeat:</span>
                    <span className="text-green-700 font-medium">
                      {isUnhealthy ? "SILENT (>4.5s)" : "Active (1s ping)"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2">
                {isUnhealthy ? (
                  <div className="text-center py-1 text-xs text-red-700 font-medium bg-red-100 rounded">
                    Worker Dead &mdash; Work Recovered
                  </div>
                ) : (
                  <button
                    onClick={() => onCrashWorker(worker.workerId)}
                    className="w-full py-1.5 px-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded text-xs font-medium transition-colors"
                  >
                    Simulate Failure
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Student Explanation Note */}
      <div className="p-4 bg-white rounded-lg border border-gray-200 text-xs text-gray-600 space-y-1.5">
        <div className="font-semibold text-gray-900">
          How Worker Failure &amp; Heartbeat Detection Works:
        </div>
        <p>
          1. Healthy workers send a heartbeat every 1 second.
        </p>
        <p>
          2. Clicking &quot;Simulate Failure&quot; stops the heartbeat. If a worker is silent for more than 4.5 seconds, the system marks it <strong>UNHEALTHY</strong>.
        </p>
        <p>
          3. Any event that this worker had claimed but not yet ACKed is immediately rescued, marked <strong>RETRYING</strong>, and placed back onto the partition queue for a healthy worker to complete.
        </p>
      </div>
    </div>
  );
};
