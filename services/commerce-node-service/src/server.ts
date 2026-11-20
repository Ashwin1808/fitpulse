import { createServer } from "node:http";
import { app } from "./app";
import { closeRedis, startRedis } from "./cache";
import { config } from "./config";
import { pool } from "./db";

startRedis();

const server = createServer(app);

server.listen(config.port, "0.0.0.0", () => {
  console.log(`[commerce] listening on 0.0.0.0:${config.port} environment=${config.appEnv}`);
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`[commerce] received ${signal}, shutting down`);

  const forceExit = setTimeout(() => {
    console.error("[commerce] graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeIdleConnections();
  });

  await Promise.allSettled([pool.end(), closeRedis()]);
  clearTimeout(forceExit);
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("unhandledRejection", (reason) => {
  console.error("[commerce] unhandled rejection", reason);
});
