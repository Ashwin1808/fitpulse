# FitPulse

FitPulse is a multi-service fitness application that combines breakfast macro calculation, a fitness gear store, and asynchronous order tracking in one responsive dashboard.

The stack is intentionally split across four application runtimes so that each service can be built, scanned, scaled, and promoted independently:

- **Web UI**: React 18, Vite 5, Tailwind CSS 3, served by unprivileged Nginx.
- **Commerce API**: Node.js 22, Express, TypeScript, PostgreSQL, and Redis.
- **Tracking and nutrition API**: Java 21, the JDK HTTP server, HikariCP, and PostgreSQL.
- **Event worker**: Python 3.12, FastAPI, Redis Streams, and PostgreSQL.

## Architecture

```mermaid
flowchart LR
    Browser[Browser] --> Web[Nginx web-ui :8080]
    Web --> Commerce[commerce-node-service :3000]
    Web --> Tracking[tracking-java-service :8080]
    Web --> WorkerAPI[worker-python-service :8000]

    Commerce --> Postgres[(PostgreSQL 16)]
    Tracking --> Postgres
    WorkerAPI --> Postgres

    Commerce -- order.created --> Stream[(Redis Stream : events)]
    Stream --> WorkerAPI
    WorkerAPI -- tracking updates --> Postgres
```

### Service topology

| Service | Runtime | Internal port | Host port by default | Responsibility |
| --- | --- | ---: | ---: | --- |
| `web-ui` | React/Vite + Nginx | 8080 | 8080 | Dashboard, static assets, reverse proxy |
| `commerce-node-service` | Node 22 / Express | 3000 | 3000 | Catalog, Redis cache, checkout, orders |
| `tracking-java-service` | Java 21 | 8080 | 8081 | Breakfast catalog, calorie calculation, tracking reads |
| `worker-python-service` | Python 3.12 | 8000 | 8000 | Redis event consumer, tracking projection, metrics |
| `postgres` | PostgreSQL 16 | 5432 | 5432 | Shared application data |
| `redis` | Redis 7 | 6379 | 6379 | Product cache and order event stream |

All host ports bind to `127.0.0.1` by default. Nginx is the only intended public entry point.

## Features

### Calorie Tracker
- Loads the breakfast catalog from the Java service.
- Selects a breakfast and serving quantity.
- Calculates calories, protein, carbohydrates, and fat server-side.
- Displays the macro split and quick-pick breakfast cards.

### Fitness Store
- Loads products and live stock from the Node commerce service.
- Maintains a client-side cart with quantity controls.
- Validates customer details before checkout.
- Places orders in a database transaction and atomically decrements stock.
- Shows recent orders and links each order to the tracking view.

### Tracking
- Displays recent order tracking records.
- Looks up a specific order by number.
- Shows fulfilment progress and a chronological event timeline.
- Displays worker heartbeat, Redis queue state, processed events, outbox relay state, and dead-letter counts.
- Order events are written to a transactional outbox, so checkout remains reliable even if Redis is temporarily unavailable.

## Quick Start

### Requirements
- Docker Engine or Docker Desktop
- Docker Compose v2

### Start the stack

```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
```

Open the dashboard at [http://localhost:8080](http://localhost:8080).

The seed data includes tracking record `FP-DEMO-0001`, so the Tracking tab has data immediately.

### Smoke tests

```bash
curl -fsS http://localhost:8080/healthz
curl -fsS http://localhost:8080/api/products
curl -fsS http://localhost:8080/api/foods
curl -fsS http://localhost:8080/api/worker/stats
```

Calculate breakfast macros:

```bash
curl -fsS -X POST http://localhost:8080/api/calories/calculate \
  -H 'Content-Type: application/json' \
  -d '{"food_id":1,"quantity":2}'
```

Place an order:

```bash
curl -fsS -X POST http://localhost:8080/api/orders \
  -H 'Content-Type: application/json' \
  -d '{
    "customer_name": "Sam Rider",
    "customer_email": "sam@example.com",
    "items": [{"product_id": 1, "quantity": 1}]
  }'
```

Use the returned `order_number` for tracking:

```bash
curl -fsS "http://localhost:8080/api/track?order=FP-YYYYMMDD-XXXXXX"
```

### Stop and reset

```bash
docker compose down
```

To delete PostgreSQL and Redis data and rerun initialization:

```bash
docker compose down -v
docker compose up --build -d
```

`docker compose down -v` is destructive. PostgreSQL initialization scripts only run when the database volume is empty.

## API Reference

Nginx proxies application requests under `/api/*`:

| Method | Path | Service | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/foods` | Java | Returns `{"foods":[]}` |
| `POST` | `/api/calories/calculate` | Java | Body: `{"food_id":1,"quantity":2}` |
| `GET` | `/api/track` | Java | Returns up to 10 recent trackings |
| `GET` | `/api/track?order=FP-...` | Java | Returns one order tracking record |
| `GET` | `/api/products` | Node | Returns products with live stock |
| `GET` | `/api/orders?email=&limit=` | Node | Lists orders, optionally filtered by email |
| `GET` | `/api/orders/:orderNumber` | Node | Returns one order and its line items |
| `POST` | `/api/orders` | Node | Creates an order and publishes `order.created` |
| `GET` | `/api/worker/stats` | Python | Worker counters and Redis queue details |

Operational endpoints are available directly on each service:

| Endpoint | Purpose |
| --- | --- |
| `/healthz` | Liveness; no dependency checks |
| `/readyz` | Readiness; checks required dependencies |
| `/metrics` | Prometheus metrics |

The web container exposes `/healthz` through Nginx. Node, Java, and Python operational endpoints are available on their published host ports and on the internal Compose network. `/metrics` is deliberately not proxied by the public web entry point.

### Order contract

```json
{
  "customer_name": "Sam Rider",
  "customer_email": "sam@example.com",
  "items": [
    { "product_id": 1, "quantity": 1 }
  ]
}
```

Checkout:
1. Validates customer details and quantities.
2. Opens a PostgreSQL transaction.
3. Decrements stock only when sufficient stock exists.
4. Stores immutable product name and price snapshots in `order_items`.
5. Commits the order as `CONFIRMED`.
6. Invalidates the Redis product cache.
7. Publishes `order.created` to Redis Streams.

The worker:
1. Creates or reuses a `PROCESSING` tracking record.
2. Moves the order from `CONFIRMED` to `PROCESSING`.
3. Adds confirmation and processing tracking events.
4. Records the event in `processed_events` for idempotency.
5. Acknowledges the Redis stream message.
6. Reclaims stale pending messages and dead-letters malformed events.

## Configuration

Configuration is supplied through environment variables. Start from `.env.example`; never commit a real `.env` file.

| Variable | Default | Purpose |
| --- | --- | --- |
| `COMPOSE_PROJECT_NAME` | `fitpulse` | Compose project and network prefix |
| `APP_ENV` | `dev` | Environment label: `dev`, `uat`, `staging`, or `prod` |
| `IMAGE_TAG` | `local` | Image version tag |
| `BIND_HOST` | `127.0.0.1` | Host interface for published ports |
| `WEB_PORT` | `8080` | Dashboard port |
| `COMMERCE_PORT` | `3000` | Node API port |
| `TRACKING_PORT` | `8081` | Java API port |
| `WORKER_PORT` | `8000` | Worker API port |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `REDIS_PORT` | `6379` | Redis port |
| `POSTGRES_DB` | `fitpulse` | Database name |
| `POSTGRES_USER` | `fitpulse` | Database user |
| `POSTGRES_PASSWORD` | development value | Database password; override outside local development |
| `REDIS_PASSWORD` | development value | Redis password; override outside local development |
| `CACHE_TTL_SECONDS` | `60` | Product cache TTL |
| `WORKER_STREAM_KEY` | `fitpulse:events` | Redis stream name |
| `WORKER_CONSUMER_GROUP` | `fitpulse-workers` | Redis consumer group |
| `OUTBOX_RELAY_ENABLED` | `true` | Worker relay that publishes unpublished outbox events |
| `OUTBOX_RELAY_INTERVAL_SECONDS` | `2` | Outbox relay poll interval |
| `FULFILMENT_SIMULATOR_ENABLED` | `true` in dev Compose | Advances demo tracking statuses; disable in production |
| `FULFILMENT_SIMULATOR_INTERVAL_SECONDS` | `30` | Fulfilment simulator tick interval |
| `LOG_LEVEL` | `info` | Python worker log level |

The web service receives `VITE_APP_ENV` as a Docker build argument. Because Vite embeds this value at build time, build the web image once per environment when the environment badge must differ.

## Database and Seed Data

The schema is in `db/migrations/` and the seed is in `db/seed/001_seed.sql`. Migrations are numbered and written to be idempotent so they can be applied to fresh databases by Compose or to existing databases with `scripts/db-migrate.sh`.

Tables:

- `products`
- `orders`
- `order_items`
- `foods`
- `order_tracking`
- `tracking_events`
- `processed_events`

Seed data includes:

- 10 fitness products across strength, nutrition, recovery, conditioning, accessories, and wearables.
- 6 breakfast items.
- Demonstration order `FP-DEMO-0001` with an `IN_TRANSIT` tracking timeline.

## Local Development

The recommended workflow remains the Compose stack. For focused service development, start the dependencies first:

```bash
docker compose up -d postgres redis
```

### Web UI

```bash
cd services/web-ui
npm install
npm run dev
```

Vite runs on `http://localhost:5173` and proxies:

- `/api/products`, `/api/orders` to `http://localhost:3000`
- `/api/foods`, `/api/calories`, `/api/track` to `http://localhost:8081`
- `/api/worker` to `http://localhost:8000`

### Commerce API

```bash
cd services/commerce-node-service
npm install
DB_PASSWORD=fitpulse_dev_db_password npm run dev
```

### Tracking API

```bash
cd services/tracking-java-service
mvn package -DskipTests
DB_PASSWORD=fitpulse_dev_db_password java -jar target/tracking-java-service.jar
```

### Worker

Requires Python 3.12.

```bash
cd services/worker-python-service
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
DB_PASSWORD=fitpulse_dev_db_password \
REDIS_URL=redis://:fitpulse_dev_redis_password@localhost:6379/0 \
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Multi-Environment and CI/CD

The stack is designed around one immutable image set per service, with environment-specific runtime configuration:

- Backend images should be tagged with an immutable identifier such as `<environment>-<git-sha>` and promoted by digest.
- `APP_ENV`, credentials, and bind options are runtime settings.
- Build the web image separately for each environment because `VITE_APP_ENV` is embedded at build time.
- Inject `POSTGRES_PASSWORD` and `REDIS_PASSWORD` from a secrets manager in UAT, staging, and production. Do not package `.env` files into images.
- Keep the default `BIND_HOST=127.0.0.1` unless an ingress controller or load balancer is the intended public boundary.
- Nginx does not terminate TLS. Terminate TLS at the platform ingress or add a dedicated TLS terminator.
- Use separate PostgreSQL and Redis instances or credentials per environment.

A suitable pipeline can use these stages:

1. **Validate**: TypeScript build, Maven package, Python syntax/import checks, Compose config validation.
2. **Security**: dependency audit, image scanning, secret scanning, and SBOM generation.
3. **Build**: build all four images with immutable tags.
4. **Integration**: start the Compose stack, wait for readiness, run API and browser smoke tests.
5. **Publish**: sign and publish images by digest.
6. **Deploy**: promote digests through dev, UAT, staging, and production with environment-specific secrets.

Repository commands already available for validation:

```bash
./scripts/validate.sh
python3 scripts/smoke.py
cd services/commerce-node-service && npm run build
cd services/tracking-java-service && mvn package
cd services/worker-python-service && python3 -m compileall -q app
cd services/web-ui && npm run build
docker compose config --quiet
```

Apply migrations to an existing database:

```bash
DATABASE_URL=postgresql://fitpulse:...@localhost:5432/fitpulse ./scripts/db-migrate.sh
```

## Security and Operations

Implemented controls:

- Multi-stage Docker builds for all services.
- Non-root runtime users.
- Read-only root filesystems with a writable `/tmp` tmpfs.
- All Linux capabilities dropped.
- `no-new-privileges` enabled.
- Localhost-only published ports by default.
- Redis password authentication.
- Nginx security headers, CSP, gzip, request-size limits, hidden upstream framework headers, per-IP API rate limiting, and request ID propagation.
- Service-level liveness, readiness, and Prometheus metrics.
- Redis consumer group, pending-message reclamation, retries, dead-letter stream, and a transactional outbox relay.
- Transactional checkout with stock protection.
- Idempotent event processing.

See [docs/security.md](docs/security.md) for the production security baseline and external integrations still required.

Recommended production additions:

- Network policies restricting each service to only its dependencies.
- Image digest pinning and automated rebuilds for base-image patches.
- Central log aggregation and alerting on readiness failures, worker errors, dead-letter growth, and unpublished outbox events.
- Backup and restore testing for PostgreSQL.
- Redis persistence and recovery testing.
- Authenticated customer access and tenant-aware rate limits if the demo is extended beyond the current scope.

## Project Layout

```text
fitpulse/
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── db/
│   ├── migrations/
│   └── seed/001_seed.sql
├── docs/
├── scripts/
└── services/
    ├── commerce-node-service/
    ├── tracking-java-service/
    ├── worker-python-service/
    └── web-ui/
```

## Troubleshooting

### The UI starts before an API is ready
All application services have Compose health checks and `depends_on` conditions. If a service remains unhealthy, inspect logs:

```bash
docker compose ps
docker compose logs -f commerce-node-service
docker compose logs -f tracking-java-service
docker compose logs -f worker-python-service
docker compose logs -f web-ui
```

### Database schema changes do not appear
PostgreSQL initialization runs only for an empty data volume. Reinitialize with `docker compose down -v` after reviewing the destructive warning above.

### Ports are already in use
Change the corresponding value in `.env`, for example `WEB_PORT=8090`, then restart the stack.

### An order exists but tracking is not ready
Check `/api/worker/stats` and worker logs. A newly created order is processed asynchronously. Confirm that Redis and PostgreSQL are ready and that the worker is `running`.

### Worker readiness is failing
`/readyz` checks PostgreSQL, Redis, and the consumer loop. The most common causes are an incorrect `REDIS_PASSWORD`, unavailable Redis, or a database start-up race.
