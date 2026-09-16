import React, { useState } from "react";
import { EventItem, EventStatus } from "../types/distributedSystem";

interface FailuresPageProps {
  events: EventItem[];
  dlq: EventItem[];
  onRedriveDlq: (eventId: string) => void;
  onClearDlq: () => void;
  onInjectSimulatedError: () => void;
  onInjectPoisonPill: () => void;
  onTestIdempotency: () => void;
  onSelectEvent: (event: EventItem) => void;
}

export const FailuresPage: React.FC<FailuresPageProps> = ({
  events,
  dlq,
  onRedriveDlq,
  onClearDlq,
  onInjectSimulatedError,
  onInjectPoisonPill,
  onTestIdempotency,
  onSelectEvent,
}) => {
  const [demoNotice, setDemoNotice] = useState<string | null>(null);

  // Failed or currently retrying events
  const retryingOrFailedEvents = events.filter(
    (e) =>
      e.status === EventStatus.RETRYING ||
      e.status === EventStatus.FAILED ||
      e.retryCount > 0
  );

  const handleIdempotencyTest = () => {
    onTestIdempotency();
    setDemoNotice(
      "Dispatched event 'order_tx_idempotent_demo'. Second publish detected duplicate in completed Set and was ignored with 0 duplicate executions!"
    );
    setTimeout(() => setDemoNotice(null), 5000);
  };

  return (
    <div className="space-y-5">
      {/* Top Action Bar */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Fault Tolerance, Retries &amp; Dead Letter Queue
          </h2>
          <p className="text-xs text-gray-500">
            Demonstrating retries with backoff, poison pill isolation, and duplicate protection
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onInjectSimulatedError}
            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded text-xs font-medium transition-colors"
          >
            Simulate Transient Error
          </button>
          <button
            onClick={onInjectPoisonPill}
            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-800 border border-red-300 rounded text-xs font-medium transition-colors"
          >
            Send Poison Pill (DLQ)
          </button>
          <button
            onClick={handleIdempotencyTest}
            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 rounded text-xs font-medium transition-colors"
          >
            Test Duplicate Guard
          </button>
        </div>
      </div>

      {demoNotice && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900">
          {demoNotice}
        </div>
      )}

      {/* Top 3 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">
            Events with Retries
          </div>
          <div className="text-2xl font-bold text-amber-600 mt-1">
            {retryingOrFailedEvents.length}
          </div>
          <div className="text-xs text-gray-500 mt-1">Encountered errors</div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">
            Retries in Progress
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {events.filter((e) => e.status === EventStatus.RETRYING).length}
          </div>
          <div className="text-xs text-gray-500 mt-1">Currently in backoff</div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">
            Dead Letter Queue (DLQ)
          </div>
          <div className="text-2xl font-bold text-red-600 mt-1">
            {dlq.length}
          </div>
          <div className="text-xs text-gray-500 mt-1">&gt; 3 retries exceeded</div>
        </div>
      </div>

      {/* Table 1: Failed / Retrying Events */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Failed &amp; Retrying Events
            </h3>
            <p className="text-xs text-gray-500">
              Events undergoing retry backoff after processing failures
            </p>
          </div>
          <span className="text-xs text-gray-500">
            Count: <strong>{retryingOrFailedEvents.length}</strong>
          </span>
        </div>

        {retryingOrFailedEvents.length === 0 ? (
          <div className="py-10 text-center text-xs text-gray-400">
            No failed or retrying events. Click &quot;Simulate Transient Error&quot; above to see retries in action.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-200 text-gray-500 font-medium">
                  <th className="py-2.5 px-3">Event ID</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Retry Count</th>
                  <th className="py-2.5 px-3">Failure Reason</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {retryingOrFailedEvents.map((evt) => (
                  <tr key={evt.eventId} className="hover:bg-gray-50">
                    <td className="py-2.5 px-3 font-mono font-medium text-gray-900">
                      {evt.eventId}
                    </td>
                    <td className="py-2.5 px-3 capitalize text-gray-700">
                      {evt.eventType}
                    </td>
                    <td className="py-2.5 px-3 text-gray-700">
                      {evt.retryCount} / {evt.maxRetries}
                    </td>
                    <td className="py-2.5 px-3 text-gray-600 max-w-xs truncate">
                      {evt.failureReason || "Downstream processing error"}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                          evt.status === EventStatus.RETRYING
                            ? "bg-amber-100 text-amber-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {evt.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <button
                        onClick={() => onSelectEvent(evt)}
                        className="text-blue-600 hover:text-blue-800 underline"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Table 2: Dead Letter Queue (DLQ) */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Dead Letter Queue (DLQ)
            </h3>
            <p className="text-xs text-gray-500">
              Permanently failed events quarantined after exhausting max retry attempts
            </p>
          </div>
          {dlq.length > 0 && (
            <button
              onClick={onClearDlq}
              className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 border border-red-200 rounded bg-red-50"
            >
              Clear DLQ
            </button>
          )}
        </div>

        {dlq.length === 0 ? (
          <div className="py-10 text-center text-xs text-gray-400">
            Dead Letter Queue is empty. Click &quot;Send Poison Pill (DLQ)&quot; above to simulate a poison message.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-200 text-gray-500 font-medium">
                  <th className="py-2.5 px-3">Event ID</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Retries</th>
                  <th className="py-2.5 px-3">Failure Reason</th>
                  <th className="py-2.5 px-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dlq.map((evt) => (
                  <tr key={evt.eventId} className="hover:bg-gray-50">
                    <td className="py-2.5 px-3 font-mono font-medium text-gray-900">
                      {evt.eventId}
                    </td>
                    <td className="py-2.5 px-3 capitalize text-gray-700">
                      {evt.eventType}
                    </td>
                    <td className="py-2.5 px-3 text-red-700 font-medium">
                      {evt.retryCount} (Exceeded max)
                    </td>
                    <td className="py-2.5 px-3 text-gray-600 max-w-sm">
                      {evt.failureReason || "Permanent failure"}
                    </td>
                    <td className="py-2.5 px-3 space-x-2">
                      <button
                        onClick={() => onSelectEvent(evt)}
                        className="text-gray-600 hover:text-gray-900 underline"
                      >
                        Inspect
                      </button>
                      <button
                        onClick={() => onRedriveDlq(evt.eventId)}
                        className="text-blue-600 hover:text-blue-800 font-medium underline"
                      >
                        Re-drive
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Student Explanation Note */}
      <div className="p-4 bg-white rounded-lg border border-gray-200 text-xs text-gray-600 space-y-1.5">
        <div className="font-semibold text-gray-900">
          How Retries and the Dead Letter Queue Work:
        </div>
        <p>
          1. When a worker fails to process an event (e.g. database lock or downstream timeout), it catches the exception and increments the event&apos;s <code>retry_count</code>.
        </p>
        <p>
          2. The event is given a short backoff delay and put back onto the queue.
        </p>
        <p>
          3. If the event fails more than 3 times (<code>max_retries</code>), it is classified as a <strong>poison pill</strong> and moved to the Dead Letter Queue so it does not block other valid events from being processed.
        </p>
      </div>
    </div>
  );
};
