"""
Processors registry mapping event types to their dedicated processor implementations.
"""
from typing import Dict
from .base import BaseProcessor
from .order_processor import OrderProcessor
from .payment_processor import PaymentProcessor
from .login_processor import LoginProcessor
from .support_processor import SupportProcessor

PROCESSOR_REGISTRY: Dict[str, BaseProcessor] = {
    "order": OrderProcessor(),
    "payment": PaymentProcessor(),
    "login": LoginProcessor(),
    "support": SupportProcessor(),
}

def get_processor(event_type: str) -> BaseProcessor:
    """Returns the processor matching event_type or defaults to OrderProcessor."""
    return PROCESSOR_REGISTRY.get(event_type, PROCESSOR_REGISTRY["order"])
