import { Pool } from "pg";
import { config } from "./config";

export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: "fitpulse-commerce",
});

pool.on("error", (error) => {
  console.error("[commerce] unexpected database pool error", error.message);
});

export async function checkDatabase(): Promise<void> {
  await pool.query("SELECT 1");
}
