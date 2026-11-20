import type { PoolClient } from "pg";
import { pool } from "./db";
import type { OrderCreatedEvent } from "./cache";

export async function insertOutboxEvent(client: PoolClient, event: OrderCreatedEvent): Promise<void> {
  await client.query(
    `INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload)
     VALUES ($1::uuid, 'order', $2, $3, $4::jsonb)`,
    [
      event.event_id,
      event.data.order_number,
      event.type,
      JSON.stringify(event),
    ],
  );
}

export async function markOutboxPublished(eventId: string): Promise<void> {
  await pool.query(
    `UPDATE outbox_events
     SET published_at = now(), attempts = attempts + 1, last_error = NULL
     WHERE id = $1::uuid AND published_at IS NULL`,
    [eventId],
  );
}

export async function recordOutboxFailure(eventId: string, message: string): Promise<void> {
  await pool.query(
    `UPDATE outbox_events
     SET attempts = attempts + 1, last_error = $2
     WHERE id = $1::uuid AND published_at IS NULL`,
    [eventId, message.slice(0, 500)],
  );
}
