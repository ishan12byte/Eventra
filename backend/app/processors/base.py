"""
Base processor interface demonstrating polymorphism for event consumers.
"""
from abc import ABC, abstractmethod
from typing import Any, Dict
from ..models.event import Event


class BaseProcessor(ABC):
    """
    Abstract Base Class for all event processors.
    Each event type (order, payment, login, support) inherits from this class.
    """

    @property
    @abstractmethod
    def event_type(self) -> str:
        """The event type this processor handles."""
        pass

    @abstractmethod
    def process(self, event: Event) -> Dict[str, Any]:
        """
        Processes an event and returns a result dictionary.
        Raises an Exception if processing fails.
        """
        pass
