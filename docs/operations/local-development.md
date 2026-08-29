# Local development

## Prerequisites

- Node.js 20.9+ and npm 10+; accepted baseline Node 24.14.1/npm 11.1.0.
- Docker Engine/Desktop with Compose; accepted Engine 29.3.1/Compose 5.1.0.
- Ports 3000 and 5432 available.

## Configure and start

```powershell
Copy-Item .env.example .env
# Replace PAYLOAD_SECRET with at least 32 random characters.
npm ci
docker compose up -d --wait
npm run db:migrate
npm run dev
# In a second shell with the same environment:
npm run jobs:worker
```

The example database password is local-only. Important environment values are:

| Key                         | Required         | Purpose                                                             |
| --------------------------- | ---------------- | ------------------------------------------------------------------- | --- | ----------------------- | ---- | ---------------------------------------------------------- |
| `DATABASE_URL`              | yes              | Payload PostgreSQL connection                                       |
| `PAYLOAD_SECRET`            | yes              | 32+ characters; 48+ and non-placeholder in production               |
| `APP_URL`                   | yes              | Canonical absolute origin; production HTTPS, no path/trailing slash |
| `NODE_ENV`                  | production       | Enables strict production safety checks                             |
| `PROXY_MODE`                | production       | Explicit `direct` or `trusted` policy                               |
| `TRUSTED_PROXY_HOPS`        | trusted proxy    | Controlled hop count, 1-3                                           |
| `STORAGE_DRIVER`            | no               | M02 supports `local`                                                |
| `MEDIA_DIR`                 | production       | Absolute persistent path in production                              |
| `EMAIL_MODE`                | no               | `disabled`, `development`, or `smtp`                                | `n  | `EMAIL_FROM` / `SMTP_*` | SMTP | Sender, SMTP endpoint, optional auth, and bounded timeouts |
| `ENABLE_TEST_ROUTES`        | no               | Guarded smoke endpoint; production rejects true                     |
| `SMOKE_TEST_TOKEN`          | with test routes | Minimum 24 characters                                               |
| `LOG_LEVEL`                 | no               | `debug`, `info`, `warn`, or `error`                                 |
| `APP_VERSION` / `BUILD_SHA` | no               | Build metadata for later authenticated diagnostics                  |
| `OWNER_EMAIL`               | no               | Intended setup owner; never an authentication factor                |

## Database behavior

- `npm run db:migrate` applies committed Payload migrations and is repeatable.
- `npm run db:status` reports the migration ledger.
- `npm run db:seed` is an explicit smoke-fixture command and requires `ALLOW_FIXTURE_SEED=true`; normal installations start with no site records.
- Schema push is disabled. To erase local data, explicitly use `docker compose down --volumes`; this is destructive and not normal setup.

## Routes and operations

- `/` reads the seeded site; `/admin` mounts Payload admin.
- `/setup` is available only before installation completes. Its first visit prints a 15-minute, single-use bootstrap token to the operator console. The flow requires a browser passkey and displays recovery codes once; add a second passkey before relying on the installation.
- `/login` verifies a registered passkey and creates an 8-hour HTTP-only session for Payload admin. Password, reset, and local-login endpoints are disabled.
- `npm run installation:recover` is a local-only operator recovery path for an expired or interrupted setup. It prints a replacement token and refuses completed installations. It is not an HTTP route and never reopens a completed setup.
- `/health/live` is public liveness; `/health/ready` performs a database read.
- `/api/foundation-smoke` is 404 unless explicitly enabled and token-authenticated.
- See [reverse proxy and HTTPS](reverse-proxy.md) for forwarded-header safety.
- See [background jobs](jobs.md) for worker operation, retry and restart evidence.

If Docker reports a user-config permission warning, use an accessible CLI config directory or repair the user config. The project needs no private registry credentials for PostgreSQL.

## Email delivery

Renegade is an SMTP client, never an SMTP server. `EMAIL_MODE=disabled` keeps public and editorial operation available while outbound delivery jobs record a terminal disabled outcome. `EMAIL_MODE=development` captures delivery through the deterministic development adapter. Use `EMAIL_MODE=smtp` with `EMAIL_FROM`, `SMTP_HOST`, and `SMTP_PORT` for real delivery; set `SMTP_SECURE=true` for implicit TLS, and configure `SMTP_USERNAME` and `SMTP_PASSWORD` together only when the relay requires authentication. Certificate validation is always enabled, while `SMTP_CONNECTION_TIMEOUT_MS` and `SMTP_SEND_TIMEOUT_MS` bound an individual attempt. Payload Jobs owns the three-attempt exponential retry policy.

Future SES, Resend, Postmark, or Mailgun integrations implement the shared `EmailDeliveryAdapter` contract and are selected through the same canonical email configuration/connection boundary. Secrets stay in environment or credential references and are never written to delivery records, job errors, or diagnostics.
