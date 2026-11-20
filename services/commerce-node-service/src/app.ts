import express from "express";
import { checkRedis } from "./cache";
import { config } from "./config";
import { checkDatabase } from "./db";
import { errorHandler } from "./errors";
import { httpMetricsMiddleware, registry } from "./metrics";
import { ordersRouter } from "./routes/orders";
import { productsRouter } from "./routes/products";

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Dependency check timed out")), milliseconds);
    timer.unref();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));
app.use(httpMetricsMiddleware);

app.get("/healthz", (_req, res) => {
  res.json({
    status: "ok",
    service: "commerce-node-service",
    environment: config.appEnv,
  });
});

app.get("/readyz", async (_req, res) => {
  const checks = {
    postgres: "down",
    redis: "down",
  };

  const [databaseResult, redisResult] = await Promise.allSettled([
    withTimeout(checkDatabase(), 3_000),
    withTimeout(checkRedis(), 3_000),
  ]);

  if (databaseResult.status === "fulfilled") {
    checks.postgres = "ok";
  }
  if (redisResult.status === "fulfilled") {
    checks.redis = "ok";
  }

  const ready = checks.postgres === "ok" && checks.redis === "ok";
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    service: "commerce-node-service",
    environment: config.appEnv,
    checks,
  });
});

app.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", registry.contentType);
  res.end(await registry.metrics());
});

app.use("/api/products", productsRouter);
app.use("/api/orders", ordersRouter);

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

app.use(errorHandler);
