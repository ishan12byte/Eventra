# Distributed Event Processing System

A clean, understandable college-level Software Engineering & Distributed Systems project developed for B.Tech Computer Science & Engineering.

---

## 1. What the Project Does

The system demonstrates the fundamental principles of asynchronous distributed event processing:
1. **Events** (orders, payments, logins) are submitted via REST API or UI.
2. The **Event Broker** shards events into **4 independent partitions** using consistent hashing (`hash(partition_key) % 4`).
3. Concurrent **Workers** consume events from partitions using least-loaded scheduling.
4. Polymorphic **Processors** validate and process event payloads.
5. Workers send **Heartbeats** (1s). If a worker crashes, the supervisor detects the failure within 4.5s and **recovers un-ACKed in-flight events**, re-dispatching them to healthy workers so no work is lost.
6. Transient processing failures trigger **retries with exponential backoff**.
7. Persistent failures exceeding 3 attempts are isolated into a **Dead Letter Queue (DLQ)**.
8. A rule-based **Autoscaler** monitors queue depth to dynamically add or remove workers with a 4s cooldown.
9. All completed events, worker states, and dead letter records are persisted to **SQLite**.

---

## 2. Why It Was Created

Many modern big-data and messaging platforms (such as Apache Kafka, AWS SQS, or RabbitMQ) have millions of lines of code and extensive cluster orchestration, making it difficult for an undergraduate student to trace a single message from end-to-end.

This project was built from scratch using clean Python and React to demonstrate the **core algorithms and failure recovery mechanics** of distributed systems in an explainable, self-contained codebase without third-party broker dependencies.

---

## 3. Architecture

```text
Client (Web UI / REST API)
       ↓
  FastAPI Endpoints
       ↓
  Event Manager (Singleton Coordinator)
       ↓
  Event Broker (In-Memory Ring & Queues)
       ↓
  Partitions (P0, P1, P2, P3) [hash(key) % 4]
       ↓
  Workers (Worker 1, 2, 3, 4...) [Least-Loaded]
       ↓
  Processors (Order, Payment, Login)
       ↓
  SQLite Database (Persistent State)

Supporting Loops:
  Workers ──(Heartbeats)──> Failure Detector ──(Requeue un-ACKed)──> Partitions
  Partitions ──(Queue Depth)──> Autoscaler ──(Scale Up / Down)──> Worker Pool
  Worker Error ──(Max Retries Exceeded)──> Dead Letter Queue (DLQ)
```

---

## 4. Event Lifecycle & Statuses

Every event traverses deterministic states:
- `PENDING`: Ingested by the broker and enqueued in its hashed partition.
- `PROCESSING`: Claimed by a worker; execution in progress.
- `COMPLETED`: Successfully processed and acknowledged (`ACK`). Result committed to database.
- `RETRYING`: Processor threw a transient error; event re-queued with backoff.
- `DEAD_LETTER`: Failed 3 consecutive times; quarantined in DLQ for manual inspection or re-drive.
- `FAILED`: Marked failed on unrecoverable abort.

---

## 5. Partitions & Consistent Hashing

Events are partitioned by their `partition_key`:
$$\text{partition\_id} = \text{hash}(\text{partition\_key}) \pmod 4$$

- **Ordering Guarantee**: Events sharing the same key (e.g. `customer_101`) always hash to the same partition, preserving causal FIFO sequence.
- **Parallelism**: Events with distinct keys are processed concurrently by separate workers without database lock contention.

---

## 6. Workers & Consumer Loops

Workers run asynchronous consumer loops:
- Maintain local state: `IDLE`, `BUSY`, `UNHEALTHY`, `STOPPED`.
- Periodically poll assigned partitions for the highest priority event.
- Record processing latency, throughput, and CPU load metrics.
- Emit a heartbeat timestamp every 1 second.

---

## 7. Processors (Polymorphic OOP)

Base class `BaseProcessor` defines:
```python
def process(self, event: Event) -> ProcessingResult:
    ...
```
Concrete implementations:
- `OrderProcessor`: Validates customer ID, line items, calculates total price.
- `PaymentProcessor`: Validates currency, gateway authorization token, and amount.
- `LoginProcessor`: Validates credentials format, client IP, records audit log.

---

## 8. Acknowledgement (ACK) Protocol

To guarantee **at-least-once processing**, an event is only removed from the in-flight buffer after the worker explicitly emits an acknowledgement (`broker.acknowledge_event(event_id)`). If the worker crashes before sending an ACK, the event is recovered.

---

## 9. Retries with Backoff

When processing raises a transient exception:
- `retry_count` is incremented.
- The event status is updated to `RETRYING`.
- An exponential backoff pause prevents hammering recovering downstream services:
$$\text{delay} = \text{base\_delay} \times 2^{\text{retry\_count}}$$

---

## 10. Dead Letter Queue (DLQ)

If an event fails after `max_retries` (default: 3 attempts), it is classified as a poison pill:
- The event is removed from the active partition queue to prevent head-of-line blocking.
- It is saved to the DLQ table with its full payload, error stack trace, and timestamp.
- The frontend provides a 1-click **Re-drive** button to re-queue the event once the underlying error is fixed.

---

## 11. Heartbeats & Worker Failure Recovery

1. Workers update `last_heartbeat = time.time()` every 1.0 second.
2. The supervisor runs a failure sweep:
   - If `current_time - last_heartbeat > 4.5s`, the worker is marked `UNHEALTHY`.
3. **In-Flight Recovery**: Any un-ACKed event claimed by that dead worker is salvaged, marked `RETRYING`, and put back at the head of the partition queue.
4. Another healthy worker picks up the rescued event and finishes processing it.

---

## 12. Rule-Based Autoscaler

A lightweight controller loop monitors workload pressure:
- **Scale Up**: If total partition queue depth $> 6$, spawn +1 worker (up to `max_workers = 6`).
- **Scale Down**: If queue depth $\le 1$ and worker utilization is low, terminate an idle worker (down to `min_workers = 1`).
- **Cooldown**: A 4.0-second cooldown timer prevents oscillation (rapid flapping).

---

## 13. Idempotency & Duplicate Prevention

The broker tracks completed event IDs in a committed Set:
- If a client resubmits an event with an existing `event_id`, the broker returns `DUPLICATE_IGNORED`.
- No duplicate business mutations (e.g., duplicate billing or duplicate order placement) occur.

---

## 14. Database Persistence (SQLite)

Tables maintained in SQLite:
- `events`: Event records, partition ID, priority, status, retry counts, timestamps.
- `workers`: Registered workers, states, processed count, failed count.
- `processing_results`: Output JSON and latency for completed events.
- `dead_letter_events`: Quarantined events and failure diagnostics.
- `scaling_events`: Audit log of autoscaler scale-up and scale-down decisions.

---

## 15. REST API Endpoints

- `POST /events` - Enqueue a new event
- `POST /events/batch` - Enqueue a batch of events
- `GET /events` - List all events (supports filter by status)
- `GET /events/{event_id}` - Retrieve details of a specific event
- `GET /workers` - List worker states, load, and heartbeat status
- `POST /workers` - Add a worker manually
- `DELETE /workers/{worker_id}` - Stop and remove a worker
- `POST /workers/{worker_id}/crash` - Simulate worker failure
- `GET /partitions` - Partition queue depths and offsets
- `GET /metrics` - Real-time cluster throughput and latency
- `GET /dead-letter-events` - List DLQ contents
- `POST /dead-letter-events/{event_id}/redrive` - Re-drive a DLQ event
- `GET /scaling-events` - History of autoscaler scaling actions
- `GET /health` - Health check

---

## 16. Frontend Pages (React)

1. **Dashboard**: High-level overview cards (Total Events, Processed, Failed, Queue Size, Active Workers, Throughput), Recent Events table, and Autoscaler summary.
2. **Events**: Searchable table of all events with status badges, priority markers, and buttons to produce single or batch events.
3. **Workers**: Worker cards showing CPU load, processed count, heartbeat status, and a **Simulate Failure** button.
4. **Partitions**: Breakdown of partitions 0–3, current monotonic offsets, queue depth, and distribution bar graph.
5. **Failures**: Combined view of retries, failure logs, and the Dead Letter Queue with re-drive actions.
6. **Benchmarks**: Interactive performance testing tool measuring real throughput (eps) and latency across 1, 2, and 4 workers.

---

## 17. How to Run the Project

### Running the Python Backend
```bash
# Start FastAPI application with Uvicorn
python3 backend/app/main.py
```

### Running the React Frontend
```bash
npm run dev
```

### Running the Full Test Suite
```bash
python3 run_tests.py
# Or directly via unittest:
python3 -m unittest discover backend/tests -v
```

### Running Failure Experiments Script
```bash
python3 scripts/run_failure_experiment.py
```

---

## 18. Actual Test & Benchmark Results

### Test Results
```text
Ran 26 tests in 0.048s
ALL 26 TESTS PASSED SUCCESSFULLY!
```
- Covers partition consistent hashing, priority queues, worker heartbeat timeouts, in-flight work recovery, retry backoff, DLQ isolation, idempotency deduplication, and autoscaler threshold evaluation.

### Empirical Benchmark Results (from `benchmark_results.json`)
| Workers | Events Processed | Elapsed Time | Throughput | Average Latency |
|:---:|:---:|:---:|:---:|:---:|
| 1 Worker | 200 events | 0.585 s | **341.6 eps** | 2.93 ms |
| 2 Workers | 200 events | 0.388 s | **515.6 eps** | 1.94 ms |
| 4 Workers | 200 events | 0.323 s | **618.5 eps** | 1.62 ms |
| 4 Workers | 1,000 events | 1.623 s | **616.1 eps** | 1.62 ms |

---

## 19. Known Limitations

- **Single Node Concurrency**: Workers run as concurrent async tasks within a single process rather than separate physical machines across a network.
- **In-Memory Active Queue**: Active queue state resides in memory; events commit to SQLite upon completion or failure.
- **Static Partition Count**: Fixed at 4 partitions (partition re-sharding requires cluster restart).

---

## 20. Future Improvements

- Replace in-memory queues with write-ahead logs (WAL) on disk.
- Implement consumer group partition rebalancing protocol.
- Support dynamic partition splitting and merging based on traffic spikes.
