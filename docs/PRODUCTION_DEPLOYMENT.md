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

## VPS bootstrap

On a Linux VPS with Docker Engine and Docker Compose v2, use the supported installer:

```sh
./install.sh
# or automation:
./install.sh --non-interactive --app-url https://cms.example.com --profile Lean
```

The installer checks the CPU architecture, Docker/Compose availability, memory, disk, loopback listener, write permissions, unsafe configuration, and existing-install state. It generates `.env.production` with cryptographic secrets once, starts the existing migration-gated Compose stack, and verifies both `/health/ready` and the worker heartbeat. It never overwrites a non-installer `.env.production`; rerunning after a failed start preserves generated configuration and named volumes.

Use `Lean` for 1 GB-class VPS instances and `Standard` for 2 GB+ instances. The profile is runtime guidance only: it does not alter the database schema or add services.

The web service remains bound to `127.0.0.1:3000` by default. Connect Caddy, Nginx, Traefik, or another external TLS proxy to that address. With `PROXY_MODE=trusted`, the proxy must overwrite `X-Forwarded-For`, `X-Forwarded-Host`, and `X-Forwarded-Proto`; set `TRUSTED_PROXY_HOPS` to its controlled hop count. Caddy/Nginx/Traefik configuration remains operator-owned rather than bundled into the stack.

After successful startup the installer prints `${APP_URL}/setup`. Open it, then retrieve the one-time setup token only from local `renegade-web` logs; do not paste it into tickets or chat. The existing `/setup` passkey enrollment and local recovery flow remain the sole owner-bootstrap path.
