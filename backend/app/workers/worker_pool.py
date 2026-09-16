"""
WorkerPool manages dynamic workers, partition balancing, heartbeats, and failure recovery.
"""
import asyncio
import time
from typing import Any, Dict, List, Optional
from ..config import HEARTBEAT_TIMEOUT_SECONDS, MIN_WORKERS, MAX_WORKERS
from ..models.worker import WorkerState
from .worker import Worker


class WorkerPool:
    def __init__(self, broker: Any, initial_workers: int = 2, scheduling_policy: str = "FIFO"):
        self.broker = broker
        self.scheduling_policy = scheduling_policy
        self.workers: Dict[str, Worker] = {}
        self.worker_counter: int = 0
        self._heartbeat_checker_task: Optional[asyncio.Task] = None
        self._running: bool = False

        # Failure detection log
        self.failure_recovery_log: List[Dict[str, Any]] = []

        # Initialize requested number of workers
        for _ in range(initial_workers):
            self.add_worker()

    def start(self) -> None:
        """Starts all workers and the heartbeat monitor."""
        self._running = True
        for worker in self.workers.values():
            worker.start()
        self._heartbeat_checker_task = asyncio.create_task(self._heartbeat_monitor_loop())

    def stop(self) -> None:
        """Stops all workers."""
        self._running = False
        if self._heartbeat_checker_task and not self._heartbeat_checker_task.done():
            self._heartbeat_checker_task.cancel()
        for worker in self.workers.values():
            worker.stop()

    def add_worker(self) -> Worker:
        """Dynamically creates and starts a new worker."""
        self.worker_counter += 1
        worker_id = f"worker-{self.worker_counter}"
        worker = Worker(worker_id=worker_id, broker=self.broker, scheduling_policy=self.scheduling_policy)
        self.workers[worker_id] = worker
        self.rebalance_partitions()
        if self._running:
            worker.start()
        return worker

    def remove_worker(self, worker_id: Optional[str] = None) -> Optional[Worker]:
        """Gracefully removes and stops a worker."""
        if len(self.workers) <= MIN_WORKERS:
            return None

        target_id = worker_id
        if not target_id:
            # Pick the highest index idle worker
            target_id = list(self.workers.keys())[-1]

        worker = self.workers.pop(target_id, None)
        if worker:
            worker.stop()
            self.rebalance_partitions()
        return worker

    def scale_to(self, count: int) -> int:
        """Scales the worker pool up or down to target count."""
        target = max(MIN_WORKERS, min(MAX_WORKERS, count))
        current = len(self.workers)

        if target > current:
            for _ in range(target - current):
                self.add_worker()
        elif target < current:
            for _ in range(current - target):
                self.remove_worker()

        return len(self.workers)

    def rebalance_partitions(self) -> None:
        """
        Distributes partition ownership across active workers using round-robin.
        Demonstrates partition-to-worker consumer group mapping.
        """
        active_workers = [w for w in self.workers.values() if w.state != WorkerState.STOPPED]
        num_partitions = self.broker.partition_count

        for w in self.workers.values():
            w.assigned_partitions = []

        if not active_workers:
            for p_id in range(num_partitions):
                self.broker.partitions[p_id].assigned_worker_id = None
            return

        for p_id in range(num_partitions):
            assigned_worker = active_workers[p_id % len(active_workers)]
            assigned_worker.assigned_partitions.append(p_id)
            self.broker.partitions[p_id].assigned_worker_id = assigned_worker.worker_id

    def set_scheduling_policy(self, policy: str) -> None:
        """Updates scheduling policy (FIFO, PRIORITY, or LEAST_LOADED)."""
        self.scheduling_policy = policy
        for worker in self.workers.values():
            worker.scheduling_policy = policy

    def simulate_worker_crash(self, worker_id: str) -> Dict[str, Any]:
        """
        Intentionally marks a worker UNHEALTHY to demonstrate fault recovery.
        """
        worker = self.workers.get(worker_id)
        if not worker:
            return {"error": f"Worker {worker_id} not found"}

        worker.kill_simulate_unhealthy()
        return {
            "status": "CRASHED",
            "worker_id": worker_id,
            "message": f"Worker {worker_id} killed. Unhealthy heartbeat timeout will trigger automated recovery.",
        }

    async def _heartbeat_monitor_loop(self) -> None:
        """
        Periodic health check:
        Detects any worker that has not refreshed its heartbeat within HEARTBEAT_TIMEOUT_SECONDS.
        Marks it UNHEALTHY, reclaims any in-flight un-ACKed work, and triggers recovery.
        """
        while self._running:
            try:
                now = time.time()
                for worker_id, worker in list(self.workers.items()):
                    if worker.state == WorkerState.STOPPED:
                        continue

                    silence_duration = now - worker.stats.last_heartbeat
                    if silence_duration > HEARTBEAT_TIMEOUT_SECONDS:
                        if worker.state != WorkerState.UNHEALTHY:
                            worker.state = WorkerState.UNHEALTHY

                        # Recover any work left in-flight
                        recovered = self.broker.recover_worker_work(worker_id)
                        if recovered:
                            log_entry = {
                                "timestamp": now,
                                "unhealthy_worker_id": worker_id,
                                "recovered_events": recovered,
                                "reason": f"No heartbeat for {round(silence_duration, 1)}s. Requeued {len(recovered)} events.",
                            }
                            self.failure_recovery_log.append(log_entry)

                await asyncio.sleep(1.0)
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(1.0)

    def get_average_utilization(self) -> float:
        active = [w for w in self.workers.values() if w.state in (WorkerState.BUSY, WorkerState.IDLE)]
        if not active:
            return 0.0
        return sum(w.stats.current_load for w in active) / len(active)

    def get_workers_info(self) -> List[Dict[str, Any]]:
        return [w.to_dict() for w in self.workers.values()]
