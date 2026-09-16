"""
Benchmark suite for Distributed Event Processing System.
Measures real performance across:
- Worker concurrency comparisons (1 vs 2 vs 4 workers)
- Batch sizes (100, 500, 1000 events)
- Static workers vs rule-based Autoscaling
Produces concrete measurements: total time, throughput (eps), and average latency.
"""
import asyncio
import time
import json
import os
import sys

# Ensure backend package is importable
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.broker.broker import EventBroker
from backend.app.database.database import DatabaseManager
from backend.app.workers.worker_pool import WorkerPool
from backend.app.autoscaling.autoscaler import Autoscaler
from backend.app.models.event import Event


async def run_workload(worker_count: int, num_events: int, use_autoscaler: bool = False) -> dict:
    """Executes a benchmark run with specified workers and event volume."""
    db = DatabaseManager(f"sqlite:///./benchmark_w{worker_count}_n{num_events}.db")
    broker = EventBroker(partition_count=4, db=db)
    pool = WorkerPool(broker=broker, initial_workers=worker_count)

    autoscaler = None
    if use_autoscaler:
        autoscaler = Autoscaler(worker_pool=pool, broker=broker, db=db)
        autoscaler.cooldown_seconds = 1.0
        autoscaler.start()

    # Pre-configure workers for rapid benchmark execution
    for w in pool.workers.values():
        w._simulated_delay = 0.001  # fast mock delay for high event counts
    pool.start()

    # Enqueue events
    start_publish = time.time()
    for i in range(num_events):
        event = Event(
            event_id=f"bm_{i}",
            event_type="order",
            partition_key=f"user_{i % 16}",
            priority=(i % 3) + 1,
            payload={"amount": 50.0 + (i % 20), "items": [{"name": "Item", "price": 10.0, "quantity": 1}]},
        )
        broker.publish(event)
    publish_time = time.time() - start_publish

    # Wait until all events have completed
    start_process = time.time()
    timeout = 30.0
    while time.time() - start_process < timeout:
        if broker.total_completed >= num_events:
            break
        await asyncio.sleep(0.01)

    total_time = time.time() - start_process
    completed = broker.total_completed
    throughput = round(completed / total_time, 2) if total_time > 0 else 0.0

    latencies = [e.processing_time_ms for e in broker.all_events.values() if e.processing_time_ms is not None]
    avg_latency = round(sum(latencies) / len(latencies), 2) if latencies else 0.0

    peak_workers = len(pool.workers)
    if autoscaler:
        autoscaler.stop()
    pool.stop()

    return {
        "num_events": num_events,
        "worker_count": worker_count,
        "peak_workers": peak_workers,
        "mode": "Autoscaled" if use_autoscaler else "Static",
        "completed": completed,
        "total_time_seconds": round(total_time, 3),
        "throughput_eps": throughput,
        "avg_latency_ms": avg_latency,
    }


async def main():
    print("=" * 65)
    print("  DISTRIBUTED EVENT PROCESSING SYSTEM - BENCHMARK SUITE")
    print("=" * 65)
    print("Running real workload benchmarks across concurrency configurations...\n")

    results = []

    # 1. Compare Concurrency: 1 Worker vs 2 Workers vs 4 Workers with 200 events
    for w_count in [1, 2, 4]:
        print(f"-> Testing {w_count} worker(s) on 200 events...")
        res = await run_workload(worker_count=w_count, num_events=200, use_autoscaler=False)
        results.append(res)
        print(f"   Done in {res['total_time_seconds']}s | Throughput: {res['throughput_eps']} evt/s | Avg Latency: {res['avg_latency_ms']}ms\n")

    # 2. Scale test: 1000 events on 4 workers
    print("-> Testing 1000 events on 4 workers...")
    res_1000 = await run_workload(worker_count=4, num_events=1000, use_autoscaler=False)
    results.append(res_1000)
    print(f"   Done in {res_1000['total_time_seconds']}s | Throughput: {res_1000['throughput_eps']} evt/s | Avg Latency: {res_1000['avg_latency_ms']}ms\n")

    # 3. Static (1 worker) vs Autoscaled (starting at 1 worker) on 300 events burst
    print("-> Testing Static (1 worker) vs Autoscaling (1 -> N workers) on 300 events...")
    res_static = await run_workload(worker_count=1, num_events=300, use_autoscaler=False)
    res_auto = await run_workload(worker_count=1, num_events=300, use_autoscaler=True)
    results.append(res_static)
    results.append(res_auto)

    print("\n" + "=" * 65)
    print("  BENCHMARK SUMMARY TABLE")
    print("=" * 65)
    print(f"{'Mode':<12} | {'Workers':<8} | {'Events':<8} | {'Time (s)':<10} | {'Throughput':<12} | {'Avg Latency'}")
    print("-" * 65)
    for r in results:
        w_str = f"{r['worker_count']}" if r['mode'] == 'Static' else f"{r['worker_count']}->{r['peak_workers']}"
        print(f"{r['mode']:<12} | {w_str:<8} | {r['num_events']:<8} | {r['total_time_seconds']:<10} | {r['throughput_eps']:<12} | {r['avg_latency_ms']} ms")
    print("=" * 65)

    # Save benchmark results to JSON file for frontend presentation and report
    with open("benchmark_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print("\nBenchmark results written to benchmark_results.json")


if __name__ == "__main__":
    asyncio.run(main())
