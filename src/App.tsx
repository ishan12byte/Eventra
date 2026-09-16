import React, { useState, useEffect, useCallback } from "react";
import { Header, PageId } from "./components/Header";
import { Dashboard } from "./pages/Dashboard";
import { EventsPage } from "./pages/Events";
import { WorkersPage } from "./pages/Workers";
import { PartitionsPage } from "./pages/Partitions";
import { FailuresPage } from "./pages/Failures";
import { BenchmarksPage } from "./pages/Benchmarks";
import { EventProducerModal } from "./components/EventProducerModal";
import { EventDetailsModal } from "./components/EventDetailsModal";
import { globalCluster } from "./engine/distributedEngine";
import {
  EventItem,
  EventType,
  BenchmarkItem,
} from "./types/distributedSystem";

export default function App() {
  const [, setTick] = useState(0);

  // Subscribe to real-time distributed engine updates
  useEffect(() => {
    const unsubscribe = globalCluster.subscribe(() => {
      setTick((t) => t + 1);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // UI state: exactly the 6 student project pages
  const [activePage, setActivePage] = useState<PageId>("dashboard");
  const [isProducerOpen, setIsProducerOpen] = useState(false);
  const [inspectedEvent, setInspectedEvent] = useState<EventItem | null>(null);

  // Derived cluster state
  const partitions = Array.from(globalCluster.partitions.values());
  const workers = Array.from(globalCluster.workers.values());
  const allEvents = Array.from(globalCluster.allEvents.values());
  const metrics = globalCluster.getMetrics();
  const dlq = globalCluster.dlq;
  const autoscaleLog = globalCluster.autoscaleLog;

  // Handlers
  const handleToggleAutoscaler = useCallback(() => {
    globalCluster.setAutoscalerEnabled(!globalCluster.autoscalerEnabled);
  }, []);

  const handleAddBatch = useCallback((count: number) => {
    globalCluster.submitBatch(count, "order");
  }, []);

  const handleReset = useCallback(() => {
    globalCluster.resetCluster();
  }, []);

  const handleAddWorker = useCallback(() => {
    globalCluster.addWorker();
  }, []);

  const handleRemoveWorker = useCallback(() => {
    globalCluster.removeWorker();
  }, []);

  const handleCrashWorker = useCallback((workerId: string) => {
    globalCluster.simulateWorkerCrash(workerId);
  }, []);

  const handleRedriveDlq = useCallback((eventId: string) => {
    globalCluster.redriveDlqEvent(eventId);
  }, []);

  const handleClearDlq = useCallback(() => {
    globalCluster.clearDlq();
  }, []);

  const handleInjectPoisonPill = useCallback(() => {
    globalCluster.submitEvent(
      "order",
      "poison_user_key",
      3,
      {
        poison_pill: true,
        error_message: "Malformed protobuf serialization: invalid schema wire format",
        items: ["Unserializable Object Reference"],
      },
      `poison_${Date.now().toString(36)}`
    );
  }, []);

  const handleInjectSimulatedError = useCallback(() => {
    globalCluster.submitEvent(
      "payment",
      "gateway_key_retry",
      2,
      {
        simulate_error: true,
        error_message: "HTTP 503 Service Unavailable: Payment gateway timeout",
        amount: 250.0,
      }
    );
  }, []);

  const handleTestIdempotency = useCallback(() => {
    const fixedId = "order_tx_idempotent_demo";
    // First submission
    globalCluster.submitEvent(
      "order",
      "idempotent_user",
      2,
      { item: "Distributed Systems Textbook", price: 49.99 },
      fixedId
    );
    // Attempt duplicate publish after brief pause
    setTimeout(() => {
      globalCluster.submitEvent(
        "order",
        "idempotent_user",
        2,
        { item: "Distributed Systems Textbook", price: 49.99 },
        fixedId
      );
    }, 400);
  }, []);

  const handleRunLiveBenchmark = useCallback(
    (count: number, workerCount: number, onComplete: (res: BenchmarkItem) => void) => {
      // Ensure cluster is scaled to the benchmark worker count
      globalCluster.scaleWorkers(workerCount);

      const startTime = performance.now();
      globalCluster.submitBatch(count, "order");

      // Check when queue is drained or timeout
      const checkInterval = setInterval(() => {
        const currentQueue = globalCluster.getMetrics().queueSize;
        if (currentQueue === 0 || performance.now() - startTime > 3000) {
          clearInterval(checkInterval);
          const elapsedSec = Math.max(0.1, Number(((performance.now() - startTime) / 1000).toFixed(2)));
          const throughput = Number((count / elapsedSec).toFixed(1));
          const avgLatency = Number(((elapsedSec / count) * 1000).toFixed(1));

          const result: BenchmarkItem = {
            numEvents: count,
            workerCount: workerCount,
            peakWorkers: workerCount,
            totalTimeSeconds: elapsedSec,
            throughputEps: throughput,
            avgLatencyMs: avgLatency,
            mode: "Static",
          };
          onComplete(result);
        }
      }, 100);
    },
    []
  );

  const handleSubmitCustomEvent = useCallback(
    (
      eventType: EventType,
      partitionKey: string,
      priority: number,
      payload: Record<string, any>,
      customEventId?: string
    ) => {
      globalCluster.submitEvent(
        eventType,
        partitionKey,
        priority,
        payload,
        customEventId
      );
    },
    []
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col font-sans">
      {/* Header with 6 exact student project tabs */}
      <Header
        activePage={activePage}
        onSelectPage={setActivePage}
        onOpenProducer={() => setIsProducerOpen(true)}
        onReset={handleReset}
        activeWorkerCount={metrics.activeWorkers}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6">
        {/* Page 1: Dashboard */}
        {activePage === "dashboard" && (
          <Dashboard
            metrics={metrics}
            events={allEvents}
            workers={workers}
            autoscaleLog={autoscaleLog}
            autoscalerEnabled={globalCluster.autoscalerEnabled}
            onToggleAutoscaler={handleToggleAutoscaler}
            onSelectEvent={(e) => setInspectedEvent(e)}
            onNavigate={(page) => setActivePage(page)}
          />
        )}

        {/* Page 2: Events */}
        {activePage === "events" && (
          <EventsPage
            events={allEvents}
            onOpenProducer={() => setIsProducerOpen(true)}
            onAddBatch={handleAddBatch}
            onSelectEvent={(e) => setInspectedEvent(e)}
          />
        )}

        {/* Page 3: Workers */}
        {activePage === "workers" && (
          <WorkersPage
            workers={workers}
            onAddWorker={handleAddWorker}
            onRemoveWorker={handleRemoveWorker}
            onCrashWorker={handleCrashWorker}
            minWorkers={globalCluster.minWorkers}
            maxWorkers={globalCluster.maxWorkers}
          />
        )}

        {/* Page 4: Partitions */}
        {activePage === "partitions" && (
          <PartitionsPage
            partitions={partitions}
            onSelectEvent={(e) => setInspectedEvent(e)}
          />
        )}

        {/* Page 5: Failures (Combines Failures, Retries & DLQ) */}
        {activePage === "failures" && (
          <FailuresPage
            events={allEvents}
            dlq={dlq}
            onRedriveDlq={handleRedriveDlq}
            onClearDlq={handleClearDlq}
            onInjectSimulatedError={handleInjectSimulatedError}
            onInjectPoisonPill={handleInjectPoisonPill}
            onTestIdempotency={handleTestIdempotency}
            onSelectEvent={(e) => setInspectedEvent(e)}
          />
        )}

        {/* Page 6: Benchmarks */}
        {activePage === "benchmarks" && (
          <BenchmarksPage onRunLiveBenchmark={handleRunLiveBenchmark} />
        )}
      </main>

      {/* Clean Student Project Footer */}
      <footer className="border-t border-gray-200 bg-white py-4 mt-auto text-xs text-gray-500">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <span className="font-semibold text-gray-700">
              Distributed Event Processing System
            </span>{" "}
            &bull; B.Tech Software Engineering / Distributed Systems Project
          </div>
          <div className="flex items-center gap-4">
            <span>Partitions: 4</span>
            <span>Broker: Custom In-Memory</span>
            <span>Storage: SQLite</span>
            <span>API: FastAPI</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <EventProducerModal
        isOpen={isProducerOpen}
        onClose={() => setIsProducerOpen(false)}
        onSubmit={handleSubmitCustomEvent}
      />

      <EventDetailsModal
        event={inspectedEvent}
        onClose={() => setInspectedEvent(null)}
      />
    </div>
  );
}
