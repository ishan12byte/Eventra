"""
Tests for Idempotency and duplicate event prevention (at-least-once delivery protection).
"""
import unittest
from backend.app.broker.broker import EventBroker
from backend.app.database.database import DatabaseManager
from backend.app.models.event import Event


class TestIdempotency(unittest.TestCase):
    def test_duplicate_event_rejection(self):
        db = DatabaseManager("sqlite:///./test_idempotency.db")
        broker = EventBroker(partition_count=2, db=db)

        event = Event(event_id="order_dup_test", event_type="order", partition_key="k1")
        res1 = broker.publish(event)
        self.assertEqual(res1["status"], "ENQUEUED")

        # Simulate worker finishing and acknowledging event
        broker.consume_next("w-1")
        broker.acknowledge("order_dup_test", "w-1", {"status": "OK"}, 20.0)

        # Attempt to publish the exact same event ID again
        res2 = broker.publish(event)
        self.assertEqual(res2["status"], "DUPLICATE_IGNORED")
        self.assertEqual(broker.duplicate_events_prevented, 1)


if __name__ == "__main__":
    unittest.main()
