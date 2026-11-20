function readString(name: string, fallback?: string): string {
  const value = process.env[name]?.trim();
  if (value) {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`${name} is required`);
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export const config = Object.freeze({
  appEnv: readString("APP_ENV", "dev"),
  port: readPositiveInt("PORT", 3000),
  db: {
    host: readString("DB_HOST", "localhost"),
    port: readPositiveInt("DB_PORT", 5432),
    database: readString("DB_NAME", "fitpulse"),
    user: readString("DB_USER", "fitpulse"),
    password: readString("DB_PASSWORD"),
  },
  redisUrl: readString("REDIS_URL", "redis://localhost:6379/0"),
  cacheTtlSeconds: readPositiveInt("CACHE_TTL_SECONDS", 60),
  streamKey: readString("WORKER_STREAM_KEY", "fitpulse:events"),
});
