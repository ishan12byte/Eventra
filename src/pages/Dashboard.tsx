import React from "react";
import {
  EventItem,
  WorkerInfo,
  SystemMetrics,
  AutoscaleAction,
} from "../types/distributedSystem";

interface DashboardProps {
  metrics: SystemMetrics;
  events: EventItem[];
  workers: WorkerInfo[];
  autoscaleLog: AutoscaleAction[];
  autoscalerEnabled: boolean;
  onToggleAutoscaler: () => void;
  onSelectEvent: (event: EventItem) => void;
  onNavigate: (page: "events" | "workers" | "partitions" | "failures" | "benchmarks") => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  metrics,
  events,
  workers,
  autoscaleLog,
  autoscalerEnabled,
  onToggleAutoscaler,
  onSelectEvent,
  onNavigate,
}) => {
  const recentEvents = [...events].reverse().slice(0, 8);
  const latestAutoscale = autoscaleLog[0];

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">
            Total Events
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {metrics.totalEvents}
          </div>
          <div className="text-xs text-gray-500 mt-1">Received by broker</div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">
            Processed Events
          </div>
          <div className="text-2xl font-bold text-blue-700 mt-1">
            {metrics.completedEvents}
          </div>
          <div className="text-xs text-gray-500 mt-1">ACKed &amp; stored</div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">
            Failed Events
          </div>
          <div className="text-2xl font-bold text-red-600 mt-1">
            {metrics.failedEvents + metrics.dlqCount}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {metrics.dlqCount} in DLQ
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">
            Queue Size
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {metrics.queueSize}
          </div>
          <div className="text-xs text-gray-500 mt-1">Waiting in partitions</div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">
            Active Workers
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {metrics.activeWorkers} / {metrics.totalWorkers}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {metrics.workerUtilization}% avg load
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">
            Throughput
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {metrics.throughputEps}
          </div>
          <div className="text-xs text-gray-500 mt-1">Events / second</div>
        </div>
      </div>

      {/* Main Grid: Recent Events and Autoscaler */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Events Table (2 columns on large screens) */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Recent Events
              </h2>
              <p className="text-xs text-gray-500">
                Most recent events entering the broker
              </p>
            </div>
            <button
              onClick={() => onNavigate("events")}
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              View All Events &rarr;
            </button>
          </div>

          {recentEvents.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-400 border border-dashed border-gray-200 rounded">
              No events processed yet. Go to the Events page to create sample events.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 font-medium bg-gray-50">
                    <th className="py-2.5 px-3">Event ID</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Partition</th>
                    <th className="py-2.5 px-3">Worker</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentEvents.map((evt) => (
                    <tr
                      key={evt.eventId}
                      onClick={() => onSelectEvent(evt)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="py-2.5 px-3 font-mono text-gray-900">
                        {evt.eventId}
                      </td>
                      <td className="py-2.5 px-3 capitalize text-gray-700">
                        {evt.eventType}
                      </td>
                      <td className="py-2.5 px-3 text-gray-600">
                        Partition {evt.partitionId}
                      </td>
                      <td className="py-2.5 px-3 text-gray-600">
                        {evt.assignedWorkerId || "—"}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                            evt.status === "COMPLETED"
                              ? "bg-green-100 text-green-800"
                              : evt.status === "PROCESSING"
                              ? "bg-blue-100 text-blue-800"
                              : evt.status === "RETRYING"
                              ? "bg-amber-100 text-amber-800"
                              : evt.status === "DEAD_LETTER"
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {evt.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Autoscaling Summary Card */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Autoscaling
              </h2>
              <p className="text-xs text-gray-500">Rule-based queue monitoring</p>
            </div>
            <button
              onClick={onToggleAutoscaler}
              className={`text-xs font-medium px-2.5 py-1 rounded border transition-colors ${
                autoscalerEnabled
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-gray-100 text-gray-600 border-gray-300"
              }`}
            >
              {autoscalerEnabled ? "Enabled" : "Disabled"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-gray-50 rounded border border-gray-200">
              <span className="text-gray-500 block">Current Workers</span>
              <span className="text-lg font-bold text-gray-900">
                {workers.length}
              </span>
            </div>
            <div className="p-3 bg-gray-50 rounded border border-gray-200">
              <span className="text-gray-500 block">Queue Size</span>
              <span className="text-lg font-bold text-gray-900">
                {metrics.queueSize}
              </span>
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded border border-gray-200 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Threshold:</span>
              <span className="font-medium text-gray-800">&gt; 6 Scale Up, &le; 1 Scale Down</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Last Decision:</span>
              <span className="font-bold text-blue-700">
                {latestAutoscale ? latestAutoscale.action : "IDLE"}
              </span>
            </div>
            <div className="text-gray-600 text-[11px] pt-1 border-t border-gray-200">
              {latestAutoscale
                ? latestAutoscale.reason
                : "Queue within healthy bounds."}
            </div>
          </div>

          {/* Scaling History Mini-Table */}
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-2">
              Recent Scaling Events
            </div>
            {autoscaleLog.length === 0 ? (
              <div className="text-xs text-gray-400 py-3 text-center">
                No scaling events triggered yet
              </div>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 text-xs">
                {autoscaleLog.slice(0, 4).map((log, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-gray-50 border border-gray-100 rounded text-[11px] flex justify-between items-center"
                  >
                    <div>
                      <span className="font-semibold text-gray-800">
                        {log.action}
                      </span>
                      <span className="text-gray-500 ml-1">
                        ({log.fromCount} &rarr; {log.toCount} workers)
                      </span>
                    </div>
                    <span className="text-gray-400 text-[10px]">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
