/**
 * TypeScript type definitions for Distributed Event Processing System.
 */

export enum EventStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  RETRYING = "RETRYING",
  DEAD_LETTER = "DEAD_LETTER",
}

export enum WorkerState {
  IDLE = "IDLE",
  BUSY = "BUSY",
  UNHEALTHY = "UNHEALTHY",
  STOPPED = "STOPPED",
}

export type EventType = "order" | "payment" | "login" | "support";

export type SchedulingPolicy = "FIFO" | "PRIORITY" | "LEAST_LOADED";

export interface EventItem {
  eventId: string;
  eventType: EventType;
  partitionKey: string;
  partitionId: number;
  offset: number;
  priority: number; // 1: Normal, 2: High, 3: Critical
  payload: Record<string, any>;
  status: EventStatus;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  assignedWorkerId?: string;
  processingTimeMs?: number;
  failureReason?: string;
  result?: Record<string, any>;
}

export interface PartitionInfo {
  partitionId: number;
  currentOffset: number;
  totalEnqueued: number;
  assignedWorkerId: string | null;
  queue: EventItem[];
}

export interface WorkerInfo {
  workerId: string;
  state: WorkerState;
  currentLoad: number; // 0.0 - 1.0
  processedCount: number;
  failedCount: number;
  lastHeartbeat: number;
  assignedPartitions: number[];
  currentEventId?: string;
}

export interface SystemMetrics {
  totalEvents: number;
  completedEvents: number;
  failedEvents: number;
  retryingEvents: number;
  dlqCount: number;
  queueSize: number;
  activeWorkers: number;
  totalWorkers: number;
  workerUtilization: number;
  averageLatencyMs: number;
  throughputEps: number;
  duplicateEventsPrevented: number;
  recoveriesCount: number;
}

export interface AutoscaleAction {
  timestamp: number;
  action: "SCALE_UP" | "SCALE_DOWN" | "COOLDOWN" | "IDLE";
  fromCount: number;
  toCount: number;
  reason: string;
  queueDepth: number;
}

export interface RecoveryLogEntry {
  id: string;
  timestamp: number;
  workerId: string;
  recoveredEvents: string[];
  reason: string;
}

export interface BenchmarkItem {
  mode: "Static" | "Autoscaled";
  workerCount: number;
  peakWorkers: number;
  numEvents: number;
  totalTimeSeconds: number;
  throughputEps: number;
  avgLatencyMs: number;
}
