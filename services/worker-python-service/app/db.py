from __future__ import annotations

from typing import Any

import psycopg

from .config import Settings


class Database:
    def __init__(self, settings: Settings) -> None:
        self._connection_options = {
            "host": settings.db_host,
            "port": settings.db_port,
            "dbname": settings.db_name,
            "user": settings.db_user,
            "password": settings.db_password,
            "application_name": "fitpulse-worker",
        }

    async def ping(self) -> None:
        async with await psycopg.AsyncConnection.connect(
            connect_timeout=3,
            **self._connection_options,
        ) as connection:
            await connection.execute("SELECT 1")

    async def process_order_created(
        self,
        event_id: str,
        event_type: str,
        consumer: str,
        data: dict[str, Any],
    ) -> bool:
        order_id = data["order_id"]
        order_number = data["order_number"]
        tracking_code = f"FPX-{order_number}"

        async with await psycopg.AsyncConnection.connect(
            connect_timeout=5,
            **self._connection_options,
        ) as connection:
            async with connection.transaction():
                cursor = await connection.execute(
                    """
                    INSERT INTO processed_events (event_id, event_type, consumer)
                    VALUES (%s::uuid, %s, %s)
                    ON CONFLICT (event_id) DO NOTHING
                    RETURNING event_id
                    """,
                    (event_id, event_type, consumer),
                )
                if await cursor.fetchone() is None:
                    return False

                cursor = await connection.execute(
                    """
                    INSERT INTO order_tracking
                        (order_id, order_number, status, carrier, tracking_code, estimated_delivery)
                    VALUES (%s, %s, 'PROCESSING', 'FitPulse Express', %s, CURRENT_DATE + 3)
                    ON CONFLICT (order_number) DO UPDATE
                    SET status = CASE
                            WHEN order_tracking.status IN ('SHIPPED', 'IN_TRANSIT', 'DELIVERED')
                            THEN order_tracking.status
                            ELSE 'PROCESSING'
                        END,
                        updated_at = now()
                    RETURNING id
                    """,
                    (order_id, order_number, tracking_code),
                )
                row = await cursor.fetchone()
                if row is None:
                    raise RuntimeError("Unable to create order tracking record")
                tracking_id = row[0]

                await connection.execute(
                    """
                    UPDATE orders
                    SET status = 'PROCESSING'
                    WHERE id = %s AND status = 'CONFIRMED'
                    """,
                    (order_id,),
                )

                await connection.execute(
                    """
                    INSERT INTO tracking_events (tracking_id, status, message)
                    VALUES
                        (%s, 'CONFIRMED', 'Order received and confirmed by FitPulse.'),
                        (%s, 'PROCESSING', 'Payment verified. Your order is being prepared for dispatch.')
                    """,
                    (tracking_id, tracking_id),
                )
                return True

    async def fetch_unpublished_outbox(self, limit: int = 20) -> list[dict[str, Any]]:
        async with await psycopg.AsyncConnection.connect(
            connect_timeout=5,
            **self._connection_options,
        ) as connection:
            cursor = await connection.execute(
                """
                SELECT id, payload
                FROM outbox_events
                WHERE published_at IS NULL
                ORDER BY created_at, id
                LIMIT %s
                """,
                (limit,),
            )
            rows = await cursor.fetchall()
        return [{"id": str(row[0]), "payload": row[1]} for row in rows]

    async def mark_outbox_published(self, event_id: str) -> None:
        async with await psycopg.AsyncConnection.connect(
            connect_timeout=5,
            **self._connection_options,
        ) as connection:
            await connection.execute(
                """
                UPDATE outbox_events
                SET published_at = now(), attempts = attempts + 1, last_error = NULL
                WHERE id = %s::uuid AND published_at IS NULL
                """,
                (event_id,),
            )

    async def record_outbox_failure(self, event_id: str, message: str) -> None:
        async with await psycopg.AsyncConnection.connect(
            connect_timeout=5,
            **self._connection_options,
        ) as connection:
            await connection.execute(
                """
                UPDATE outbox_events
                SET attempts = attempts + 1, last_error = %s
                WHERE id = %s::uuid AND published_at IS NULL
                """,
                (message[:500], event_id),
            )

    async def count_unpublished_outbox(self) -> int:
        async with await psycopg.AsyncConnection.connect(
            connect_timeout=5,
            **self._connection_options,
        ) as connection:
            cursor = await connection.execute(
                "SELECT count(*) FROM outbox_events WHERE published_at IS NULL"
            )
            row = await cursor.fetchone()
        return int(row[0]) if row else 0

    async def advance_fulfilment(self) -> dict[str, str] | None:
        next_status_by_status = {
            "PROCESSING": "SHIPPED",
            "SHIPPED": "IN_TRANSIT",
            "IN_TRANSIT": "DELIVERED",
        }
        messages = {
            "SHIPPED": "Order shipped and handed to FitPulse Express.",
            "IN_TRANSIT": "Shipment is moving through the local delivery network.",
            "DELIVERED": "Shipment delivered. Enjoy your FitPulse gear.",
        }

        async with await psycopg.AsyncConnection.connect(
            connect_timeout=5,
            **self._connection_options,
        ) as connection:
            async with connection.transaction():
                cursor = await connection.execute(
                    """
                    SELECT id, order_number, status
                    FROM order_tracking
                    WHERE status IN ('PROCESSING', 'SHIPPED', 'IN_TRANSIT')
                    ORDER BY updated_at, id
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                    """
                )
                row = await cursor.fetchone()
                if row is None:
                    return None

                tracking_id, order_number, status = row
                next_status = next_status_by_status[status]

                await connection.execute(
                    """
                    UPDATE order_tracking
                    SET status = %s, updated_at = now()
                    WHERE id = %s
                    """,
                    (next_status, tracking_id),
                )
                await connection.execute(
                    """
                    UPDATE orders
                    SET status = %s, updated_at = now()
                    WHERE order_number = %s AND status <> 'CANCELLED'
                    """,
                    (next_status, order_number),
                )
                await connection.execute(
                    """
                    INSERT INTO tracking_events (tracking_id, status, message)
                    VALUES (%s, %s, %s)
                    """,
                    (tracking_id, next_status, messages[next_status]),
                )
                return {
                    "order_number": order_number,
                    "from_status": status,
                    "to_status": next_status,
                }
