"""
Tests for horizontal partitioning, offset generation, and queue policies.
"""
import unittest
from backend.app.broker.partition import Partition, hash_partition_key
from backend.app.models.event import Event


class TestPartition(unittest.TestCase):
    def test_consistent_hashing(self):
        # The same key MUST consistently map to the exact same partition
        key = "customer_vip_42"
        p1 = hash_partition_key(key, 4)
        p2 = hash_partition_key(key, 4)
        p3 = hash_partition_key(key, 4)
        self.assertEqual(p1, p2)
        self.assertEqual(p2, p3)
        self.assertTrue(0 <= p1 < 4)

    def test_partition_offset_increment(self):
        p = Partition(partition_id=0)
        e1 = Event(event_type="order", partition_key="k1")
        e2 = Event(event_type="order", partition_key="k2")

        off1 = p.enqueue(e1)
        off2 = p.enqueue(e2)

        self.assertEqual(off1, 1)
        self.assertEqual(off2, 2)
        self.assertEqual(p.size(), 2)

    def test_priority_dequeue(self):
        p = Partition(partition_id=1)
        low = Event(event_id="e_low", priority=1)
        critical = Event(event_id="e_crit", priority=3)
        medium = Event(event_id="e_med", priority=2)

        p.enqueue(low)
        p.enqueue(critical)
        p.enqueue(medium)

        # Dequeuing by priority should yield critical (priority 3) first
        first = p.dequeue_priority()
        self.assertEqual(first.event_id, "e_crit")
        second = p.dequeue_priority()
        self.assertEqual(second.event_id, "e_med")
        third = p.dequeue_priority()
        self.assertEqual(third.event_id, "e_low")


if __name__ == "__main__":
    unittest.main()
