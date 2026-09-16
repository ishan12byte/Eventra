"""
Tests for Worker lifecycle, heartbeats, and failure recovery.
"""
import unittest
import time
from backend.app.broker.broker import EventBroker
from backend.app.database.database import DatabaseManager
from backend.app.workers.worker_pool import WorkerPool
from backend.app.models.event import Event, EventStatus
from backend.app.models.worker import WorkerState


class TestWorkerAndHeartbeat(unittest.TestCase):
    def setUp(self):
        self.db = DatabaseManager("sqlite:///./test_workers.db")
        self.broker = EventBroker(partition_count=2, db=self.db)
        self.pool = WorkerPool(broker=self.broker, initial_workers=2)

    def tearDown(self):
        self.pool.stop()

    def test_worker_pool_initialization(self):
        self.assertEqual(len(self.pool.workers), 2)
        # Partitions should be partitioned across workers
        self.assertEqual(len(self.pool.workers["worker-1"].assigned_partitions), 1)
        self.assertEqual(len(self.pool.workers["worker-2"].assigned_partitions), 1)

    def test_worker_scale_up_and_down(self):
        self.pool.scale_to(4)
        self.assertEqual(len(self.pool.workers), 4)

        self.pool.scale_to(1)
        self.assertEqual(len(self.pool.workers), 1)

    def test_failure_recovery_on_dead_worker(self):
        # 1. Publish an event
        event = Event(event_id="recover_evt_1", event_type="order", partition_key="key1")
        self.broker.publish(event)

        # 2. Worker 1 consumes event and gets stuck in PROCESSING
        consumed = self.broker.consume_next("worker-1")
        self.assertEqual(consumed.event_id, "recover_evt_1")
        self.assertEqual(consumed.status, EventStatus.PROCESSING)

        # 3. Simulate worker-1 crashing
        recovered_ids = self.broker.recover_worker_work("worker-1")
        self.assertIn("recover_evt_1", recovered_ids)

        # 4. Event should now be back in partition queue ready for another worker!
        self.assertEqual(event.status, EventStatus.RETRYING)
        re_consumed = self.broker.consume_next("worker-2")
        self.assertIsNotNone(re_consumed)
        self.assertEqual(re_consumed.event_id, "recover_evt_1")


if __name__ == "__main__":
    unittest.main()
