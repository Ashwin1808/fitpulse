from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from .config import Settings
from .db import Database
from .metrics import FULFILMENT_ADVANCED_TOTAL, FULFILMENT_SIMULATOR_RUNNING

LOGGER = logging.getLogger(__name__)


class FulfilmentSimulator:
    def __init__(self, settings: Settings, database: Database) -> None:
        self.settings = settings
        self._database = database
        self._stop = asyncio.Event()
        self._task: asyncio.Task[None] | None = None
        self.running = False
        self.advanced = 0
        self.last_advanced_at: float | None = None
        self.last_order_number: str | None = None

    async def start(self) -> None:
        if not self.settings.fulfilment_simulator_enabled:
            LOGGER.info("fulfilment simulator disabled")
            return
        if self._task is not None and not self._task.done():
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run(), name="fitpulse-fulfilment-simulator")

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
            FULFILMENT_SIMULATOR_RUNNING.set(1)
            LOGGER.info(
                "fulfilment simulator started interval=%ss",
                self.settings.fulfilment_simulator_interval_seconds,
            )
            while not self._stop.is_set():
                await self._advance_once()
                await asyncio.sleep(self.settings.fulfilment_simulator_interval_seconds)
        finally:
            self.running = False
            FULFILMENT_SIMULATOR_RUNNING.set(0)

    async def _advance_once(self) -> None:
        try:
            result = await self._database.advance_fulfilment()
        except Exception:
            LOGGER.exception("fulfilment simulator failed to advance tracking")
            return
        if result is None:
            return
        self.advanced += 1
        self.last_advanced_at = time.time()
        self.last_order_number = result["order_number"]
        FULFILMENT_ADVANCED_TOTAL.inc()
        LOGGER.info(
            "advanced %s %s -> %s",
            result["order_number"],
            result["from_status"],
            result["to_status"],
        )

    async def snapshot(self) -> dict[str, Any]:
        return {
            "enabled": self.settings.fulfilment_simulator_enabled,
            "running": self.running,
            "advanced": self.advanced,
            "last_advanced_at": self.last_advanced_at,
            "last_order_number": self.last_order_number,
        }
