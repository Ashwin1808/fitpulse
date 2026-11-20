from __future__ import annotations

import unittest

from app.consumer import EventConsumer


class ValidatePayloadTests(unittest.TestCase):
    def test_order_created_normalizes_order_number(self) -> None:
        event_id, event_type, data = EventConsumer._validate_payload(
            {
                "event_id": "123e4567-e89b-12d3-a456-426614174000",
                "type": "order.created",
                "data": {
                    "order_id": 42,
                    "order_number": " fp-20261120-abc123 ",
                },
            }
        )

        self.assertEqual(event_id, "123e4567-e89b-12d3-a456-426614174000")
        self.assertEqual(event_type, "order.created")
        self.assertEqual(data["order_id"], 42)
        self.assertEqual(data["order_number"], "FP-20261120-ABC123")

    def test_unknown_event_type_returns_empty_data(self) -> None:
        event_id, event_type, data = EventConsumer._validate_payload(
            {
                "event_id": "123e4567-e89b-12d3-a456-426614174000",
                "type": "order.shipped",
            }
        )

        self.assertEqual(event_id, "123e4567-e89b-12d3-a456-426614174000")
        self.assertEqual(event_type, "order.shipped")
        self.assertEqual(data, {})

    def test_invalid_event_id_rejected(self) -> None:
        with self.assertRaises(ValueError):
            EventConsumer._validate_payload(
                {"event_id": "not-a-uuid", "type": "order.created", "data": {}}
            )

    def test_order_created_requires_data(self) -> None:
        with self.assertRaises(ValueError):
            EventConsumer._validate_payload(
                {
                    "event_id": "123e4567-e89b-12d3-a456-426614174000",
                    "type": "order.created",
                }
            )


if __name__ == "__main__":
    unittest.main()
