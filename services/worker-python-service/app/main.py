from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Awaitable

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from redis.asyncio import Redis

from .config import Settings
from .consumer import EventConsumer
from .db import Database
from .metrics import HTTP_REQUESTS_TOTAL, SERVICE_INFO

settings = Settings.from_env()
logging.basicConfig(
    level=getattr(logging, settings.log_level, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
LOGGER = logging.getLogger(__name__)

METRIC_PATHS = frozenset({"/healthz", "/readyz", "/metrics", "/api/worker/stats"})


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    redis = Redis.from_url(
        settings.redis_url,
        decode_responses=True,
        socket_connect_timeout=3,
        socket_timeout=5,
        health_check_interval=30,
    )
    database = Database(settings)
    consumer = EventConsumer(settings, database, redis)

    app.state.settings = settings
    app.state.redis = redis
    app.state.database = database
    app.state.consumer = consumer
    SERVICE_INFO.labels(settings.app_env, settings.consumer_group).set(1)

    await consumer.start()
    LOGGER.info(
        "worker-python-service started environment=%s stream=%s group=%s",
        settings.app_env,
        settings.stream_key,
        settings.consumer_group,
    )
    try:
        yield
    finally:
        LOGGER.info("worker-python-service shutting down")
        await consumer.stop()
        await redis.aclose()


app = FastAPI(
    title="FitPulse Worker Service",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)


@app.middleware("http")
async def http_middleware(request: Request, call_next: Any) -> Response:
    response: Response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Cache-Control", "no-store")
    path = request.url.path if request.url.path in METRIC_PATHS else "unmatched"
    if path != "/metrics":
        HTTP_REQUESTS_TOTAL.labels(request.method, path, str(response.status_code)).inc()
    return response


async def _dependency_ready(operation: Awaitable[Any]) -> bool:
    try:
        await asyncio.wait_for(operation, timeout=3)
        return True
    except Exception:
        return False


@app.get("/healthz")
async def healthz(request: Request) -> dict[str, str]:
    config: Settings = request.app.state.settings
    return {
        "status": "ok",
        "service": "worker-python-service",
        "environment": config.app_env,
    }


@app.get("/readyz")
async def readyz(request: Request) -> JSONResponse:
    config: Settings = request.app.state.settings
    redis: Redis = request.app.state.redis
    database: Database = request.app.state.database
    consumer: EventConsumer = request.app.state.consumer

    redis_ready, database_ready = await asyncio.gather(
        _dependency_ready(redis.ping()),
        _dependency_ready(database.ping()),
    )
    ready = redis_ready and database_ready and consumer.running

    return JSONResponse(
        status_code=200 if ready else 503,
        content={
            "status": "ready" if ready else "not_ready",
            "service": "worker-python-service",
            "environment": config.app_env,
            "checks": {
                "redis": "ok" if redis_ready else "down",
                "postgres": "ok" if database_ready else "down",
                "consumer": "running" if consumer.running else "stopped",
            },
        },
    )


@app.get("/metrics")
async def metrics() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/api/worker/stats")
async def worker_stats(request: Request) -> dict[str, Any]:
    config: Settings = request.app.state.settings
    consumer: EventConsumer = request.app.state.consumer
    snapshot = await consumer.snapshot()
    return {
        "status": "ok",
        "environment": config.app_env,
        **snapshot,
    }
