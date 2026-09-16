"""
Telemetry and stream aggregation component.
Collects real-time operational metrics across broker, partitions, workers, and database.
"""
from collections import deque
import time
from typing import Any, Dict, List
from ..models.worker import WorkerState


class Telemetry:
    """
    Aggregates runtime statistics and windowed throughput measurements.
    """

    def __init__(self, broker: Any, worker_pool: Any):
        self.broker = broker
        self.worker_pool = worker_pool

        # Sliding window for throughput calculation (last 10 seconds)
        self._completed_timestamps: deque = deque()
        self._window_seconds: float = 10.0

    def record_completion(self) -> None:
        """Call when an event completes to calculate sliding window throughput."""
        self._completed_timestamps.append(time.time())

    def _clean_sliding_window(self, now: float) -> None:
        cutoff = now - self._window_seconds
        while self._completed_timestamps and self._completed_timestamps[0] < cutoff:
            self._completed_timestamps.popleft()

    def get_throughput(self) -> float:
        """Calculates completed events per second over the last 10 seconds."""
        now = time.time()
        self._clean_sliding_window(now)
        count = len(self._completed_timestamps)
        return round(count / self._window_seconds, 2)

    def get_metrics(self) -> Dict[str, Any]:
        """Gathers all telemetry and system metrics into a single dictionary."""
        all_events = list(self.broker.all_events.values())

        # Total events
        total_events = len(all_events)
        completed_events = sum(1 for e in all_events if e.status.value == "COMPLETED")
        failed_events = self.broker.total_failed
        retrying_events = sum(1 for e in all_events if e.status.value == "RETRYING")
        dlq_count = len(self.broker.dlq)
        queue_size = self.broker.get_total_queue_size()

        # Latency
        completed_with_latency = [e.processing_time_ms for e in all_events if e.processing_time_ms is not None]
        avg_latency = (
            round(sum(completed_with_latency) / len(completed_with_latency), 1)
            if completed_with_latency
            else 0.0
        )

        # Worker metrics
        active_workers = sum(
            1 for w in self.worker_pool.workers.values()
            if w.state in (WorkerState.IDLE, WorkerState.BUSY)
        )
        utilization = self.worker_pool.get_average_utilization()

        # Events by type
        events_by_type: Dict[str, int] = {}
        for e in all_events:
            events_by_type[e.event_type] = events_by_type.get(e.event_type, 0) + 1

        # Events by status
        events_by_status: Dict[str, int] = {
            "PENDING": 0, "PROCESSING": 0, "COMPLETED": 0,
            "FAILED": 0, "RETRYING": 0, "DEAD_LETTER": 0
        }
        for e in all_events:
            status_str = e.status.value if hasattr(e.status, "value") else str(e.status)
            events_by_status[status_str] = events_by_status.get(status_str, 0) + 1

        return {
            "total_events": total_events,
            "completed_events": completed_events,
            "failed_events": failed_events,
            "retrying_events": retrying_events,
            "dlq_count": dlq_count,
            "queue_size": queue_size,
            "active_workers": active_workers,
            "total_workers": len(self.worker_pool.workers),
            "worker_utilization": round(utilization * 100, 1),
            "average_latency_ms": avg_latency,
            "throughput_eps": self.get_throughput(),
            "events_by_type": events_by_type,
            "events_by_status": events_by_status,
            "duplicate_events_prevented": self.broker.duplicate_events_prevented,
            "timestamp": time.time(),
        }
