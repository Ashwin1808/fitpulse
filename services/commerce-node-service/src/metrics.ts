import type { NextFunction, Request, Response } from "express";
import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import { config } from "./config";

export const registry = new Registry();
registry.setDefaultLabels({
  service: "commerce-node-service",
  environment: config.appEnv,
});

collectDefaultMetrics({ register: registry, prefix: "commerce_" });

export const httpRequestsTotal = new Counter({
  name: "commerce_http_requests_total",
  help: "Total HTTP requests handled by the commerce service",
  labelNames: ["method", "route", "status_code"],
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: "commerce_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const ordersCreatedTotal = new Counter({
  name: "commerce_orders_created_total",
  help: "Total orders created successfully",
  registers: [registry],
});

export const orderEventsTotal = new Counter({
  name: "commerce_order_events_total",
  help: "Order events published immediately or left for the outbox relay",
  labelNames: ["result"],
  registers: [registry],
});

export const cacheRequestsTotal = new Counter({
  name: "commerce_cache_requests_total",
  help: "Product cache lookups by result",
  labelNames: ["result"],
  registers: [registry],
});

export function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const matchedRoute = (req as Request & { route?: { path?: string } }).route?.path;
    let route = matchedRoute ? `${req.baseUrl}${matchedRoute}` : "unmatched";
    if (route.length > 1 && route.endsWith("/")) {
      route = route.slice(0, -1);
    }
    if (route === "/metrics") {
      return;
    }

    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, Number(process.hrtime.bigint() - startedAt) / 1e9);
  });

  next();
}
