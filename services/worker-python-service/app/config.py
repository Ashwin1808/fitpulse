from __future__ import annotations

import os
import socket
from dataclasses import dataclass


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def _string(name: str, fallback: str) -> str:
    value = os.getenv(name, "").strip()
    return value or fallback


def _positive_int(name: str, fallback: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return fallback
    try:
        value = int(raw)
    except ValueError as error:
        raise RuntimeError(f"{name} must be a positive integer") from error
    if value <= 0:
        raise RuntimeError(f"{name} must be a positive integer")
    return value


@dataclass(frozen=True)
class Settings:
    app_env: str
    db_host: str
    db_port: int
    db_name: str
    db_user: str
    db_password: str
    redis_url: str
    stream_key: str
    dead_letter_key: str
    consumer_group: str
    consumer_name: str
    log_level: str

    @classmethod
    def from_env(cls) -> "Settings":
        default_consumer = f"{socket.gethostname()}-{os.getpid()}"
        stream_key = _string("WORKER_STREAM_KEY", "fitpulse:events")
        return cls(
            app_env=_string("APP_ENV", "dev"),
            db_host=_string("DB_HOST", "localhost"),
            db_port=_positive_int("DB_PORT", 5432),
            db_name=_string("DB_NAME", "fitpulse"),
            db_user=_string("DB_USER", "fitpulse"),
            db_password=_required("DB_PASSWORD"),
            redis_url=_string("REDIS_URL", "redis://localhost:6379/0"),
            stream_key=stream_key,
            dead_letter_key=_string("WORKER_DEAD_LETTER_KEY", f"{stream_key}:dead"),
            consumer_group=_string("WORKER_CONSUMER_GROUP", "fitpulse-workers"),
            consumer_name=_string("WORKER_CONSUMER_NAME", default_consumer),
            log_level=_string("LOG_LEVEL", "info").upper(),
        )
