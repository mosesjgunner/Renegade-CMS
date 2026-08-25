# Verification

Run with PostgreSQL healthy and the required values from `.env` loaded into the shell.

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run build
$env:SMOKE_TEST_TOKEN='a-local-test-token-of-at-least-24-characters'
npm run test:smoke
```

`test:integration` uses the configured database, creates a UUID-backed site through Payload, reads it and removes it. Do not point it at production. `test:smoke` applies migrations, runs the idempotent seed, starts the built Next application, requests public and Payload admin routes, performs a guarded Next -> Payload -> PostgreSQL write/read, checks readiness, scans captured output for `PAYLOAD_SECRET`, and shuts the app down.

## Observed M01 evidence (2026-08-11 America/Chicago)

| Command                       | Result                                                     |
| ----------------------------- | ---------------------------------------------------------- |
| `docker compose config`       | pass                                                       |
| `docker compose up -d --wait` | PostgreSQL 17.6 healthy                                    |
| `npm run db:migrate` twice    | initial migration applied; repeat no-op                    |
| `npm run db:seed` twice       | pass; neutral fixture upserted                             |
| `npm run db:status`           | `20260812_010209_initial_foundation`, batch 1, ran yes     |
| `npm run format:check`        | pass                                                       |
| `npm run lint`                | pass, zero warnings                                        |
| `npm run typecheck`           | pass                                                       |
| `npm run test`                | 3 files, 5 tests passed                                    |
| `npm run test:integration`    | 1 file, 1 PostgreSQL/Payload test passed                   |
| `npm run build`               | pass; Next 16.3.0 production build                         |
| `npm run test:smoke`          | pass; public/admin/readiness/persistence and secret checks |

GitHub Actions repeats the same layers with a disposable PostgreSQL service. No hosted CI run exists yet because this checkout has no Git repository or remote.

## Observed M02 partial evidence (2026-08-11 America/Chicago)

| Command / scenario                | Result                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `npm run db:migrate`              | applied `20260812_034055_m02_operations_jobs`; repeat no-op                  |
| production config unit matrix     | 7 tests; unsafe origin/secret/credentials/storage/proxy/test routes rejected |
| retained heartbeat job            | pass; UUID record, success log and concurrency key retained                  |
| forced failure/retry              | pass; 3 attempts, 100/200 ms backoff, terminal failure retained              |
| scheduled restart proof           | pass; future job queued in one Node process, completed in a fresh process    |
| `npm run format:check`            | pass                                                                         |
| `npm run lint`                    | pass, zero warnings                                                          |
| `npm run typecheck`               | pass against regenerated Payload job types                                   |
| `npm run test`                    | 3 files, 9 tests passed                                                      |
| `npm run test:integration`        | 2 files, 4 PostgreSQL/Payload tests passed                                   |
| production-safety `npm run build` | pass with HTTPS, trusted proxy, strong values and absolute media path        |
| `npm run test:smoke`              | pass; migrations/seed/public/admin/readiness/persistence/secret checks       |

This closes M02 Tasks 01 and 03 only, not installation, backup/restore, rich diagnostics or VPS deployment.
