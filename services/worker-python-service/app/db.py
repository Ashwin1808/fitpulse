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
