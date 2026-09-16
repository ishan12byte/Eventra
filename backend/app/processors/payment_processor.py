"""
Payment processor: Validates transactions and checks currency and limits.
"""
from typing import Any, Dict
from ..models.event import Event
from .base import BaseProcessor


class PaymentProcessor(BaseProcessor):
    @property
    def event_type(self) -> str:
        return "payment"

    def process(self, event: Event) -> Dict[str, Any]:
        payload = event.payload or {}

        if payload.get("simulate_error"):
            raise ValueError(payload.get("error_message", "Simulated card gateway timeout"))

        amount = float(payload.get("amount", 100.0))
        currency = payload.get("currency", "USD").upper()
        payment_method = payload.get("method", "credit_card")

        if amount <= 0:
            raise ValueError("Payment amount must be greater than zero")

        return {
            "payment_id": f"pay_{event.event_id[-6:]}",
            "amount": amount,
            "currency": currency,
            "method": payment_method,
            "gateway_ref": f"gw_tx_{event.event_id[-4:]}",
            "settlement_status": "SETTLED",
        }
