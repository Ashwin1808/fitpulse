import { createClient } from "redis";
import { config } from "./config";

export interface OrderCreatedEvent {
  event_id: string;
  type: "order.created";
  occurred_at: string;
  data: {
    order_id: number;
    order_number: string;
    customer_email: string;
    total_cents: number;
  };
}

export const redis = createClient({
  url: config.redisUrl,
  disableOfflineQueue: true,
  socket: {
    connectTimeout: 3_000,
    reconnectStrategy: (retries) => Math.min(500 * 2 ** Math.min(retries, 5), 5_000),
  },
});

redis.on("error", (error) => {
  console.error("[commerce] redis client error", error.message);
});

export function startRedis(): void {
  if (redis.isOpen) {
    return;
  }
  void redis.connect().catch((error: unknown) => {
    console.error("[commerce] initial redis connection failed", error instanceof Error ? error.message : error);
  });
}

export async function checkRedis(): Promise<void> {
  if (!redis.isOpen) {
    throw new Error("Redis is not connected");
  }
  await redis.ping();
}

export async function getCache<T>(key: string): Promise<T | null> {
  if (!redis.isOpen) {
    return null;
  }
  try {
    const value = await redis.get(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch (error) {
    console.warn("[commerce] cache read failed", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function setCache(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!redis.isOpen) {
    return;
  }
  try {
    await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (error) {
    console.warn("[commerce] cache write failed", error instanceof Error ? error.message : error);
  }
}

export async function deleteCache(key: string): Promise<void> {
  if (!redis.isOpen) {
    return;
  }
  try {
    await redis.del(key);
  } catch (error) {
    console.warn("[commerce] cache invalidation failed", error instanceof Error ? error.message : error);
  }
}

export async function publishEvent(event: OrderCreatedEvent): Promise<boolean> {
  if (!redis.isOpen) {
    return false;
  }
  try {
    await redis.xAdd(config.streamKey, "*", {
      event: JSON.stringify(event),
      event_type: event.type,
      event_id: event.event_id,
    });
    return true;
  } catch (error) {
    console.error("[commerce] event publish failed", error instanceof Error ? error.message : error);
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (!redis.isOpen) {
    return;
  }
  try {
    await redis.quit();
  } catch {
    await redis.disconnect();
  }
}
