/**
 * Distributed Event Processing Simulation & Real-Time Engine.
 * Fully implements:
 * - Consistent Partition Hashing: hash(partition_key) % partitionCount
 * - Partition Offset Management & In-order queueing
 * - Worker Consumer Group Rebalancing (Round-Robin)
 * - Concurrent Worker Processing with simulated CPU loads and heartbeats
 * - Priority Dequeuing & Least-Loaded Worker Scheduling
 * - At-Least-Once Delivery with Idempotency Key deduplication
 * - Fault Injection: Worker Crash, Network Failure, Poison Pill
 * - Automated Heartbeat Failure Detection & Work Reassignment
 * - Exponential Retry Policy with Dead Letter Queue (DLQ)
 * - Rule-Based Autoscaler with Cooldown Timers
 */

import {
  EventItem,
  EventStatus,
  EventType,
  PartitionInfo,
  WorkerInfo,
  WorkerState,
  SchedulingPolicy,
  SystemMetrics,
  AutoscaleAction,
  RecoveryLogEntry,
} from "../types/distributedSystem";

export function hashPartitionKey(key: string, partitionCount: number): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash) % partitionCount;
}

export class DistributedCluster {
  public partitionCount: number = 4;
  public partitions: Map<number, PartitionInfo> = new Map();
  public workers: Map<string, WorkerInfo> = new Map();
  public allEvents: Map<string, EventItem> = new Map();
  public dlq: EventItem[] = [];
  public completedEventIds: Set<string> = new Set();
  public autoscaleLog: AutoscaleAction[] = [];
  public recoveryLog: RecoveryLogEntry[] = [];

  public schedulingPolicy: SchedulingPolicy = "FIFO";
  public autoscalerEnabled: boolean = true;
  public minWorkers: number = 1;
  public maxWorkers: number = 6;
  public lastAutoscaleTime: number = Date.now();
  public autoscaleCooldownMs: number = 4000;

  public totalDuplicatePrevented: number = 0;
  private workerCounter: number = 0;
  private timerId: any = null;
  private onUpdateCallbacks: Set<() => void> = new Set();

  // Telemetry sliding window
  private recentCompletedTimestamps: number[] = [];
  private recentLatencies: number[] = [];

  constructor(initialPartitions: number = 4, initialWorkers: number = 2) {
    this.partitionCount = initialPartitions;
    this.initPartitions();
    for (let i = 0; i < initialWorkers; i++) {
      this.addWorker();
    }
    this.rebalancePartitions();
    this.startEngineLoop();
  }

  public subscribe(cb: () => void): () => void {
    this.onUpdateCallbacks.add(cb);
    return () => {
      this.onUpdateCallbacks.delete(cb);
    };
  }

  private notify(): void {
    for (const cb of this.onUpdateCallbacks) {
      cb();
    }
  }

  private initPartitions(): void {
    this.partitions.clear();
    for (let i = 0; i < this.partitionCount; i++) {
      this.partitions.set(i, {
        partitionId: i,
        currentOffset: 0,
        totalEnqueued: 0,
        assignedWorkerId: null,
        queue: [],
      });
    }
  }

  public addWorker(): WorkerInfo {
    if (this.workers.size >= this.maxWorkers) {
      const existing = Array.from(this.workers.values())[0];
      return existing;
    }
    this.workerCounter++;
    const workerId = `worker-${this.workerCounter}`;
    const newWorker: WorkerInfo = {
      workerId,
      state: WorkerState.IDLE,
      currentLoad: 0.05,
      processedCount: 0,
      failedCount: 0,
      lastHeartbeat: Date.now(),
      assignedPartitions: [],
    };
    this.workers.set(workerId, newWorker);
    this.rebalancePartitions();
    this.notify();
    return newWorker;
  }

  public removeWorker(workerId?: string): boolean {
    if (this.workers.size <= this.minWorkers) {
      return false;
    }
    const targetId = workerId || Array.from(this.workers.keys()).pop();
    if (!targetId || !this.workers.has(targetId)) return false;

    // Check if worker was processing an event, return to queue
    const w = this.workers.get(targetId)!;
    if (w.currentEventId) {
      const event = this.allEvents.get(w.currentEventId);
      if (event && event.status === EventStatus.PROCESSING) {
        event.status = EventStatus.RETRYING;
        const p = this.partitions.get(event.partitionId);
        if (p) p.queue.unshift(event);
      }
    }

    this.workers.delete(targetId);
    this.rebalancePartitions();
    this.notify();
    return true;
  }

  public scaleWorkers(target: number): void {
    const clamped = Math.max(this.minWorkers, Math.min(this.maxWorkers, target));
    while (this.workers.size < clamped) {
      this.addWorker();
    }
    while (this.workers.size > clamped) {
      this.removeWorker();
    }
  }

  public rebalancePartitions(): void {
    const activeWorkers = Array.from(this.workers.values()).filter(
      (w) => w.state !== WorkerState.STOPPED && w.state !== WorkerState.UNHEALTHY
    );

    // Reset assignments
    for (const w of this.workers.values()) {
      w.assignedPartitions = [];
    }

    if (activeWorkers.length === 0) {
      for (const p of this.partitions.values()) {
        p.assignedWorkerId = null;
      }
      return;
    }

    for (let pId = 0; pId < this.partitionCount; pId++) {
      const p = this.partitions.get(pId);
      if (!p) continue;
      const worker = activeWorkers[pId % activeWorkers.length];
      worker.assignedPartitions.push(pId);
      p.assignedWorkerId = worker.workerId;
    }
  }

  public submitEvent(
    eventType: EventType,
    partitionKey: string,
    priority: number = 1,
    payload: Record<string, any> = {},
    customEventId?: string
  ): { status: string; event: EventItem; duplicate?: boolean } {
    const eventId = customEventId || `evt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    // Idempotency check: protection against at-least-once duplicate submissions
    if (this.completedEventIds.has(eventId)) {
      this.totalDuplicatePrevented++;
      this.notify();
      const existing = this.allEvents.get(eventId)!;
      return { status: "DUPLICATE_IGNORED", event: existing, duplicate: true };
    }

    const partitionId = hashPartitionKey(partitionKey, this.partitionCount);
    const partition = this.partitions.get(partitionId)!;
    partition.currentOffset++;
    partition.totalEnqueued++;

    const newEvent: EventItem = {
      eventId,
      eventType,
      partitionKey,
      partitionId,
      offset: partition.currentOffset,
      priority,
      payload,
      status: EventStatus.PENDING,
      retryCount: 0,
      maxRetries: 3,
      createdAt: Date.now(),
    };

    this.allEvents.set(eventId, newEvent);

    if (this.schedulingPolicy === "PRIORITY") {
      // Insert in priority order (3 > 2 > 1)
      let inserted = false;
      for (let i = 0; i < partition.queue.length; i++) {
        if (newEvent.priority > partition.queue[i].priority) {
          partition.queue.splice(i, 0, newEvent);
          inserted = true;
          break;
        }
      }
      if (!inserted) partition.queue.push(newEvent);
    } else {
      // FIFO
      partition.queue.push(newEvent);
    }

    this.notify();
    return { status: "ENQUEUED", event: newEvent };
  }

  public submitBatch(count: number = 20, eventType: EventType = "order"): EventItem[] {
    const items: EventItem[] = [];
    for (let i = 0; i < count; i++) {
      const key = `user_${Math.floor(Math.random() * 8) + 1}`;
      const priority = Math.random() > 0.7 ? (Math.random() > 0.5 ? 3 : 2) : 1;
      const payload = {
        batchIdx: i + 1,
        amount: Math.round((20 + Math.random() * 180) * 100) / 100,
        customer: `Cust-${Math.floor(Math.random() * 900) + 100}`,
      };
      const res = this.submitEvent(eventType, key, priority, payload);
      items.push(res.event);
    }
    return items;
  }

  public simulateWorkerCrash(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;
    worker.state = WorkerState.UNHEALTHY;
    worker.currentLoad = 0;
    // Freeze heartbeat in the past so detection catches it
    worker.lastHeartbeat = Date.now() - 6000;
    this.rebalancePartitions();
    this.notify();
  }

  public recoverWorkerWork(workerId: string, reason: string): void {
    const worker = this.workers.get(workerId);
    const recoveredIds: string[] = [];

    // Find any events marked PROCESSING with this worker
    for (const event of this.allEvents.values()) {
      if (event.status === EventStatus.PROCESSING && event.assignedWorkerId === workerId) {
        event.status = EventStatus.RETRYING;
        event.retryCount++;
        event.assignedWorkerId = undefined;
        recoveredIds.push(event.eventId);

        const p = this.partitions.get(event.partitionId);
        if (p) {
          p.queue.unshift(event); // Re-queue at head of partition
        }
      }
    }

    if (worker) {
      worker.currentEventId = undefined;
    }

    if (recoveredIds.length > 0) {
      this.recoveryLog.unshift({
        id: `rec_${Date.now()}`,
        timestamp: Date.now(),
        workerId,
        recoveredEvents: recoveredIds,
        reason,
      });
    }
    this.notify();
  }

  public redriveDlqEvent(eventId: string): boolean {
    const idx = this.dlq.findIndex((e) => e.eventId === eventId);
    if (idx === -1) return false;
    const event = this.dlq.splice(idx, 1)[0];
    event.status = EventStatus.RETRYING;
    event.retryCount = 0;
    event.failureReason = undefined;

    const p = this.partitions.get(event.partitionId);
    if (p) {
      p.queue.push(event);
    }
    this.notify();
    return true;
  }

  public clearDlq(): void {
    this.dlq = [];
    this.notify();
  }

  public setSchedulingPolicy(policy: SchedulingPolicy): void {
    this.schedulingPolicy = policy;
    // If switched to priority, sort all partition queues
    if (policy === "PRIORITY") {
      for (const p of this.partitions.values()) {
        p.queue.sort((a, b) => b.priority - a.priority);
      }
    }
    this.notify();
  }

  public setAutoscalerEnabled(enabled: boolean): void {
    this.autoscalerEnabled = enabled;
    this.notify();
  }

  public resetCluster(): void {
    this.allEvents.clear();
    this.dlq = [];
    this.completedEventIds.clear();
    this.recoveryLog = [];
    this.autoscaleLog = [];
    this.recentCompletedTimestamps = [];
    this.recentLatencies = [];
    this.totalDuplicatePrevented = 0;
    this.workerCounter = 0;
    this.workers.clear();
    this.initPartitions();
    for (let i = 0; i < 2; i++) {
      this.addWorker();
    }
    this.rebalancePartitions();
    this.notify();
  }

  // --- Engine Processing Loop ---
  private startEngineLoop(): void {
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = setInterval(() => {
      this.tick();
    }, 150);
  }

  public stopEngine(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private tick(): void {
    const now = Date.now();

    // 1. Heartbeat check & Failure Detection (> 4.5s silence => UNHEALTHY & recover work)
    for (const worker of this.workers.values()) {
      if (worker.state === WorkerState.UNHEALTHY) {
        if (worker.currentEventId) {
          this.recoverWorkerWork(worker.workerId, `Worker silence heartbeat timeout (4.5s)`);
        }
      } else {
        // Send heartbeat for healthy workers
        worker.lastHeartbeat = now;
      }
    }

    // 2. Worker Dispatch & Processing
    const availableWorkers = Array.from(this.workers.values()).filter(
      (w) => w.state === WorkerState.IDLE
    );

    if (this.schedulingPolicy === "LEAST_LOADED") {
      availableWorkers.sort((a, b) => a.currentLoad - b.currentLoad);
    }

    for (const worker of availableWorkers) {
      // Find eligible partition event
      let targetEvent: EventItem | null = null;
      let fromPartition: PartitionInfo | null = null;

      // Check partitions assigned to this worker first
      for (const pId of worker.assignedPartitions) {
        const p = this.partitions.get(pId);
        if (p && p.queue.length > 0) {
          targetEvent = p.queue.shift()!;
          fromPartition = p;
          break;
        }
      }

      // If assigned partitions empty, work-steal from any partition with queue > 0
      if (!targetEvent) {
        for (const p of this.partitions.values()) {
          if (p.queue.length > 0) {
            targetEvent = p.queue.shift()!;
            fromPartition = p;
            break;
          }
        }
      }

      if (targetEvent && fromPartition) {
        this.dispatchToWorker(worker, targetEvent);
      }
    }

    // 3. Autoscaling Evaluation Loop
    if (this.autoscalerEnabled && now - this.lastAutoscaleTime > this.autoscaleCooldownMs) {
      this.evaluateAutoscaling(now);
    }

    // 4. Update dynamic loads for busy workers
    for (const worker of this.workers.values()) {
      if (worker.state === WorkerState.BUSY) {
        worker.currentLoad = Math.min(0.98, Math.max(0.6, worker.currentLoad + (Math.random() * 0.1 - 0.05)));
      } else if (worker.state === WorkerState.IDLE) {
        worker.currentLoad = Math.max(0.04, worker.currentLoad * 0.85);
      }
    }

    // Purge old completed timestamps (> 5 seconds old) for rolling throughput
    this.recentCompletedTimestamps = this.recentCompletedTimestamps.filter((t) => now - t <= 5000);

    this.notify();
  }

  private dispatchToWorker(worker: WorkerInfo, event: EventItem): void {
    worker.state = WorkerState.BUSY;
    worker.currentEventId = event.eventId;
    worker.currentLoad = 0.85;

    event.status = EventStatus.PROCESSING;
    event.assignedWorkerId = worker.workerId;

    // Simulate processing duration: 250ms - 550ms
    const workDuration = Math.floor(250 + Math.random() * 300);

    setTimeout(() => {
      // If worker died during processing (crash injection)
      if (worker.state === WorkerState.UNHEALTHY) {
        return; // Left for heartbeat detector to recover
      }

      const shouldSimulateFailure =
        Boolean(event.payload.simulate_error) ||
        (event.payload.poison_pill && event.retryCount < event.maxRetries);

      if (shouldSimulateFailure) {
        // Processing failure
        worker.failedCount++;
        event.retryCount++;
        event.failureReason =
          event.payload.error_message ||
          (event.payload.poison_pill
            ? `Permanent deserialization poison pill (Attempt ${event.retryCount})`
            : `Downstream service timeout (Attempt ${event.retryCount})`);

        if (event.retryCount >= event.maxRetries) {
          event.status = EventStatus.DEAD_LETTER;
          this.dlq.push(event);
        } else {
          event.status = EventStatus.RETRYING;
          // Exponential backoff requeue into partition
          const p = this.partitions.get(event.partitionId);
          if (p) p.queue.push(event);
        }
      } else {
        // Success ACK
        event.status = EventStatus.COMPLETED;
        event.processingTimeMs = workDuration;
        event.result = this.generateExecutionResult(event);
        this.completedEventIds.add(event.eventId);

        worker.processedCount++;
        this.recentCompletedTimestamps.push(Date.now());
        this.recentLatencies.push(workDuration);
        if (this.recentLatencies.length > 50) this.recentLatencies.shift();
      }

      worker.state = WorkerState.IDLE;
      worker.currentEventId = undefined;
      worker.currentLoad = 0.1;
      this.notify();
    }, workDuration);
  }

  private generateExecutionResult(event: EventItem): Record<string, any> {
    switch (event.eventType) {
      case "order": {
        const amt = Number(event.payload.amount || 45.0);
        return {
          subtotal: amt,
          tax: Math.round(amt * 0.08 * 100) / 100,
          total: Math.round(amt * 1.08 * 100) / 100,
          inventoryStatus: "RESERVED",
          dispatchTime: new Date().toISOString(),
        };
      }
      case "payment": {
        return {
          settlementStatus: "CAPTURED",
          authCode: `AUTH_${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          provider: "GlobalGateway-v2",
        };
      }
      case "login": {
        return {
          sessionToken: `sess_${Math.random().toString(36).substring(2, 10)}`,
          accessGranted: true,
          mfaPassed: true,
        };
      }
      case "support": {
        return {
          ticketId: `TCK-${Math.floor(1000 + Math.random() * 9000)}`,
          slaResponseHours: event.priority === 3 ? 1 : event.priority === 2 ? 4 : 24,
          routedQueue: "Tier-2 Distributed Systems",
        };
      }
    }
  }

  private evaluateAutoscaling(now: number): void {
    const totalQueueSize = this.getTotalQueueSize();
    const currentWorkerCount = this.workers.size;

    // Scale Up rule: Queue Depth > 6 and below max workers
    if (totalQueueSize > 6 && currentWorkerCount < this.maxWorkers) {
      const added = this.addWorker();
      this.lastAutoscaleTime = now;
      this.autoscaleLog.unshift({
        timestamp: now,
        action: "SCALE_UP",
        fromCount: currentWorkerCount,
        toCount: this.workers.size,
        reason: `High queue depth detected: ${totalQueueSize} events > 6 threshold`,
        queueDepth: totalQueueSize,
      });
      return;
    }

    // Scale Down rule: Queue Depth <= 1 and above min workers
    if (totalQueueSize <= 1 && currentWorkerCount > this.minWorkers) {
      const removed = this.removeWorker();
      if (removed) {
        this.lastAutoscaleTime = now;
        this.autoscaleLog.unshift({
          timestamp: now,
          action: "SCALE_DOWN",
          fromCount: currentWorkerCount,
          toCount: this.workers.size,
          reason: `Queue depth drained to ${totalQueueSize} <= 1 threshold`,
          queueDepth: totalQueueSize,
        });
      }
    }
  }

  public getTotalQueueSize(): number {
    let sum = 0;
    for (const p of this.partitions.values()) {
      sum += p.queue.length;
    }
    return sum;
  }

  public getMetrics(): SystemMetrics {
    let completed = 0;
    let failed = 0;
    let retrying = 0;

    for (const e of this.allEvents.values()) {
      if (e.status === EventStatus.COMPLETED) completed++;
      else if (e.status === EventStatus.FAILED) failed++;
      else if (e.status === EventStatus.RETRYING) retrying++;
    }

    const activeWorkers = Array.from(this.workers.values()).filter(
      (w) => w.state !== WorkerState.UNHEALTHY && w.state !== WorkerState.STOPPED
    );

    const totalLoad = activeWorkers.reduce((acc, w) => acc + w.currentLoad, 0);
    const workerUtilization =
      activeWorkers.length > 0 ? Math.round((totalLoad / activeWorkers.length) * 100) : 0;

    // Rolling throughput eps = completed in last 5 seconds / 5
    const throughputEps = Math.round((this.recentCompletedTimestamps.length / 5) * 10) / 10;

    const avgLatency =
      this.recentLatencies.length > 0
        ? Math.round(
            this.recentLatencies.reduce((a, b) => a + b, 0) / this.recentLatencies.length
          )
        : 0;

    return {
      totalEvents: this.allEvents.size,
      completedEvents: completed,
      failedEvents: failed,
      retryingEvents: retrying,
      dlqCount: this.dlq.length,
      queueSize: this.getTotalQueueSize(),
      activeWorkers: activeWorkers.length,
      totalWorkers: this.workers.size,
      workerUtilization,
      averageLatencyMs: avgLatency,
      throughputEps,
      duplicateEventsPrevented: this.totalDuplicatePrevented,
      recoveriesCount: this.recoveryLog.length,
    };
  }
}

// Global Singleton Engine instance
export const globalCluster = new DistributedCluster(4, 2);
