# Clean-clone release verification

`npm run verify:release` is the authoritative release-verification contract. It performs a clean `npm ci`, then runs fresh and upgrade migration acceptance, fixture seeding, formatting, linting, type-checking, unit and PostgreSQL integration tests, a production build, and a production-server HTTP/persistence smoke test. Each layer is printed as `verify:release [stage]`; a failed child exits the command immediately with that stage name.

The command deliberately uses two disposable databases. It resets their `public` schemas during migration acceptance. Never aim it at an operator, staging, or production database.

## Local execution

Start PostgreSQL and create the two acceptance databases once for the local container volume:

```powershell
docker compose up -d --wait
docker compose exec postgres createdb -U renegade renegade_release_acceptance
docker compose exec postgres createdb -U renegade renegade_upgrade_acceptance
```

Set the required environment values, then run the single command:

```powershell
$env:DATABASE_URL='postgresql://renegade:renegade_dev_only@127.0.0.1:5432/renegade_release_acceptance'
$env:UPGRADE_MIGRATION_DATABASE_URL='postgresql://renegade:renegade_dev_only@127.0.0.1:5432/renegade_upgrade_acceptance'
$env:PAYLOAD_SECRET='local-release-verification-secret-with-at-least-32-characters'
$env:APP_URL='http://127.0.0.1:3100'
$env:SMOKE_TEST_TOKEN='local-release-smoke-token-at-least-24-characters'
npm run verify:release
```

The runner rejects missing values, short secrets/tokens, non-PostgreSQL URLs, database names that are not clearly dedicated to release verification, matching acceptance URLs, and a production `NODE_ENV`. The smoke process starts the built app via `next start`, with `NODE_ENV=test` only inside that child process so the token-protected smoke route can exist. Real production configuration rejects `ENABLE_TEST_ROUTES=true`.

Focused commands remain available: `format:check`, `lint`, `typecheck`, `test`, `test:integration`, `test:migrations:fresh`, `test:migrations:upgrade`, and `test:smoke`. Run focused database commands only against disposable PostgreSQL.

GitHub Actions creates the same two disposable PostgreSQL databases and invokes only `npm run verify:release`; it does not maintain a second sequence of checks. The smoke stage checks liveness, readiness, public and admin routes, a guarded Next -> Payload -> PostgreSQL write/read, and secret redaction in response and captured server output.
