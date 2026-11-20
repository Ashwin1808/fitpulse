from __future__ import annotations

import re
import uuid
from typing import Any

ORDER_NUMBER_PATTERN = re.compile(r"^[A-Z0-9-]{3,64}$")
EVENT_TYPE_PATTERN = re.compile(r"^[a-z][a-z0-9_.-]{0,63}$")


def validate_payload(payload: Any) -> tuple[str, str, dict[str, Any]]:
    if not isinstance(payload, dict):
        raise ValueError("Event payload must be an object")

    event_id = payload.get("event_id")
    event_type = payload.get("type")
    if not isinstance(event_id, str):
        raise ValueError("event_id is required")
    try:
        uuid.UUID(event_id)
    except ValueError as error:
        raise ValueError("event_id must be a UUID") from error
    if not isinstance(event_type, str) or not EVENT_TYPE_PATTERN.fullmatch(event_type):
        raise ValueError("type must be a valid event type")
    if event_type != "order.created":
        return event_id, event_type, {}

    data = payload.get("data")
    if not isinstance(data, dict):
        raise ValueError("data is required for order.created")
    order_id = data.get("order_id")
    order_number = data.get("order_number")
    if isinstance(order_id, bool) or not isinstance(order_id, int) or order_id <= 0:
        raise ValueError("order_id must be a positive integer")
    if not isinstance(order_number, str):
        raise ValueError("order_number is required")
    normalized_order_number = order_number.strip().upper()
    if not ORDER_NUMBER_PATTERN.fullmatch(normalized_order_number):
        raise ValueError("order_number is invalid")

    return event_id, event_type, {
        "order_id": order_id,
        "order_number": normalized_order_number,
    }
