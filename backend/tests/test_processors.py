"""
Tests for domain processors: Order, Payment, Login, and Support.
"""
import unittest
from backend.app.models.event import Event
from backend.app.processors.order_processor import OrderProcessor
from backend.app.processors.payment_processor import PaymentProcessor
from backend.app.processors.login_processor import LoginProcessor
from backend.app.processors.support_processor import SupportProcessor


class TestProcessors(unittest.TestCase):
    def test_order_processor(self):
        proc = OrderProcessor()
        event = Event(
            event_id="ord_1",
            event_type="order",
            payload={"items": [{"name": "Book", "price": 20.0, "quantity": 2}]},
        )
        res = proc.process(event)
        self.assertEqual(res["subtotal"], 40.0)
        self.assertEqual(res["tax"], 3.2)
        self.assertEqual(res["total"], 43.2)

    def test_order_processor_simulated_error(self):
        proc = OrderProcessor()
        event = Event(
            event_id="ord_err",
            event_type="order",
            payload={"simulate_error": True, "error_message": "Out of stock"},
        )
        with self.assertRaises(ValueError):
            proc.process(event)

    def test_payment_processor(self):
        proc = PaymentProcessor()
        event = Event(
            event_id="pay_1",
            event_type="payment",
            payload={"amount": 99.5, "currency": "USD"},
        )
        res = proc.process(event)
        self.assertEqual(res["amount"], 99.5)
        self.assertEqual(res["settlement_status"], "SETTLED")

    def test_login_processor(self):
        proc = LoginProcessor()
        event = Event(
            event_id="log_1",
            event_type="login",
            payload={"username": "rahul_student", "ip_address": "10.0.0.5"},
        )
        res = proc.process(event)
        self.assertTrue(res["access_granted"])
        self.assertEqual(res["username"], "rahul_student")

    def test_support_processor(self):
        proc = SupportProcessor()
        event = Event(
            event_id="sup_1",
            event_type="support",
            payload={"title": "Cannot login", "category": "billing", "user_tier": "premium"},
        )
        res = proc.process(event)
        self.assertEqual(res["sla_response_hours"], 4)
        self.assertEqual(res["category"], "billing")


if __name__ == "__main__":
    unittest.main()
