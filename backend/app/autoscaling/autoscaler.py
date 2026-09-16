"""
Autoscaler component: Rule-based automatic worker pool scaling controller.
Monitors queue depth and worker utilization, making deterministic scale-up/scale-down decisions.
"""
import asyncio
import time
from typing import Any, Dict, List, Optional
from ..config import (
    MIN_WORKERS,
    MAX_WORKERS,
    AUTOSCALE_COOLDOWN_SECONDS,
    HIGH_QUEUE_THRESHOLD,
    LOW_QUEUE_THRESHOLD,
    HIGH_UTILIZATION_THRESHOLD,
)
from ..database.database import DatabaseManager


class Autoscaler:
    def __init__(self, worker_pool: Any, broker: Any, db: Optional[DatabaseManager] = None):
        self.worker_pool = worker_pool
        self.broker = broker
        self.db = db or DatabaseManager()

        self.enabled: bool = False
        self.min_workers: int = MIN_WORKERS
        self.max_workers: int = MAX_WORKERS
        self.cooldown_seconds: float = AUTOSCALE_COOLDOWN_SECONDS
        self.last_scale_time: float = 0.0
        self.last_decision: str = "INITIALIZED"
        self.last_reason: str = "System started"

        self._running: bool = False
        self._loop_task: Optional[asyncio.Task] = None
        self.history: List[Dict[str, Any]] = []

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self.enabled = True
        self._loop_task = asyncio.create_task(self._monitor_loop())

    def stop(self) -> None:
        self._running = False
        self.enabled = False
        if self._loop_task and not self._loop_task.done():
            self._loop_task.cancel()

    def set_enabled(self, enabled: bool) -> None:
        self.enabled = enabled
        if enabled and not self._running:
            self.start()
        elif not enabled and self._running:
            self.stop()

    def evaluate(self) -> Dict[str, Any]:
        """
        Executes one rule-based evaluation step.
        Can be called by background loop or manually tested.
        Rules:
        1. If in cooldown -> DO NOTHING
        2. If queue_size > HIGH_QUEUE_THRESHOLD or utilization > HIGH_UTILIZATION_THRESHOLD:
           -> SCALE UP (+1 worker, capped at max_workers)
        3. Else if queue_size <= LOW_QUEUE_THRESHOLD and utilization < 0.2 and current > min_workers:
           -> SCALE DOWN (-1 worker, floor at min_workers)
        4. Otherwise -> DO NOTHING
        """
        now = time.time()
        queue_size = self.broker.get_total_queue_size()
        current_workers = len(self.worker_pool.workers)
        utilization = self.worker_pool.get_average_utilization()

        # Cooldown guard
        time_since_scale = now - self.last_scale_time
        if time_since_scale < self.cooldown_seconds:
            decision = "DO_NOTHING"
            reason = f"In cooldown ({round(self.cooldown_seconds - time_since_scale, 1)}s remaining)"
            self.last_decision = decision
            self.last_reason = reason
            return {
                "decision": decision,
                "action": "NONE",
                "reason": reason,
                "queue_size": queue_size,
                "utilization": round(utilization * 100, 1),
                "current_workers": current_workers,
            }

        # Rule 1: Scale Up
        if (queue_size >= HIGH_QUEUE_THRESHOLD or utilization >= HIGH_UTILIZATION_THRESHOLD) and current_workers < self.max_workers:
            new_worker = self.worker_pool.add_worker()
            decision = "SCALE_UP"
            reason = f"High load detected: queue={queue_size} (thresh={HIGH_QUEUE_THRESHOLD}), util={round(utilization*100)}%"
            self.last_scale_time = now
            self.last_decision = decision
            self.last_reason = reason

            event_record = {
                "timestamp": now,
                "action": "SCALE_UP",
                "from_workers": current_workers,
                "to_workers": len(self.worker_pool.workers),
                "reason": reason,
                "queue_size": queue_size,
                "utilization": round(utilization * 100, 1),
            }
            self.history.append(event_record)
            self.db.save_scaling_event("SCALE_UP", current_workers, len(self.worker_pool.workers), reason, queue_size, utilization)
            return event_record

        # Rule 2: Scale Down
        elif queue_size <= LOW_QUEUE_THRESHOLD and utilization < 0.2 and current_workers > self.min_workers:
            removed = self.worker_pool.remove_worker()
            decision = "SCALE_DOWN"
            reason = f"Idle load detected: queue={queue_size} (thresh={LOW_QUEUE_THRESHOLD}), util={round(utilization*100)}%"
            self.last_scale_time = now
            self.last_decision = decision
            self.last_reason = reason

            event_record = {
                "timestamp": now,
                "action": "SCALE_DOWN",
                "from_workers": current_workers,
                "to_workers": len(self.worker_pool.workers),
                "reason": reason,
                "queue_size": queue_size,
                "utilization": round(utilization * 100, 1),
            }
            self.history.append(event_record)
            self.db.save_scaling_event("SCALE_DOWN", current_workers, len(self.worker_pool.workers), reason, queue_size, utilization)
            return event_record

        # Rule 3: Do Nothing
        decision = "DO_NOTHING"
        reason = f"System load balanced: queue={queue_size}, util={round(utilization*100)}%"
        self.last_decision = decision
        self.last_reason = reason
        return {
            "decision": decision,
            "action": "NONE",
            "reason": reason,
            "queue_size": queue_size,
            "utilization": round(utilization * 100, 1),
            "current_workers": current_workers,
        }

    async def _monitor_loop(self) -> None:
        while self._running:
            try:
                if self.enabled:
                    self.evaluate()
                await asyncio.sleep(2.0)
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(2.0)

    def get_status(self) -> Dict[str, Any]:
        return {
            "enabled": self.enabled,
            "current_workers": len(self.worker_pool.workers),
            "min_workers": self.min_workers,
            "max_workers": self.max_workers,
            "cooldown_seconds": self.cooldown_seconds,
            "seconds_since_last_scale": round(time.time() - self.last_scale_time, 1) if self.last_scale_time > 0 else None,
            "last_decision": self.last_decision,
            "last_reason": self.last_reason,
            "history": self.history[-20:],
        }
