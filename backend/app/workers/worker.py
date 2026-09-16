"""
Worker implementation for the Distributed Event Processing System.
Each Worker consumes events from the broker, processes them using polymorphic processors,
sends periodic heartbeats, updates statistics, and handles ACK/failure reporting.
"""
import asyncio
import time
from typing import Any, Dict, List, Optional
from ..models.event import Event, EventStatus
from ..models.worker import WorkerState, WorkerStats
from ..processors import get_processor
from ..config import SIMULATED_WORK_DELAY_MIN, SIMULATED_WORK_DELAY_MAX


class Worker:
    def __init__(self, worker_id: str, broker: Any, scheduling_policy: str = "FIFO"):
        self.worker_id = worker_id
        self.broker = broker
        self.scheduling_policy = scheduling_policy
        self.stats = WorkerStats(worker_id=worker_id)
        self.assigned_partitions: List[int] = []

        self._running: bool = False
        self._task: Optional[asyncio.Task] = None
        self._simulated_delay: float = 0.1  # seconds
        self._artificial_failure: bool = False  # for viva failure demo

    @property
    def state(self) -> WorkerState:
        return self.stats.state

    @state.setter
    def state(self, new_state: WorkerState) -> None:
        self.stats.state = new_state

    def send_heartbeat(self) -> None:
        """Sends a heartbeat timestamp to indicate worker liveness."""
        self.stats.last_heartbeat = time.time()

    def start(self) -> None:
        """Starts the worker processing loop in the asyncio event loop."""
        if self._running:
            return
        self._running = True
        self.state = WorkerState.IDLE
        self.send_heartbeat()
        self._task = asyncio.create_task(self._run_loop())

    def stop(self) -> None:
        """Gracefully stops the worker."""
        self._running = False
        self.state = WorkerState.STOPPED
        if self._task and not self._task.done():
            self._task.cancel()

    def kill_simulate_unhealthy(self) -> None:
        """
        Simulates an abrupt worker crash / hung state:
        Stops sending heartbeats and halts processing without clean ACK,
        allowing the failure recovery subsystem to detect it and recover its in-flight event.
        """
        self._running = False
        # Do not cancel task cleanly so that any in-flight event remains un-ACKed
        self.state = WorkerState.UNHEALTHY

    async def _run_loop(self) -> None:
        while self._running:
            try:
                # 1. Update heartbeat
                self.send_heartbeat()

                # 2. Attempt to pull next event
                event: Optional[Event] = self.broker.consume_next(
                    worker_id=self.worker_id,
                    assigned_partitions=self.assigned_partitions,
                    policy=self.scheduling_policy,
                )

                if event:
                    await self._process_event(event)
                else:
                    self.state = WorkerState.IDLE
                    self.stats.current_load = 0.0
                    self.stats.current_event_id = None
                    await asyncio.sleep(0.1)

            except asyncio.CancelledError:
                break
            except Exception as e:
                # Keep worker resilient to unexpected loop errors
                await asyncio.sleep(0.2)

    async def _process_event(self, event: Event) -> None:
        self.state = WorkerState.BUSY
        self.stats.current_load = 1.0
        self.stats.current_event_id = event.event_id
        start_time = time.time()

        try:
            # Simulate real computational work / I/O latency
            await asyncio.sleep(self._simulated_delay)

            # Check if artificial failure was triggered for testing
            if self._artificial_failure:
                self._artificial_failure = False
                raise RuntimeError(f"Simulated hardware / OS fault on worker {self.worker_id}")

            # Polymorphic dispatch to dedicated processor
            processor = get_processor(event.event_type)
            result = processor.process(event)

            duration_ms = (time.time() - start_time) * 1000.0

            # Step 10: Acknowledgement (ACK)
            self.broker.acknowledge(
                event_id=event.event_id,
                worker_id=self.worker_id,
                result=result,
                duration_ms=duration_ms,
            )
            self.stats.processed_count += 1

        except Exception as exc:
            duration_ms = (time.time() - start_time) * 1000.0
            error_msg = str(exc)
            # Step 11: Failure and Retry / DLQ
            self.broker.report_failure(
                event_id=event.event_id,
                worker_id=self.worker_id,
                reason=error_msg,
            )
            self.stats.failed_count += 1

        finally:
            self.stats.current_event_id = None
            self.stats.current_load = 0.0
            self.state = WorkerState.IDLE
            self.send_heartbeat()

    def to_dict(self) -> Dict[str, Any]:
        d = self.stats.to_dict()
        d["assigned_partitions"] = self.assigned_partitions
        d["scheduling_policy"] = self.scheduling_policy
        return d
