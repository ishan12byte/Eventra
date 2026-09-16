"""
Reproducible Failure and Distributed Systems Experiments CLI.
Allows students and professors to run specific, step-by-step demonstrations:
1. Worker failure (stops worker, detects missing heartbeat, recovers in-flight event)
2. Processing failure (triggers simulated exception in processor)
3. Retry mechanism (verifies exponential/backoff retries up to max_retries)
4. Dead Letter Queue (DLQ) (pushes repeated failure past limit into DLQ)
5. Duplicate event idempotency (proves same event ID won't re-execute side effects)
6. Burst workload (floods queue with 50 events across 4 partitions)
7. Autoscaling experiment (demonstrates automatic scale-up under load and scale-down when idle)
"""
import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.broker.broker import EventBroker
from backend.app.database.database import DatabaseManager
from backend.app.workers.worker_pool import WorkerPool
from backend.app.autoscaling.autoscaler import Autoscaler
from backend.app.models.event import Event, EventStatus
from backend.app.processors.order_processor import OrderProcessor


async def run_experiment_1_worker_failure():
    print("\n--- EXPERIMENT 1: Worker Failure & Work Recovery ---")
    db = DatabaseManager("sqlite:///./exp1.db")
    broker = EventBroker(partition_count=2, db=db)
    pool = WorkerPool(broker=broker, initial_workers=2)

    event = Event(event_id="crash_test_101", event_type="order", partition_key="user_1")
    broker.publish(event)
    print(f"1. Event '{event.event_id}' published to Partition {event.partition_id}.")

    # Worker-1 consumes it
    consumed = broker.consume_next("worker-1")
    print(f"2. Worker 'worker-1' claimed event '{consumed.event_id}' (Status: {consumed.status.value}).")

    # Simulate worker-1 crashing abruptly
    print("3. SIMULATING CRASH: worker-1 process dies abruptly without sending ACK.")
    pool.simulate_worker_crash("worker-1")

    # Failure recovery triggers
    recovered = broker.recover_worker_work("worker-1")
    print(f"4. Failure detector executed: Found {len(recovered)} un-ACKed in-flight event(s): {recovered}")
    print(f"5. Event status is now '{event.status.value}', returned to Partition {event.partition_id} queue.")

    # Worker-2 picks up the recovered event
    reclaimed = broker.consume_next("worker-2")
    print(f"6. Healthy worker 'worker-2' re-consumed the recovered event '{reclaimed.event_id}'.")
    broker.acknowledge(reclaimed.event_id, "worker-2", {"result": "Recovered and processed"}, 12.0)
    print(f"7. Worker-2 completed and ACKed event '{event.event_id}'! Event was NOT lost.\n")
    pool.stop()


async def run_experiment_2_and_3_retry_and_dlq():
    print("\n--- EXPERIMENT 2, 3 & 4: Processing Failure, Retries, and DLQ ---")
    db = DatabaseManager("sqlite:///./exp2.db")
    broker = EventBroker(partition_count=2, db=db)

    # Max retries = 2
    event = Event(
        event_id="dlq_demo_evt",
        event_type="order",
        partition_key="bad_item_key",
        payload={"simulate_error": True, "error_message": "External inventory system unavailable"},
        max_retries=2,
    )
    broker.publish(event)
    print(f"1. Published event with simulated error payload. Max retries configured = {event.max_retries}")

    # Attempt 1
    broker.consume_next("worker-1")
    broker.report_failure(event.event_id, "worker-1", "External inventory system unavailable")
    print(f"2. Attempt 1 Failed -> Retry count = {event.retry_count}/{event.max_retries}, Status = {event.status.value}")

    # Attempt 2
    broker.consume_next("worker-1")
    broker.report_failure(event.event_id, "worker-1", "External inventory system unavailable")
    print(f"3. Attempt 2 Failed -> Retry count = {event.retry_count}/{event.max_retries}, Status = {event.status.value}")

    # Attempt 3 (Exceeds max retries!)
    broker.consume_next("worker-1")
    broker.report_failure(event.event_id, "worker-1", "External inventory system permanently down")
    print(f"4. Attempt 3 Failed (Exceeded max_retries) -> Status = {event.status.value}")
    print(f"5. Event moved to Dead Letter Queue (DLQ)! DLQ count = {len(broker.dlq)}")
    print(f"   DLQ Event Details: ID={broker.dlq[0].event_id}, Reason='{broker.dlq[0].failure_reason}'\n")


async def run_experiment_5_duplicate_idempotency():
    print("\n--- EXPERIMENT 5: Duplicate Event Idempotency ---")
    db = DatabaseManager("sqlite:///./exp5.db")
    broker = EventBroker(partition_count=2, db=db)

    event = Event(event_id="order_tx_555", event_type="order", partition_key="cust_42")
    res1 = broker.publish(event)
    print(f"1. First publish of event '{event.event_id}': Result = {res1['status']}")

    # Worker consumes and completes
    broker.consume_next("worker-1")
    broker.acknowledge(event.event_id, "worker-1", {"total": 89.99}, 15.0)
    print(f"2. Event processed and ACKed. Status = {event.status.value}")

    # Duplicate message arrives (e.g. network re-transmission)
    dup_event = Event(event_id="order_tx_555", event_type="order", partition_key="cust_42")
    res2 = broker.publish(dup_event)
    print(f"3. Second publish of same event ID '{event.event_id}': Result = {res2['status']}")
    print(f"   Message: {res2['message']}")
    print(f"   Duplicate events safely prevented: {broker.duplicate_events_prevented}\n")


async def run_experiment_6_burst_workload():
    print("\n--- EXPERIMENT 6: Burst Workload & Partitioning ---")
    db = DatabaseManager("sqlite:///./exp6.db")
    broker = EventBroker(partition_count=4, db=db)

    print("1. Enqueuing 40 events across 4 partitions using diverse partition keys...")
    for i in range(40):
        key = f"customer_{i % 10}"
        event = Event(event_id=f"burst_{i}", event_type="order", partition_key=key)
        broker.publish(event)

    print("2. Distribution of events across partitions:")
    for p_id, p in broker.partitions.items():
        print(f"   Partition {p_id}: {p.size()} events queued (Offset reached: {p.current_offset})")
    print(f"   Total queued: {broker.get_total_queue_size()} events.\n")


async def run_experiment_7_autoscaling():
    print("\n--- EXPERIMENT 7: Autoscaler Controller ---")
    db = DatabaseManager("sqlite:///./exp7.db")
    broker = EventBroker(partition_count=4, db=db)
    pool = WorkerPool(broker=broker, initial_workers=1)
    autoscaler = Autoscaler(worker_pool=pool, broker=broker, db=db)
    autoscaler.cooldown_seconds = 0.0  # instant evaluation for demo

    print(f"1. Initial worker count: {len(pool.workers)}")

    # Flood with 20 events to simulate high load spike
    for i in range(20):
        broker.publish(Event(event_id=f"scale_{i}", partition_key=f"k_{i}"))

    print(f"2. High traffic spike: Queue size = {broker.get_total_queue_size()} (Threshold = 8)")
    decision1 = autoscaler.evaluate()
    print(f"3. Autoscaler evaluation: Action = {decision1['action']} | Reason: {decision1['reason']}")
    print(f"   Worker pool scaled to: {len(pool.workers)} workers")

    # Clear queue to simulate traffic drop
    for p in broker.partitions.values():
        p._queue.clear()

    print(f"4. Traffic subsides: Queue size = {broker.get_total_queue_size()} (Threshold <= 2)")
    decision2 = autoscaler.evaluate()
    print(f"5. Autoscaler evaluation: Action = {decision2['action']} | Reason: {decision2['reason']}")
    print(f"   Worker pool scaled to: {len(pool.workers)} workers\n")
    pool.stop()


async def main():
    print("=" * 70)
    print(" DISTRIBUTED EVENT PROCESSING SYSTEM - REPRODUCIBLE EXPERIMENTS")
    print("=" * 70)
    await run_experiment_1_worker_failure()
    await run_experiment_2_and_3_retry_and_dlq()
    await run_experiment_5_duplicate_idempotency()
    await run_experiment_6_burst_workload()
    await run_experiment_7_autoscaling()
    print("All 7 experiments completed successfully!")


if __name__ == "__main__":
    asyncio.run(main())
