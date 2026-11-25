from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any

from redis.asyncio import Redis
from redis.exceptions import RedisError, ResponseError

from .config import Settings
from .db import Database
from .events import EVENT_TYPE_PATTERN, validate_payload
from .metrics import (
    CONSUMER_RUNNING,
    DEAD_LETTERED_TOTAL,
    EVENTS_PROCESSED_TOTAL,
    EVENT_FAILURES_TOTAL,
    LAST_EVENT_TIMESTAMP,
    PENDING_EVENTS,
    STREAM_LENGTH,
)

import uuid
LOGGER = logging.getLogger(__name__)


class EventConsumer:
    def __init__(self, settings: Settings, database: Database, redis: Redis) -> None:
        self.settings = settings
        self._database = database
        self._redis = redis
        self._stop = asyncio.Event()
        self._task: asyncio.Task[None] | None = None
        self._last_reclaim = 0.0
        self.running = False
        self.processed = 0
        self.duplicates = 0
        self.ignored = 0
        self.errors = 0
        self.dead_lettered = 0
        self.last_event_at: str | None = None

    async def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run(), name="fitpulse-redis-consumer")

    async def stop(self) -> None:
        self._stop.set()
        task = self._task
        if task is None:
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        self._task = None

    async def _run(self) -> None:
        try:
            while not self._stop.is_set():
                try:
                    await self._ensure_group()
                    break
                except asyncio.CancelledError:
                    raise
                except Exception as error:
                    LOGGER.warning("consumer group setup failed: %s; retrying", error)
                    await asyncio.sleep(2)

            if self._stop.is_set():
                return

            self.running = True
            CONSUMER_RUNNING.set(1)
            LOGGER.info(
                "consumer started stream=%s group=%s consumer=%s",
                self.settings.stream_key,
                self.settings.consumer_group,
                self.settings.consumer_name,
            )
            await self._consume_loop()
        finally:
            self.running = False
            CONSUMER_RUNNING.set(0)

    async def _ensure_group(self) -> None:
        try:
            await self._redis.xgroup_create(
                self.settings.stream_key,
                self.settings.consumer_group,
                id="0",
                mkstream=True,
            )
            LOGGER.info("created consumer group %s", self.settings.consumer_group)
        except ResponseError as error:
            if "BUSYGROUP" not in str(error):
                raise

    async def _consume_loop(self) -> None:
        while not self._stop.is_set():
            try:
                response = await self._redis.xreadgroup(
                    self.settings.consumer_group,
                    self.settings.consumer_name,
                    {self.settings.stream_key: ">"},
                    count=10,
                    block=2_000,
                )
                await self._refresh_gauges()

                if response:
                    for _stream, messages in response:
                        for message_id, fields in messages:
                            await self._handle_message(message_id, fields)

                now = time.monotonic()
                if now - self._last_reclaim >= 30:
                    self._last_reclaim = now
                    await self._reclaim_pending()
            except asyncio.CancelledError:
                raise
            except (RedisError, OSError) as error:
                LOGGER.warning("redis stream read failed: %s", error)
                await asyncio.sleep(2)
            except Exception:
                LOGGER.exception("unexpected consumer loop failure")
                await asyncio.sleep(2)

    async def _reclaim_pending(self) -> None:
        try:
            result = await self._redis.xautoclaim(
                self.settings.stream_key,
                self.settings.consumer_group,
                self.settings.consumer_name,
                min_idle_time=60_000,
                start_id="0-0",
                count=10,
            )
        except (RedisError, OSError) as error:
            LOGGER.warning("pending event reclaim failed: %s", error)
            return

        if not result or len(result) < 2:
            return

        for message in result[1] or []:
            if not isinstance(message, (list, tuple)) or len(message) != 2:
                continue
            message_id, fields = message
            await self._handle_message(message_id, fields)

        await self._refresh_gauges()

    async def _handle_message(self, message_id: str, fields: Any) -> None:
        if not isinstance(fields, dict):
            await self._dead_letter(message_id, fields, ValueError("Event fields are not an object"))
            return

        raw_event = fields.get("event")
        if not isinstance(raw_event, str):
            await self._dead_letter(message_id, fields, ValueError("Missing event payload"))
            return

        try:
            payload = json.loads(raw_event)
            event_id, event_type, data = validate_payload(payload)
        except (json.JSONDecodeError, ValueError) as error:
            await self._dead_letter(message_id, fields, error)
            return

        try:
            if event_type == "order.created":
                inserted = await self._database.process_order_created(
                    event_id,
                    event_type,
                    self.settings.consumer_name,
                    data,
                )
                result = "processed" if inserted else "duplicate"
                if inserted:
                    self.processed += 1
                else:
                    self.duplicates += 1
            else:
                result = "ignored"
                self.ignored += 1

            await self._redis.xack(
                self.settings.stream_key,
                self.settings.consumer_group,
                message_id,
            )
            EVENTS_PROCESSED_TOTAL.labels(event_type, result).inc()
            self.last_event_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
            LAST_EVENT_TIMESTAMP.set(time.time())
            LOGGER.info("event %s type=%s result=%s", message_id, event_type, result)
        except asyncio.CancelledError:
            raise
        except Exception:
            self.errors += 1
            EVENT_FAILURES_TOTAL.labels(reason="processing").inc()
            LOGGER.exception("event %s failed; leaving it pending for retry", message_id)

    @staticmethod
    def _validate_payload(payload: Any) -> tuple[str, str, dict[str, Any]]:
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

    async def _dead_letter(self, message_id: str, fields: Any, error: Exception) -> None:
        serialized = json.dumps(fields, default=str)[:4_000]
        try:
            await self._redis.xadd(
                self.settings.dead_letter_key,
                {
                    "source_stream": self.settings.stream_key,
                    "source_id": str(message_id),
                    "error": str(error)[:500],
                    "payload": serialized,
                },
                maxlen=5_000,
                approximate=True,
            )
            await self._redis.xack(
                self.settings.stream_key,
                self.settings.consumer_group,
                message_id,
            )
            self.dead_lettered += 1
            DEAD_LETTERED_TOTAL.inc()
            EVENT_FAILURES_TOTAL.labels(reason="invalid_message").inc()
            LOGGER.error("event %s moved to dead-letter stream: %s", message_id, error)
        except asyncio.CancelledError:
            raise
        except Exception:
            LOGGER.exception("failed to dead-letter invalid event %s", message_id)

    async def _refresh_gauges(self) -> None:
        try:
            STREAM_LENGTH.set(await self._redis.xlen(self.settings.stream_key))
            pending = await self._redis.xpending(
                self.settings.stream_key,
                self.settings.consumer_group,
            )
            if isinstance(pending, dict):
                PENDING_EVENTS.set(int(pending.get("pending", 0)))
        except (RedisError, OSError):
            return

    async def snapshot(self) -> dict[str, Any]:
        stream_length = 0
        pending = 0
        queue_available = True
        try:
            stream_length = int(await self._redis.xlen(self.settings.stream_key))
            pending_info = await self._redis.xpending(
                self.settings.stream_key,
                self.settings.consumer_group,
            )
            if isinstance(pending_info, dict):
                pending = int(pending_info.get("pending", 0))
        except (RedisError, OSError):
            queue_available = False

        return {
            "consumer_group": self.settings.consumer_group,
            "consumer": self.settings.consumer_name,
            "stream": self.settings.stream_key,
            "running": self.running,
            "queue_available": queue_available,
            "stream_length": stream_length,
            "pending": pending,
            "processed": self.processed,
            "duplicates": self.duplicates,
            "ignored": self.ignored,
            "errors": self.errors,
            "dead_lettered": self.dead_lettered,
            "last_event_at": self.last_event_at,
        }
