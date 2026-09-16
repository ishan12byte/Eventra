"""
Support processor: Processes customer support tickets and categorizes priority.
"""
from typing import Any, Dict
from ..models.event import Event
from .base import BaseProcessor


class SupportProcessor(BaseProcessor):
    @property
    def event_type(self) -> str:
        return "support"

    def process(self, event: Event) -> Dict[str, Any]:
        payload = event.payload or {}

        if payload.get("simulate_error"):
            raise ValueError(payload.get("error_message", "Simulated support queue database lock"))

        ticket_title = payload.get("title", "General Inquiry")
        category = payload.get("category", "technical")
        user_tier = payload.get("user_tier", "standard")

        sla_hours = 4 if user_tier == "premium" else 24

        return {
            "ticket_number": f"TICK-{event.event_id[-4:]}",
            "title": ticket_title,
            "category": category,
            "assigned_team": f"{category}_support_tier1",
            "sla_response_hours": sla_hours,
            "status": "OPEN",
        }
