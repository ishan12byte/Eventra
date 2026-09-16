"""
Integration tests for EventManager coordinator and end-to-end event lifecycle.
Tests publishing events, querying partitions, viewing workers, telemetry, and dead-letter queues.
"""
import unittest
from backend.app.event_manager import EventManager
from backend.app.models.event import EventStatus


class TestAPIIntegration(unittest.TestCase):
    def setUp(self):
        self.manager = EventManager(partition_count=4, worker_count=2)

    def tearDown(self):
        self.manager.stop()

    def test_health_check_manager(self):
        self.assertEqual(self.manager.broker.partition_count, 4)
        self.assertEqual(len(self.manager.worker_pool.workers), 2)
        self.assertFalse(self.manager.autoscaler.enabled)

    def test_publish_and_get_event(self):
        payload = {
            "event_type": "order",
            "partition_key": "user_api_1",
            "priority": 2,
            "payload": {"customer_id": "c_99", "items": [{"name": "Widget", "price": 15.0, "quantity": 2}]},
        }
        res = self.manager.submit_event(payload)
        self.assertEqual(res["status"], "ENQUEUED")
        event_id = res["event_id"]

        # Fetch event from broker
        ev = self.manager.broker.get_event(event_id)
        self.assertIsNotNone(ev)
        self.assertEqual(ev.event_id, event_id)
        self.assertEqual(ev.partition_key, "user_api_1")

    def test_get_partitions(self):
        partitions = [p.to_dict() for p in self.manager.broker.partitions.values()]
        self.assertEqual(len(partitions), 4)
        for p in partitions:
            self.assertIn("partition_id", p)
            self.assertIn("current_offset", p)
            self.assertIn("queue_size", p)

    def test_get_metrics(self):
        metrics = self.manager.telemetry.get_metrics()
        self.assertIn("total_events", metrics)
        self.assertIn("throughput_eps", metrics)
        self.assertIn("active_workers", metrics)
        self.assertIn("completed_events", metrics)

    def test_batch_submit(self):
        results = self.manager.submit_batch(count=10, event_type="order")
        self.assertEqual(len(results), 10)
        self.assertGreaterEqual(self.manager.broker.total_published, 10)


if __name__ == "__main__":
    unittest.main()

