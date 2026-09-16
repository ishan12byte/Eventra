"""
Tests for Acknowledgement (ACK), Retry handling, and Dead Letter Queue (DLQ).
"""
import unittest
from backend.app.broker.broker import EventBroker
from backend.app.database.database import DatabaseManager
from backend.app.models.event import Event, EventStatus


class TestAckRetryDLQ(unittest.TestCase):
    def setUp(self):
        # Use an isolated test database
        self.db = DatabaseManager("sqlite:///./test_events.db")
        self.broker = EventBroker(partition_count=2, db=self.db)

    def test_successful_acknowledgement(self):
        event = Event(event_id="ack_test_1", event_type="order", partition_key="key1")
        self.broker.publish(event)

        # Worker consumes event
        consumed = self.broker.consume_next(worker_id="w-1")
        self.assertIsNotNone(consumed)
        self.assertEqual(consumed.status, EventStatus.PROCESSING)

        # Worker completes processing and ACKs
        acked = self.broker.acknowledge(
            event_id="ack_test_1",
            worker_id="w-1",
            result={"status": "CONFIRMED"},
            duration_ms=45.2,
        )
        self.assertEqual(acked.status, EventStatus.COMPLETED)
        self.assertIn("ack_test_1", self.broker.processed_event_ids)

    def test_retry_mechanism(self):
        event = Event(event_id="retry_test_1", event_type="payment", partition_key="key1", max_retries=2)
        self.broker.publish(event)
        self.broker.consume_next("w-1")

        # First failure
        self.broker.report_failure("retry_test_1", "w-1", "Timeout Error")
        self.assertEqual(event.retry_count, 1)
        self.assertEqual(event.status, EventStatus.RETRYING)
        self.assertEqual(self.broker.get_total_queue_size(), 1)

    def test_dead_letter_queue_after_max_retries(self):
        event = Event(event_id="dlq_test_1", event_type="payment", partition_key="key1", max_retries=1)
        self.broker.publish(event)
        self.broker.consume_next("w-1")

        # 1st failure -> retried
        self.broker.report_failure("dlq_test_1", "w-1", "Gateway 503")
        self.assertEqual(event.status, EventStatus.RETRYING)

        # Re-consumed
        self.broker.consume_next("w-1")
        # 2nd failure -> exceeds max_retries of 1 -> moved to DLQ
        self.broker.report_failure("dlq_test_1", "w-1", "Gateway 503 Still Failing")
        self.assertEqual(event.status, EventStatus.DEAD_LETTER)
        self.assertEqual(len(self.broker.dlq), 1)
        self.assertEqual(self.broker.dlq[0].event_id, "dlq_test_1")


if __name__ == "__main__":
    unittest.main()
