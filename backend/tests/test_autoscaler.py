"""
Tests for Autoscaler rule-based scale-up and scale-down decisions.
"""
import unittest
import time
from backend.app.broker.broker import EventBroker
from backend.app.database.database import DatabaseManager
from backend.app.workers.worker_pool import WorkerPool
from backend.app.autoscaling.autoscaler import Autoscaler
from backend.app.models.event import Event


class TestAutoscaler(unittest.TestCase):
    def setUp(self):
        self.db = DatabaseManager("sqlite:///./test_autoscaler.db")
        self.broker = EventBroker(partition_count=2, db=self.db)
        self.pool = WorkerPool(broker=self.broker, initial_workers=2)
        self.autoscaler = Autoscaler(worker_pool=self.pool, broker=self.broker, db=self.db)
        self.autoscaler.cooldown_seconds = 0.0  # Zero cooldown for instant unit testing

    def tearDown(self):
        self.pool.stop()

    def test_scale_up_on_high_queue(self):
        # Initial workers = 2
        self.assertEqual(len(self.pool.workers), 2)

        # Enqueue 12 events to exceed HIGH_QUEUE_THRESHOLD (8)
        for i in range(12):
            self.broker.publish(Event(event_id=f"burst_{i}", partition_key=f"k_{i}"))

        eval_result = self.autoscaler.evaluate()
        self.assertEqual(eval_result["action"], "SCALE_UP")
        # Workers should have increased to 3
        self.assertEqual(len(self.pool.workers), 3)

    def test_scale_down_on_idle_queue(self):
        self.pool.scale_to(4)
        self.assertEqual(len(self.pool.workers), 4)

        # Queue is empty, utilization is 0
        eval_result = self.autoscaler.evaluate()
        self.assertEqual(eval_result["action"], "SCALE_DOWN")
        self.assertEqual(len(self.pool.workers), 3)


if __name__ == "__main__":
    unittest.main()
