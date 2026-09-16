import React, { useState } from "react";
import { EventItem, EventType } from "../types/distributedSystem";

interface EventsPageProps {
  events: EventItem[];
  onOpenProducer: () => void;
  onAddBatch: (count: number) => void;
  onSelectEvent: (event: EventItem) => void;
}

export const EventsPage: React.FC<EventsPageProps> = ({
  events,
  onOpenProducer,
  onAddBatch,
  onSelectEvent,
}) => {
  const [filterType, setFilterType] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const filtered = events.filter((e) => {
    if (filterType !== "ALL" && e.eventType !== filterType) return false;
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      return (
        e.eventId.toLowerCase().includes(q) ||
        e.partitionKey.toLowerCase().includes(q) ||
        (e.assignedWorkerId && e.assignedWorkerId.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Top Action Bar */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Event Management
          </h2>
          <p className="text-xs text-gray-500">
            Inspect all events ingested into the distributed broker
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenProducer}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
          >
            + Create Event
          </button>
          <button
            onClick={() => onAddBatch(10)}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 rounded text-xs font-medium transition-colors"
          >
            + Add 10 Events
          </button>
          <button
            onClick={() => onAddBatch(100)}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 rounded text-xs font-medium transition-colors"
          >
            + Add 100 Events
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-lg border border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-gray-500 font-medium">Filter Type:</span>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded px-2.5 py-1 text-gray-800"
          >
            <option value="ALL">All Event Types</option>
            <option value="order">Order</option>
            <option value="payment">Payment</option>
            <option value="login">Login</option>
            <option value="support">Support</option>
          </select>
        </div>

        <div className="w-full sm:w-64">
          <input
            type="text"
            placeholder="Search by ID or partition key..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded px-3 py-1.5 text-xs text-gray-800 focus:outline-hidden focus:border-blue-500"
          />
        </div>
      </div>

      {/* Events Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-xs text-gray-400">
            No events found. Click &quot;Create Event&quot; or &quot;Add 10 Events&quot; to enqueue events.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold">
                  <th className="py-2.5 px-3">Event ID</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Partition Key</th>
                  <th className="py-2.5 px-3">Partition</th>
                  <th className="py-2.5 px-3">Worker</th>
                  <th className="py-2.5 px-3">Priority</th>
                  <th className="py-2.5 px-3">Retries</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((evt) => (
                  <tr
                    key={evt.eventId}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-2.5 px-3 font-mono font-medium text-gray-900">
                      {evt.eventId}
                    </td>
                    <td className="py-2.5 px-3 capitalize text-gray-700">
                      {evt.eventType}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-gray-600">
                      {evt.partitionKey}
                    </td>
                    <td className="py-2.5 px-3 text-gray-700">
                      Partition {evt.partitionId}
                    </td>
                    <td className="py-2.5 px-3 text-gray-700">
                      {evt.assignedWorkerId || "Unassigned"}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          evt.priority === 3
                            ? "bg-red-100 text-red-800"
                            : evt.priority === 2
                            ? "bg-amber-100 text-amber-800"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        P{evt.priority}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-gray-700">
                      {evt.retryCount} / {evt.maxRetries}
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
                    <td className="py-2.5 px-3">
                      <button
                        onClick={() => onSelectEvent(evt)}
                        className="text-blue-600 hover:text-blue-800 font-medium underline"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
