import React from "react";
import { PartitionInfo, EventItem } from "../types/distributedSystem";

interface PartitionsPageProps {
  partitions: PartitionInfo[];
  onSelectEvent: (event: EventItem) => void;
}

export const PartitionsPage: React.FC<PartitionsPageProps> = ({
  partitions,
  onSelectEvent,
}) => {
  const totalEventsEnqueued = partitions.reduce((sum, p) => sum + p.totalEnqueued, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Partition Management &amp; Distribution
          </h2>
          <p className="text-xs text-gray-500">
            Events are mapped to partitions using consistent hashing: <code>hash(partition_key) % 4</code>
          </p>
        </div>
        <div className="text-xs text-gray-600 bg-gray-50 px-3 py-1.5 rounded border border-gray-200">
          Total Partitions: <strong>4</strong> | Total Enqueued: <strong>{totalEventsEnqueued}</strong>
        </div>
      </div>

      {/* Visual Distribution Bar Chart */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-2">
        <div className="text-xs font-semibold text-gray-800">
          Event Distribution Across Partitions
        </div>
        <div className="space-y-2 text-xs">
          {partitions.map((p) => {
            const percentage =
              totalEventsEnqueued > 0
                ? Math.round((p.totalEnqueued / totalEventsEnqueued) * 100)
                : 25;

            return (
              <div key={p.partitionId} className="flex items-center gap-3">
                <span className="w-20 font-medium text-gray-700 text-right">
                  Partition {p.partitionId}
                </span>
                <div className="flex-1 bg-gray-100 h-4 rounded overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded transition-all duration-300"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="w-24 text-gray-500 text-[11px]">
                  {p.totalEnqueued} events ({percentage}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4 Partition Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {partitions.map((partition) => {
          return (
            <div
              key={partition.partitionId}
              className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                  <span className="font-bold text-sm text-gray-900">
                    Partition {partition.partitionId}
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                    Offset #{partition.currentOffset}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 my-3 text-xs">
                  <div className="p-2 bg-gray-50 rounded border border-gray-100">
                    <span className="text-gray-500 block text-[10px] uppercase">
                      Queue Size
                    </span>
                    <span className="text-lg font-bold text-gray-900">
                      {partition.queue.length}
                    </span>
                  </div>
                  <div className="p-2 bg-gray-50 rounded border border-gray-100">
                    <span className="text-gray-500 block text-[10px] uppercase">
                      Total Received
                    </span>
                    <span className="text-lg font-bold text-gray-900">
                      {partition.totalEnqueued}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-gray-600 mb-3">
                  <span className="text-gray-500">Assigned Worker:</span>{" "}
                  <strong>{partition.assignedWorkerId || "None (idle)"}</strong>
                </div>

                {/* Queue Preview */}
                <div className="space-y-1">
                  <div className="text-[11px] font-medium text-gray-500 mb-1">
                    Waiting in Queue ({partition.queue.length}):
                  </div>

                  {partition.queue.length === 0 ? (
                    <div className="py-6 text-center text-xs text-gray-400 border border-dashed border-gray-200 rounded">
                      Queue is empty
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                      {partition.queue.map((event) => (
                        <div
                          key={event.eventId}
                          onClick={() => onSelectEvent(event)}
                          className="p-1.5 bg-gray-50 border border-gray-200 rounded hover:border-blue-300 cursor-pointer text-xs flex justify-between items-center"
                        >
                          <span className="font-mono text-[11px] truncate max-w-[110px] text-gray-800">
                            {event.eventId}
                          </span>
                          <span className="text-[10px] text-gray-500">
                            Key: {event.partitionKey}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Student Explanation Note */}
      <div className="p-4 bg-white rounded-lg border border-gray-200 text-xs text-gray-600 space-y-1.5">
        <div className="font-semibold text-gray-900">
          Why We Use Partitions:
        </div>
        <p>
          Instead of using one big queue where only one thread can pop events at a time, we split incoming traffic into multiple independent queues called partitions.
        </p>
        <p>
          Events with the same partition key (e.g. <code>customer_123</code>) always hash to the same partition, guaranteeing that their order is preserved, while events with different keys can be processed concurrently by separate workers.
        </p>
      </div>
    </div>
  );
};
