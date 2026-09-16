"""
Scheduler policies for distributing work across workers and partitions.
Demonstrates:
- FIFO (First-In First-Out)
- Priority-based (Higher priority events processed before lower priority ones)
- Least-Loaded Worker (Dispatches tasks to the worker with minimum current active load)
"""
from typing import Any, List, Optional
from ..models.event import Event


class Scheduler:
    """
    Coordinates event selection and worker assignment according to configurable policies.
    """

    POLICIES = ["FIFO", "PRIORITY", "LEAST_LOADED"]

    def __init__(self, current_policy: str = "FIFO"):
        self.policy = current_policy if current_policy in self.POLICIES else "FIFO"

    def set_policy(self, policy_name: str) -> bool:
        if policy_name.upper() in self.POLICIES:
            self.policy = policy_name.upper()
            return True
        return False

    def select_worker(self, workers: List[Any]) -> Optional[Any]:
        """
        For LEAST_LOADED policy: selects the worker with lowest active load.
        For other policies: returns the first available idle worker.
        """
        if not workers:
            return None

        if self.policy == "LEAST_LOADED":
            # Pick worker with minimum load
            return min(workers, key=lambda w: w.stats.current_load)

        # Default: first idle worker or first worker
        for w in workers:
            if w.stats.current_load == 0:
                return w
        return workers[0]
