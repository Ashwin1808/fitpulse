-- Upgrade path for databases initialized before the transactional outbox existed.
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_unpublished
    ON outbox_events (created_at)
    WHERE published_at IS NULL;
