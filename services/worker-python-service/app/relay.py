from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from redis.asyncio import Redis

from .config import Settings
from .db import Database
from .metrics import OUTBOX_RELAY_PUBLISHED_TOTAL, OUTBOX_RELAY_RUNNING, OUTBOX_UNPUBLISHED

LOGGER = logging.getLogger(__name__)


class OutboxRelay:
    def __init__(self, settings: Settings, database: Database, redis: Redis) -> None:
        self.settings = settings
        self._database = database
        self._redis = redis
        self._stop = asyncio.Event()
        self._task: asyncio.Task[None] | None = None
        self.running = False
        self.published = 0
        self.failed = 0
        self.last_relay_at: float | None = None

    async def start(self) -> None:
        if not self.settings.outbox_relay_enabled:
            LOGGER.info("outbox relay disabled")
            return
        if self._task is not None and not self._task.done():
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run(), name="fitpulse-outbox-relay")

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
            self.running = True
            OUTBOX_RELAY_RUNNING.set(1)
            LOGGER.info(
                "outbox relay started stream=%s interval=%ss",
                self.settings.stream_key,
                self.settings.outbox_relay_interval_seconds,
            )
            while not self._stop.is_set():
                await self._relay_once()
                await asyncio.sleep(self.settings.outbox_relay_interval_seconds)
        finally:
            self.running = False
            OUTBOX_RELAY_RUNNING.set(0)

    async def _relay_once(self) -> None:
        try:
            rows = await self._database.fetch_unpublished_outbox(limit=20)
        except Exception:
            LOGGER.exception("failed to fetch unpublished outbox events")
            return

        for row in rows:
            await self._publish(row)
        self.last_relay_at = time.time()
        await self._refresh_gauge()

    async def _publish(self, row: dict[str, Any]) -> None:
        event_id = str(row.get("id") or "")
        payload = row.get("payload")
        try:
            if not isinstance(payload, dict):
                raise ValueError("outbox payload must be an object")
            payload_event_id = payload.get("event_id")
            event_type = payload.get("type")
            if not isinstance(payload_event_id, str) or not isinstance(event_type, str):
                raise ValueError("outbox payload is missing event_id or type")
            if event_id and payload_event_id != event_id:
                raise ValueError("outbox id does not match payload event_id")

            await self._redis.xadd(
                self.settings.stream_key,
                {
                    "event": json.dumps(payload, separators=(",", ":")),
                    "event_type": event_type,
                    "event_id": payload_event_id,
                },
            )
            await self._database.mark_outbox_published(payload_event_id)
            self.published += 1
            OUTBOX_RELAY_PUBLISHED_TOTAL.labels("published").inc()
            LOGGER.info("outbox event %s published to stream", payload_event_id)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            self.failed += 1
            OUTBOX_RELAY_PUBLISHED_TOTAL.labels("failed").inc()
            LOGGER.warning("failed to publish outbox event %s: %s", event_id, error)
            if event_id:
                try:
                    await self._database.record_outbox_failure(event_id, str(error))
                except Exception:
                    LOGGER.exception("failed to record outbox failure for %s", event_id)

    async def _refresh_gauge(self) -> None:
        try:
            OUTBOX_UNPUBLISHED.set(await self._database.count_unpublished_outbox())
        except Exception:
            LOGGER.debug("failed to refresh unpublished outbox gauge", exc_info=True)

    async def snapshot(self) -> dict[str, Any]:
        unpublished: int | None = None
        try:
            unpublished = await self._database.count_unpublished_outbox()
            OUTBOX_UNPUBLISHED.set(unpublished)
        except Exception:
            unpublished = None
        return {
            "enabled": self.settings.outbox_relay_enabled,
            "running": self.running,
            "unpublished": unpublished,
            "published": self.published,
            "failed": self.failed,
            "last_relay_at": self.last_relay_at,
        }
