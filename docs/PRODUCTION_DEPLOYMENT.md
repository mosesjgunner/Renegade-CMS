# Production deployment

Renegade�s production appliance is deliberately small: PostgreSQL is the durable content and Payload Jobs store, `renegade-web` serves Next/Payload, and `renegade-worker` runs persisted Payload Jobs. No Redis, Kafka, RabbitMQ, or bundled reverse proxy is required.

## Install

```powershell
Copy-Item .env.production.example .env.production
# Replace POSTGRES_PASSWORD and PAYLOAD_SECRET with unique random values.
# Set APP_URL to the public HTTPS origin and choose PROXY_MODE.
docker compose --project-name renegade-cms --env-file .env.production -f compose.production.yaml up --build -d --wait
```

`migrate` is a one-shot service. Both application services depend on its successful completion, so a failed migration prevents the new web and worker processes from starting. Run the same command for upgrades; migrations are applied once, before normal operation. Do not run `docker compose run migrate` concurrently with an upgrade.

The default listener is `127.0.0.1:3000`. PostgreSQL is intentionally not published to the host; application services reach it as `postgres:5432` on their private Compose network. Put an external TLS proxy in front of the web listener, set `PROXY_MODE=trusted`, and configure `TRUSTED_PROXY_HOPS` to the exact number of controlled proxies. The proxy must overwrite forwarded headers. For a direct internal deployment, choose `PROXY_MODE=direct`; production still requires an HTTPS public `APP_URL`.

## Operations

```powershell
# Inspect startup, migration, and worker-heartbeat evidence.
docker compose --project-name renegade-cms --env-file .env.production -f compose.production.yaml ps
docker compose --project-name renegade-cms --env-file .env.production -f compose.production.yaml logs migrate renegade-worker

# Graceful shutdown; named PostgreSQL and media volumes remain intact.
docker compose --project-name renegade-cms --env-file .env.production -f compose.production.yaml down
```

`postgres` is healthy only after `pg_isready`. Web readiness calls `/health/ready`, which verifies a PostgreSQL read. The worker health check accepts only a recent heartbeat written after it has successfully checked schedules and run the `operations` queue. Payload Jobs remain in PostgreSQL, so restarting the worker does not discard scheduled work.

Back up the instance's PostgreSQL and media volumes together (for example, `renegadeparty_renegade_postgres_data` and `renegadeparty_renegade_media`). Durable worker state and jobs are PostgreSQL records, so they are backed up with that volume; the worker process and its heartbeat file are isolated with its Compose project. Restore into an isolated environment, run the migration service, then verify web readiness and the worker heartbeat before exposing it. The image runs all application roles as the unprivileged `nextjs` user and contains both standalone web output and the source/dependencies required by Payload CLI migration and worker commands.

Development remains unchanged: use `docker compose up -d --wait`, then `npm run db:migrate`, `npm run dev`, and `npm run jobs:worker`.

## VPS bootstrap

On a Linux VPS with Docker Engine and Docker Compose v2, use the supported installer:

```sh
./install.sh --instance renegadeparty
# or automation:
./install.sh --non-interactive --instance renegadeparty --app-url https://cms.example.com --profile Lean
```

The installer checks the CPU architecture, Docker/Compose availability, memory, disk, loopback listener, write permissions, unsafe configuration, and existing-install state. `--instance` is a lowercase Docker Compose project slug and is persisted as `RENEGADE_INSTANCE` in that installation's `.env.production`. It generates cryptographic secrets once, starts that migration-gated Compose stack, and verifies both `/health/ready` and the worker heartbeat. It never overwrites a non-installer `.env.production`; rerunning after a failed start preserves the persisted instance identity, generated configuration, and named volumes. Older installer-managed environments without `RENEGADE_INSTANCE` retain their legacy `renegade-cms` project and existing volumes.

Use `Lean` for 1 GB-class VPS instances and `Standard` for 2 GB+ instances. The profile is runtime guidance only: it does not alter the database schema or add services.

The web service remains bound to `127.0.0.1:3000` by default. Connect Caddy, Nginx, Traefik, or another external TLS proxy to that address. With `PROXY_MODE=trusted`, the proxy must overwrite `X-Forwarded-For`, `X-Forwarded-Host`, and `X-Forwarded-Proto`; set `TRUSTED_PROXY_HOPS` to its controlled hop count. Caddy/Nginx/Traefik configuration remains operator-owned rather than bundled into the stack.

## Multiple installations on one Docker host

Keep each production checkout in its own directory, then give each one a distinct instance and loopback port. Compose scopes containers, its default network, PostgreSQL/media volumes, durable worker/job state in PostgreSQL, and one-shot migration containers by that instance. PostgreSQL remains internal in both installs.

```sh
# /srv/renegadeparty
./install.sh --non-interactive --instance renegadeparty --app-url https://party.example.com --web-bind 127.0.0.1:3000 --profile Lean

# /srv/fartwater
./install.sh --non-interactive --instance fartwater --app-url https://water.example.com --web-bind 127.0.0.1:3010 --profile Lean

# Stop or update one without selecting the other project.
docker compose --project-name fartwater --env-file .env.production -f compose.production.yaml down
```

Run commands from the relevant checkout and always include its persisted project name for manual operations. `docker compose ... down` retains that instance's volumes; use `down --volumes` only when intentionally destroying that one installation's database, media, and durable worker/job state.

After successful startup the installer prints `${APP_URL}/setup`. Open it, then retrieve the one-time setup token only from local `renegade-web` logs; do not paste it into tickets or chat. The existing `/setup` passkey enrollment and local recovery flow remain the sole owner-bootstrap path.
