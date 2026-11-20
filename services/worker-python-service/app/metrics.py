from prometheus_client import Counter, Gauge

HTTP_REQUESTS_TOTAL = Counter(
    "fitpulse_worker_http_requests_total",
    "HTTP requests handled by the worker service",
    ["method", "path", "status_code"],
)

EVENTS_PROCESSED_TOTAL = Counter(
    "fitpulse_worker_events_processed_total",
    "Redis stream events handled by the consumer",
    ["event_type", "result"],
)

EVENT_FAILURES_TOTAL = Counter(
    "fitpulse_worker_event_failures_total",
    "Redis stream event failures by reason",
    ["reason"],
)

DEAD_LETTERED_TOTAL = Counter(
    "fitpulse_worker_dead_lettered_total",
    "Poison events written to the dead-letter stream",
)

STREAM_LENGTH = Gauge(
    "fitpulse_worker_stream_length",
    "Approximate number of events in the source stream",
)

PENDING_EVENTS = Gauge(
    "fitpulse_worker_pending_events",
    "Events pending acknowledgement in the consumer group",
)

CONSUMER_RUNNING = Gauge(
    "fitpulse_worker_consumer_running",
    "Whether the Redis stream consumer loop is running",
)

LAST_EVENT_TIMESTAMP = Gauge(
    "fitpulse_worker_last_event_timestamp_seconds",
    "Unix timestamp of the last successfully handled event",
)

SERVICE_INFO = Gauge(
    "fitpulse_worker_service_info",
    "Worker service build information",
    ["environment", "consumer_group"],
)

OUTBOX_RELAY_PUBLISHED_TOTAL = Counter(
    "fitpulse_worker_outbox_relay_published_total",
    "Outbox events published to the Redis stream by the relay",
    ["result"],
)

OUTBOX_UNPUBLISHED = Gauge(
    "fitpulse_worker_outbox_unpublished",
    "Outbox events waiting to be published",
)

OUTBOX_RELAY_RUNNING = Gauge(
    "fitpulse_worker_outbox_relay_running",
    "Whether the outbox relay loop is running",
)

FULFILMENT_ADVANCED_TOTAL = Counter(
    "fitpulse_worker_fulfilment_advanced_total",
    "Tracking records advanced by the fulfilment simulator",
)

FULFILMENT_SIMULATOR_RUNNING = Gauge(
    "fitpulse_worker_fulfilment_simulator_running",
    "Whether the fulfilment simulator loop is running",
)
