"""
Partition implementation for the distributed event broker.
Demonstrates horizontal partitioning (sharding) of an event stream.
"""
from collections import deque
import hashlib
from typing import Any, Dict, List, Optional
from ..models.event import Event, EventStatus


class Partition:
    """
    A single partition represents an ordered log/queue of events.
    Events with the same partition_key land on the same partition.
    """

    def __init__(self, partition_id: int):
        self.partition_id: int = partition_id
        self._queue: deque = deque()
        self.current_offset: int = 0
        self.total_enqueued: int = 0
        self.total_processed: int = 0
        self.assigned_worker_id: Optional[str] = None

    def enqueue(self, event: Event) -> int:
        """Enqueues an event and assigns a partition offset."""
        self.current_offset += 1
        event.partition_id = self.partition_id
        event.offset = self.current_offset
        self._queue.append(event)
        self.total_enqueued += 1
        return self.current_offset

    def requeue_front(self, event: Event) -> None:
        """Pushes an event back to the front of the partition queue (e.g. on worker failure)."""
        event.status = EventStatus.RETRYING
        self._queue.appendleft(event)

    def dequeue(self) -> Optional[Event]:
        """Dequeues the next available event in FIFO order."""
        if not self._queue:
            return None
        return self._queue.popleft()

    def dequeue_priority(self) -> Optional[Event]:
        """Dequeues the event with the highest priority (3 > 2 > 1)."""
        if not self._queue:
            return None
        # Find index of event with max priority
        best_idx = 0
        best_priority = -1
        for i, event in enumerate(self._queue):
            if event.priority > best_priority:
                best_priority = event.priority
                best_idx = i
        # Remove and return that event
        event = self._queue[best_idx]
        del self._queue[best_idx]
        return event

    def size(self) -> int:
        return len(self._queue)

    def peek(self) -> Optional[Event]:
        return self._queue[0] if self._queue else None

    def get_queued_events(self) -> List[Event]:
        return list(self._queue)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "partition_id": self.partition_id,
            "queue_size": self.size(),
            "total_enqueued": self.total_enqueued,
            "total_processed": self.total_processed,
            "current_offset": self.current_offset,
            "assigned_worker_id": self.assigned_worker_id,
        }


def hash_partition_key(partition_key: str, num_partitions: int) -> int:
    """
    Consistent partition key hashing.
    Computes an MD5 hash of the partition key modulo the partition count.
    Ensures that events with the same key always map to the exact same partition.
    """
    if not partition_key:
        return 0
    digest = hashlib.md5(partition_key.encode("utf-8")).hexdigest()
    return int(digest, 16) % num_partitions
