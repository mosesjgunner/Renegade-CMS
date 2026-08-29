# Production deployment

Renegade�s production appliance is deliberately small: PostgreSQL is the durable content and Payload Jobs store, `renegade-web` serves Next/Payload, and `renegade-worker` runs persisted Payload Jobs. No Redis, Kafka, RabbitMQ, or bundled reverse proxy is required.

## Install

```powershell
Copy-Item .env.production.example .env.production
# Replace POSTGRES_PASSWORD and PAYLOAD_SECRET with unique random values.
# Set APP_URL to the public HTTPS origin and choose PROXY_MODE.
docker compose --env-file .env.production -f compose.production.yaml up --build -d --wait
```

`migrate` is a one-shot service. Both application services depend on its successful completion, so a failed migration prevents the new web and worker processes from starting. Run the same command for upgrades; migrations are applied once, before normal operation. Do not run `docker compose run migrate` concurrently with an upgrade.

The default listener is `127.0.0.1:3000`. Put an external TLS proxy in front of it, set `PROXY_MODE=trusted`, and configure `TRUSTED_PROXY_HOPS` to the exact number of controlled proxies. The proxy must overwrite forwarded headers. For a direct internal deployment, choose `PROXY_MODE=direct`; production still requires an HTTPS public `APP_URL`.

## Operations

```powershell
# Inspect startup, migration, and worker-heartbeat evidence.
docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml logs migrate renegade-worker

# Graceful shutdown; named PostgreSQL and media volumes remain intact.
docker compose --env-file .env.production -f compose.production.yaml down
```

`postgres` is healthy only after `pg_isready`. Web readiness calls `/health/ready`, which verifies a PostgreSQL read. The worker health check accepts only a recent heartbeat written after it has successfully checked schedules and run the `operations` queue. Payload Jobs remain in PostgreSQL, so restarting the worker does not discard scheduled work.

Back up `renegade_postgres_data` and `renegade_media` together. Restore into an isolated environment, run the migration service, then verify web readiness and the worker heartbeat before exposing it. The image runs all application roles as the unprivileged `nextjs` user and contains both standalone web output and the source/dependencies required by Payload CLI migration and worker commands.

Development remains unchanged: use `docker compose up -d --wait`, then `npm run db:migrate`, `npm run dev`, and `npm run jobs:worker`.
