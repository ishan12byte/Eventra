"""
Worker model representing the status and metrics of individual queue processing workers.
"""
from dataclasses import dataclass, field
from enum import Enum
import time
from typing import Any, Dict, List, Optional


class WorkerState(str, Enum):
    IDLE = "IDLE"
    BUSY = "BUSY"
    UNHEALTHY = "UNHEALTHY"
    STOPPED = "STOPPED"


@dataclass
class WorkerStats:
    worker_id: str
    state: WorkerState = WorkerState.IDLE
    processed_count: int = 0
    failed_count: int = 0
    current_event_id: Optional[str] = None
    current_load: float = 0.0  # 0.0 to 1.0
    last_heartbeat: float = field(default_factory=time.time)
    assigned_partitions: List[int] = field(default_factory=list)
    started_at: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "worker_id": self.worker_id,
            "state": self.state.value if isinstance(self.state, WorkerState) else self.state,
            "processed_count": self.processed_count,
            "failed_count": self.failed_count,
            "current_event_id": self.current_event_id,
            "current_load": round(self.current_load, 2),
            "last_heartbeat": self.last_heartbeat,
            "seconds_since_heartbeat": round(time.time() - self.last_heartbeat, 1),
            "assigned_partitions": self.assigned_partitions,
            "started_at": self.started_at,
        }
