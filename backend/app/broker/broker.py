"""
Core EventBroker implementation.
Demonstrates:
- Horizontal partitioning via hash(partition_key) % num_partitions
- Offsets and partitioned queue management
- At-least-once delivery with Idempotency deduplication
- Acknowledgements (ACK)
- Retries with backoff
- Dead Letter Queue (DLQ)
- Worker failure recovery (re-queuing unfinished in-flight events)
"""
import time
from typing import Any, Dict, List, Optional, Set
from ..models.event import Event, EventStatus
from .partition import Partition, hash_partition_key
from ..database.database import DatabaseManager


class EventBroker:
    def __init__(self, partition_count: int = 4, db: Optional[DatabaseManager] = None):
        self.partition_count = partition_count
        self.db = db or DatabaseManager()
        self.partitions: Dict[int, Partition] = {
            i: Partition(partition_id=i) for i in range(partition_count)
        }
        self.dlq: List[Event] = []
        self.processed_event_ids: Set[str] = set()
        self.all_events: Dict[str, Event] = {}

        # Telemetry counters
        self.total_published: int = 0
        self.total_completed: int = 0
        self.total_failed: int = 0
        self.total_retried: int = 0
        self.total_dlq: int = 0
        self.duplicate_events_prevented: int = 0

    def publish(self, event: Event) -> Dict[str, Any]:
        """
        Accepts an event into the broker:
        1. Checks idempotency: if already processed, prevents duplicate execution.
        2. Assigns partition by hashing partition_key.
        3. Enqueues the event into the partition.
        4. Persists the event to the database.
        """
        # Idempotency check
        if event.event_id in self.processed_event_ids:
            self.duplicate_events_prevented += 1
            return {
                "event": event,
                "status": "DUPLICATE_IGNORED",
                "message": f"Event {event.event_id} was already completed. Skipping side effects.",
            }

        # Calculate target partition
        target_partition_id = hash_partition_key(event.partition_key, self.partition_count)
        partition = self.partitions[target_partition_id]

        event.status = EventStatus.PENDING
        offset = partition.enqueue(event)
        self.all_events[event.event_id] = event
        self.total_published += 1

        # Persist initial event state to DB
        self.db.save_event(event.to_dict())

        return {
            "event": event,
            "partition_id": target_partition_id,
            "offset": offset,
            "status": "ENQUEUED",
        }

    def consume_next(self, worker_id: str, assigned_partitions: Optional[List[int]] = None, policy: str = "FIFO") -> Optional[Event]:
        """
        Allows a worker to pull the next event to process.
        Follows the specified scheduling policy (FIFO or PRIORITY).
        """
        # If worker has specific partitions assigned, poll those; otherwise check all partitions
        partitions_to_check = (
            [self.partitions[p] for p in assigned_partitions if p in self.partitions]
            if assigned_partitions
            else list(self.partitions.values())
        )

        for partition in partitions_to_check:
            if partition.size() > 0:
                if policy == "PRIORITY":
                    event = partition.dequeue_priority()
                else:
                    event = partition.dequeue()

                if event:
                    event.status = EventStatus.PROCESSING
                    event.assigned_worker_id = worker_id
                    # Update state in DB
                    self.db.save_event(event.to_dict())
                    return event

        return None

    def acknowledge(self, event_id: str, worker_id: str, result: Dict[str, Any], duration_ms: float) -> Optional[Event]:
        """
        ACK mechanism: Marks the event as COMPLETED, records execution result,
        and saves event ID in the idempotency registry.
        """
        event = self.all_events.get(event_id)
        if not event:
            return None

        event.status = EventStatus.COMPLETED
        event.assigned_worker_id = worker_id
        event.processing_time_ms = round(duration_ms, 2)
        event.completed_at = time.time()

        # Update partition stats
        if event.partition_id is not None and event.partition_id in self.partitions:
            self.partitions[event.partition_id].total_processed += 1

        # Record into Idempotency cache
        self.processed_event_ids.add(event_id)
        self.total_completed += 1

        # Durable persistence
        self.db.save_event(event.to_dict())
        self.db.save_processing_result(event_id, worker_id, result, duration_ms)

        return event

    def report_failure(self, event_id: str, worker_id: str, reason: str) -> Event:
        """
        Failure handling:
        Increments retry count. If retry_count <= max_retries, requeues for retry with backoff.
        If retry count exceeded, transfers event to Dead Letter Queue (DLQ).
        """
        event = self.all_events.get(event_id)
        if not event:
            raise KeyError(f"Event {event_id} not found in broker")

        self.total_failed += 1
        event.retry_count += 1
        event.failure_reason = reason
        event.assigned_worker_id = None

        if event.retry_count <= event.max_retries:
            # Requeue into the same partition
            event.status = EventStatus.RETRYING
            self.total_retried += 1
            if event.partition_id is not None and event.partition_id in self.partitions:
                self.partitions[event.partition_id].requeue_front(event)
            self.db.save_event(event.to_dict())
        else:
            # Max retries exceeded -> Dead Letter Queue
            event.status = EventStatus.DEAD_LETTER
            self.dlq.append(event)
            self.total_dlq += 1
            self.db.save_event(event.to_dict())
            self.db.save_dead_letter(event.to_dict(), reason)

        return event

    def recover_worker_work(self, worker_id: str) -> List[str]:
        """
        Fault tolerance & recovery:
        Finds any event that was assigned to worker_id and left in PROCESSING status
        (e.g. because worker died or timed out), resets its assignment, and requeues it.
        """
        recovered_event_ids: List[str] = []
        for event in self.all_events.values():
            if event.assigned_worker_id == worker_id and event.status == EventStatus.PROCESSING:
                event.status = EventStatus.RETRYING
                event.assigned_worker_id = None
                event.failure_reason = f"Worker {worker_id} became UNHEALTHY. Work automatically recovered."
                if event.partition_id is not None and event.partition_id in self.partitions:
                    self.partitions[event.partition_id].requeue_front(event)
                self.db.save_event(event.to_dict())
                recovered_event_ids.append(event.event_id)

        return recovered_event_ids

    def get_total_queue_size(self) -> int:
        return sum(p.size() for p in self.partitions.values())

    def get_event(self, event_id: str) -> Optional[Event]:
        if event_id in self.all_events:
            return self.all_events[event_id]
        db_ev = self.db.get_event(event_id)
        if db_ev:
            return Event.from_dict(db_ev)
        return None

    def get_recent_events(self, limit: int = 50) -> List[Dict[str, Any]]:
        # Returns recent events, merging in-memory state
        events = list(self.all_events.values())
        events.sort(key=lambda e: e.created_at, reverse=True)
        return [e.to_dict() for e in events[:limit]]

    def get_dead_letter_events(self) -> List[Dict[str, Any]]:
        # Merges in-memory DLQ with DB
        in_memory = [e.to_dict() for e in self.dlq]
        return in_memory
