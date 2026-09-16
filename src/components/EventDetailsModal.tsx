import React from "react";
import { EventItem, EventStatus } from "../types/distributedSystem";

interface EventDetailsModalProps {
  event: EventItem | null;
  onClose: () => void;
}

export const EventDetailsModal: React.FC<EventDetailsModalProps> = ({
  event,
  onClose,
}) => {
  if (!event) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-lg border border-gray-300 max-w-lg w-full shadow-lg overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
          <div>
            <div className="text-[11px] text-gray-500 uppercase font-semibold">
              Event Details
            </div>
            <div className="font-mono font-bold text-gray-900 text-xs">
              {event.eventId}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-base font-bold leading-none"
          >
            &times;
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
          {/* Status & Priority */}
          <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded">
            <div>
              <span className="text-gray-500 mr-2">Status:</span>
              <span
                className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                  event.status === EventStatus.COMPLETED
                    ? "bg-green-100 text-green-800"
                    : event.status === EventStatus.DEAD_LETTER
                    ? "bg-red-100 text-red-800"
                    : event.status === EventStatus.RETRYING
                    ? "bg-amber-100 text-amber-800"
                    : "bg-blue-100 text-blue-800"
                }`}
              >
                {event.status}
              </span>
            </div>
            <div>
              <span className="text-gray-500 mr-1">Priority:</span>
              <span className="font-bold text-gray-800">P{event.priority}</span>
            </div>
          </div>

          {/* Core Info Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded border border-gray-200 bg-white">
              <span className="text-[10px] text-gray-500 uppercase block">
                Partition &amp; Offset
              </span>
              <span className="font-bold text-gray-900 mt-0.5 block">
                Partition {event.partitionId} (Offset #{event.offset})
              </span>
            </div>

            <div className="p-2.5 rounded border border-gray-200 bg-white">
              <span className="text-[10px] text-gray-500 uppercase block">
                Partition Key
              </span>
              <span className="font-mono font-bold text-gray-900 mt-0.5 block truncate">
                {event.partitionKey}
              </span>
            </div>

            <div className="p-2.5 rounded border border-gray-200 bg-white">
              <span className="text-[10px] text-gray-500 uppercase block">
                Assigned Worker
              </span>
              <span className="font-semibold text-gray-800 mt-0.5 block">
                {event.assignedWorkerId || "None / Completed"}
              </span>
            </div>

            <div className="p-2.5 rounded border border-gray-200 bg-white">
              <span className="text-[10px] text-gray-500 uppercase block">
                Retries
              </span>
              <span className="font-bold text-gray-900 mt-0.5 block">
                {event.retryCount} / {event.maxRetries}
              </span>
            </div>
          </div>

          {/* Failure reason if any */}
          {event.failureReason && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-800">
              <span className="font-semibold block text-[11px] mb-0.5">
                Failure Reason:
              </span>
              {event.failureReason}
            </div>
          )}

          {/* Result */}
          {event.result && (
            <div>
              <span className="font-semibold text-gray-700 block mb-1">
                Processed Result:
              </span>
              <pre className="p-3 bg-gray-900 text-green-400 rounded overflow-x-auto font-mono text-[11px]">
                {JSON.stringify(event.result, null, 2)}
              </pre>
            </div>
          )}

          {/* Payload */}
          <div>
            <span className="font-semibold text-gray-700 block mb-1">
              Event Payload:
            </span>
            <pre className="p-3 bg-gray-50 border border-gray-200 rounded overflow-x-auto font-mono text-[11px] text-gray-800">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>

          <div className="pt-2 text-right">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded bg-gray-900 hover:bg-gray-800 text-white font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
