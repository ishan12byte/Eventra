"""
Event model representing data moving through the distributed event broker.
"""
from dataclasses import dataclass, field
from enum import Enum
import time
import uuid
from typing import Any, Dict, Optional


class EventStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    RETRYING = "RETRYING"
    DEAD_LETTER = "DEAD_LETTER"


class EventType(str, Enum):
    ORDER = "order"
    PAYMENT = "payment"
    LOGIN = "login"
    SUPPORT = "support"


@dataclass
class Event:
    """
    Core Event entity.
    Can be serialized to and from Python dictionaries for REST API & persistence.
    """
    event_id: str = field(default_factory=lambda: f"evt_{uuid.uuid4().hex[:8]}")
    event_type: str = "order"
    timestamp: float = field(default_factory=time.time)
    partition_key: str = "default_key"
    priority: int = 1  # 1 = Normal, 2 = High, 3 = Critical
    payload: Dict[str, Any] = field(default_factory=dict)
    status: EventStatus = EventStatus.PENDING

    # Operational Tracking Fields
    partition_id: Optional[int] = None
    offset: Optional[int] = None
    assigned_worker_id: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3
    failure_reason: Optional[str] = None
    processing_time_ms: Optional[float] = None
    created_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "timestamp": self.timestamp,
            "partition_key": self.partition_key,
            "priority": self.priority,
            "payload": self.payload,
            "status": self.status.value if isinstance(self.status, EventStatus) else self.status,
            "partition_id": self.partition_id,
            "offset": self.offset,
            "assigned_worker_id": self.assigned_worker_id,
            "retry_count": self.retry_count,
            "max_retries": self.max_retries,
            "failure_reason": self.failure_reason,
            "processing_time_ms": self.processing_time_ms,
            "created_at": self.created_at,
            "completed_at": self.completed_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Event":
        status_val = data.get("status", "PENDING")
        if isinstance(status_val, str):
            try:
                status_val = EventStatus(status_val)
            except ValueError:
                status_val = EventStatus.PENDING

        return cls(
            event_id=data.get("event_id", f"evt_{uuid.uuid4().hex[:8]}"),
            event_type=data.get("event_type", "order"),
            timestamp=data.get("timestamp", time.time()),
            partition_key=data.get("partition_key", "default_key"),
            priority=int(data.get("priority", 1)),
            payload=data.get("payload", {}),
            status=status_val,
            partition_id=data.get("partition_id"),
            offset=data.get("offset"),
            assigned_worker_id=data.get("assigned_worker_id"),
            retry_count=int(data.get("retry_count", 0)),
            max_retries=int(data.get("max_retries", 3)),
            failure_reason=data.get("failure_reason"),
            processing_time_ms=data.get("processing_time_ms"),
            created_at=data.get("created_at", time.time()),
            completed_at=data.get("completed_at"),
        )
