"""
EventManager: Central coordinator for the Distributed Event Processing System.
Connects FastAPI to EventBroker, WorkerPool, Telemetry, Autoscaler, and Database.
"""
from typing import Any, Dict, List, Optional
from .broker.broker import EventBroker
from .workers.worker_pool import WorkerPool
from .telemetry.telemetry import Telemetry
from .autoscaling.autoscaler import Autoscaler
from .database.database import DatabaseManager
from .models.event import Event
from .config import DEFAULT_PARTITION_COUNT, DEFAULT_WORKER_COUNT


class EventManager:
    """
    Singleton system coordinator holding the broker, worker pool, telemetry, and autoscaler.
    """
    _instance: Optional["EventManager"] = None

    def __init__(self, partition_count: int = DEFAULT_PARTITION_COUNT, worker_count: int = DEFAULT_WORKER_COUNT):
        self.db = DatabaseManager()
        self.broker = EventBroker(partition_count=partition_count, db=self.db)
        self.worker_pool = WorkerPool(broker=self.broker, initial_workers=worker_count)
        self.telemetry = Telemetry(broker=self.broker, worker_pool=self.worker_pool)
        self.autoscaler = Autoscaler(worker_pool=self.worker_pool, broker=self.broker, db=self.db)

    def start(self) -> None:
        """Starts worker pool background loops and autoscaler if enabled."""
        self.worker_pool.start()

    def stop(self) -> None:
        """Stops all workers and autoscaler tasks."""
        self.autoscaler.stop()
        self.worker_pool.stop()

    def submit_event(self, event_data: Dict[str, Any]) -> Dict[str, Any]:
        """Validates, creates, and publishes an event."""
        event = Event.from_dict(event_data)
        result = self.broker.publish(event)
        return {
            "event_id": event.event_id,
            "status": result.get("status"),
            "partition_id": result.get("partition_id"),
            "offset": result.get("offset"),
            "message": result.get("message", "Event successfully enqueued"),
            "event": event.to_dict(),
        }

    def submit_batch(self, count: int = 20, event_type: str = "order") -> List[Dict[str, Any]]:
        """Submits a batch of sample events for load testing and demo."""
        import random
        results = []
        for i in range(count):
            partition_key = f"key_{random.randint(1, 8)}"
            priority = random.choice([1, 1, 1, 2, 3])
            payload = {
                "batch_id": f"batch_{i+1}",
                "customer_id": f"cust_{random.randint(100, 999)}",
                "items": [{"name": "Demo Product", "price": round(random.uniform(10, 150), 2), "quantity": random.randint(1, 3)}],
            }
            res = self.submit_event({
                "event_type": event_type,
                "partition_key": partition_key,
                "priority": priority,
                "payload": payload,
            })
            results.append(res)
        return results


# Global singleton helper
_manager: Optional[EventManager] = None

def get_event_manager() -> EventManager:
    global _manager
    if _manager is None:
        _manager = EventManager()
        _manager.start()
    return _manager
