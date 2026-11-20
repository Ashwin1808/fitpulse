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
