"""
Order processor: Validates customer orders and calculates item totals and tax.
"""
from typing import Any, Dict
from ..models.event import Event
from .base import BaseProcessor


class OrderProcessor(BaseProcessor):
    @property
    def event_type(self) -> str:
        return "order"

    def process(self, event: Event) -> Dict[str, Any]:
        payload = event.payload or {}

        # Allow intentional failure simulation for tests and viva demonstration
        if payload.get("simulate_error"):
            raise ValueError(payload.get("error_message", "Simulated order inventory check failure"))

        order_id = payload.get("order_id", f"ord-{event.event_id[-4:]}")
        items = payload.get("items", [{"name": "Standard Item", "quantity": 1, "price": 49.99}])
        customer_id = payload.get("customer_id", "cust_101")

        # Basic calculation
        subtotal = sum(item.get("price", 0) * item.get("quantity", 1) for item in items)
        tax = round(subtotal * 0.08, 2)
        total = round(subtotal + tax, 2)

        return {
            "order_id": order_id,
            "customer_id": customer_id,
            "item_count": len(items),
            "subtotal": round(subtotal, 2),
            "tax": tax,
            "total": total,
            "fulfillment_status": "CONFIRMED",
        }
