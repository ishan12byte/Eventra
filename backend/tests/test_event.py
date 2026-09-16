"""
Tests for Event model creation, state serialization, and defaults.
"""
import unittest
import time
from backend.app.models.event import Event, EventStatus


class TestEventModel(unittest.TestCase):
    def test_event_creation_defaults(self):
        event = Event(event_type="order", partition_key="user_123")
        self.assertTrue(event.event_id.startswith("evt_"))
        self.assertEqual(event.event_type, "order")
        self.assertEqual(event.partition_key, "user_123")
        self.assertEqual(event.status, EventStatus.PENDING)
        self.assertEqual(event.priority, 1)
        self.assertEqual(event.retry_count, 0)
        self.assertEqual(event.max_retries, 3)

    def test_to_dict_and_from_dict(self):
        event = Event(
            event_id="test-123",
            event_type="payment",
            partition_key="cust_999",
            priority=2,
            payload={"amount": 250.0, "currency": "USD"},
            status=EventStatus.PROCESSING,
        )
        d = event.to_dict()
        self.assertEqual(d["event_id"], "test-123")
        self.assertEqual(d["status"], "PROCESSING")
        self.assertEqual(d["payload"]["amount"], 250.0)

        restored = Event.from_dict(d)
        self.assertEqual(restored.event_id, "test-123")
        self.assertEqual(restored.status, EventStatus.PROCESSING)
        self.assertEqual(restored.payload["currency"], "USD")


if __name__ == "__main__":
    unittest.main()
