import React, { useState } from "react";
import { EventType } from "../types/distributedSystem";

interface EventProducerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    eventType: EventType,
    partitionKey: string,
    priority: number,
    payload: Record<string, any>,
    customEventId?: string
  ) => void;
}

export const EventProducerModal: React.FC<EventProducerModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [eventType, setEventType] = useState<EventType>("order");
  const [partitionKey, setPartitionKey] = useState<string>("user_101");
  const [priority, setPriority] = useState<number>(1);
  const [customEventId, setCustomEventId] = useState<string>("");
  const [payloadText, setPayloadText] = useState<string>(
    JSON.stringify(
      {
        customer_id: "cust_482",
        amount: 89.99,
        items: ["Cloud Compute Pack", "SSD Volume"],
      },
      null,
      2
    )
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleEventTypeChange = (type: EventType) => {
    setEventType(type);
    if (type === "order") {
      setPayloadText(
        JSON.stringify(
          {
            customer_id: "cust_482",
            amount: 89.99,
            items: ["Laptop", "Mouse"],
          },
          null,
          2
        )
      );
    } else if (type === "payment") {
      setPayloadText(
        JSON.stringify(
          {
            amount: 145.0,
            currency: "USD",
            gateway: "Stripe",
          },
          null,
          2
        )
      );
    } else if (type === "login") {
      setPayloadText(
        JSON.stringify(
          {
            username: "alex_student",
            ip_address: "192.168.1.55",
            client: "Firefox Linux",
          },
          null,
          2
        )
      );
    } else if (type === "support") {
      setPayloadText(
        JSON.stringify(
          {
            subject: "Help with account",
            priority_code: "HIGH",
          },
          null,
          2
        )
      );
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsed = JSON.parse(payloadText);
      onSubmit(
        eventType,
        partitionKey.trim() || "default_key",
        priority,
        parsed,
        customEventId.trim() || undefined
      );
      onClose();
    } catch (err: any) {
      setErrorMsg("Invalid JSON format: " + err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-lg border border-gray-300 max-w-lg w-full shadow-lg overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="font-semibold text-gray-900 text-sm">
            Create / Produce Event
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-base font-bold leading-none"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700">
              {errorMsg}
            </div>
          )}

          {/* Event Type */}
          <div>
            <label className="font-medium text-gray-700 block mb-1.5">
              Event Type:
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(["order", "payment", "login", "support"] as EventType[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => handleEventTypeChange(t)}
                  className={`py-1.5 px-2 rounded font-medium capitalize border transition-colors ${
                    eventType === t
                      ? "bg-blue-50 text-blue-700 border-blue-300 font-bold"
                      : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Partition Key */}
          <div>
            <label className="font-medium text-gray-700 block mb-1">
              Partition Key:
            </label>
            <input
              type="text"
              value={partitionKey}
              onChange={(e) => setPartitionKey(e.target.value)}
              placeholder="e.g. user_101 or customer_123"
              className="w-full bg-white border border-gray-300 rounded p-2 text-gray-900 font-mono text-xs focus:border-blue-500 focus:outline-hidden"
              required
            />
            <span className="text-[11px] text-gray-500 mt-1 block">
              Events with the same partition key go to the same partition: <code>hash(key) % 4</code>
            </span>
          </div>

          {/* Priority */}
          <div>
            <label className="font-medium text-gray-700 block mb-1.5">
              Priority:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: 1, label: "P1: Normal" },
                { val: 2, label: "P2: High" },
                { val: 3, label: "P3: Critical" },
              ].map((p) => (
                <button
                  type="button"
                  key={p.val}
                  onClick={() => setPriority(p.val)}
                  className={`py-1.5 px-2 rounded font-medium border text-center transition-colors ${
                    priority === p.val
                      ? "bg-gray-900 text-white border-gray-900 font-bold"
                      : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Event ID (Optional) */}
          <div>
            <label className="font-medium text-gray-700 block mb-1">
              Custom Event ID (Optional - for duplicate test):
            </label>
            <input
              type="text"
              value={customEventId}
              onChange={(e) => setCustomEventId(e.target.value)}
              placeholder="Leave blank for auto-generated UUID"
              className="w-full bg-white border border-gray-300 rounded p-2 text-gray-900 font-mono text-xs focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          {/* Payload */}
          <div>
            <label className="font-medium text-gray-700 block mb-1">
              Payload (JSON):
            </label>
            <textarea
              rows={4}
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded p-2 text-gray-900 font-mono text-xs focus:border-blue-500 focus:outline-hidden"
              required
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              Publish Event
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
