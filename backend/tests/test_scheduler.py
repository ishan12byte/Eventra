"""
Tests for Scheduler policies: FIFO, Priority, and Least-Loaded.
"""
import unittest
from backend.app.scheduler.scheduler import Scheduler
from backend.app.models.worker import WorkerStats, WorkerState


class DummyWorker:
    def __init__(self, worker_id: str, current_load: float):
        self.stats = WorkerStats(worker_id=worker_id, current_load=current_load)


class TestScheduler(unittest.TestCase):
    def test_policy_switch(self):
        s = Scheduler()
        self.assertEqual(s.policy, "FIFO")
        s.set_policy("PRIORITY")
        self.assertEqual(s.policy, "PRIORITY")
        s.set_policy("LEAST_LOADED")
        self.assertEqual(s.policy, "LEAST_LOADED")

    def test_least_loaded_selection(self):
        s = Scheduler(current_policy="LEAST_LOADED")
        w1 = DummyWorker("w1", current_load=0.9)
        w2 = DummyWorker("w2", current_load=0.1)  # least loaded
        w3 = DummyWorker("w3", current_load=0.5)

        selected = s.select_worker([w1, w2, w3])
        self.assertEqual(selected.stats.worker_id, "w2")


if __name__ == "__main__":
    unittest.main()
