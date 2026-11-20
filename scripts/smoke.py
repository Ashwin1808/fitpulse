#!/usr/bin/env python3
"""End-to-end smoke test for the FitPulse Compose stack.

Requires the stack to be running, for example:
    docker compose up --build -d
    python3 scripts/smoke.py
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

BASE_URL = os.getenv("BASE_URL", "http://localhost:8080").rstrip("/")
TRACK_TIMEOUT_SECONDS = int(os.getenv("TRACK_TIMEOUT_SECONDS", "45"))


def request(method: str, path: str, body: dict | None = None, timeout: int = 10):
    url = f"{BASE_URL}{path}"
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            payload = json.loads(raw) if raw else {}
            return response.status, payload, dict(response.headers)
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"error": raw}
        return error.code, payload, dict(error.headers or {})


def expect_ok(step: str, method: str, path: str, expected: int = 200, body: dict | None = None):
    status, payload, headers = request(method, path, body=body)
    if status != expected:
        raise RuntimeError(f"{step}: expected HTTP {expected}, got {status}: {payload}")
    print(f"PASS {step}: {method} {path} -> {status}")
    return payload, headers


def main() -> int:
    health, headers = expect_ok("web health", "GET", "/healthz")
    if headers.get("X-Request-Id") is None:
        raise RuntimeError("web health did not return X-Request-Id")
    if health.get("status") != "ok":
        raise RuntimeError(f"unexpected health payload: {health}")

    products, _ = expect_ok("product catalog", "GET", "/api/products")
    if not products.get("products"):
        raise RuntimeError("product catalog is empty")

    foods, _ = expect_ok("food catalog", "GET", "/api/foods")
    if not foods.get("foods"):
        raise RuntimeError("food catalog is empty")

    calories, _ = expect_ok(
        "calorie calculation",
        "POST",
        "/api/calories/calculate",
        body={"food_id": 1, "quantity": 1},
    )
    if calories.get("totals", {}).get("calories", 0) <= 0:
        raise RuntimeError(f"invalid calorie calculation: {calories}")

    worker, _ = expect_ok("worker stats", "GET", "/api/worker/stats")
    if worker.get("running") is not True:
        raise RuntimeError(f"worker consumer is not running: {worker}")

    email = f"smoke-{uuid.uuid4().hex[:10]}@example.com"
    order_result, _ = expect_ok(
        "place order",
        "POST",
        "/api/orders",
        expected=201,
        body={
            "customer_name": "Smoke Test",
            "customer_email": email,
            "items": [{"product_id": 1, "quantity": 1}],
        },
    )
    order = order_result.get("order", {})
    order_number = order.get("order_number")
    if not order_number:
        raise RuntimeError(f"order response missing order_number: {order_result}")
    print(f"PASS order created: {order_number}")

    expect_ok("order lookup", "GET", f"/api/orders/{order_number}")

    deadline = time.time() + TRACK_TIMEOUT_SECONDS
    tracking = None
    while time.time() < deadline:
        status, payload, _ = request("GET", f"/api/track?order={order_number}")
        if status == 200:
            tracking = payload.get("tracking")
            if tracking and tracking.get("events"):
                break
        time.sleep(2)

    if not tracking:
        raise RuntimeError(f"tracking for {order_number} did not become available within {TRACK_TIMEOUT_SECONDS}s")
    print(
        "PASS tracking: "
        f"{order_number} status={tracking.get('status')} events={len(tracking.get('events', []))}"
    )
    print("PASS smoke test completed")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"FAIL {error}", file=sys.stderr)
        raise SystemExit(1)
