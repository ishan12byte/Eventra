"""
Login processor: Processes user authentication events and device detection.
"""
from typing import Any, Dict
from ..models.event import Event
from .base import BaseProcessor


class LoginProcessor(BaseProcessor):
    @property
    def event_type(self) -> str:
        return "login"

    def process(self, event: Event) -> Dict[str, Any]:
        payload = event.payload or {}

        if payload.get("simulate_error"):
            raise ValueError(payload.get("error_message", "Simulated auth directory unavailable"))

        username = payload.get("username", "student_user")
        ip_address = payload.get("ip_address", "192.168.1.100")
        device = payload.get("device", "Mozilla/5.0 WebClient")

        return {
            "session_id": f"sess_{event.event_id[-6:]}",
            "username": username,
            "ip_address": ip_address,
            "device": device,
            "auth_level": "MFA_VERIFIED",
            "access_granted": True,
        }
