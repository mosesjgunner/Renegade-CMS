# Verification commands

Run against disposable PostgreSQL only. The canonical release command resets the two named acceptance schemas; it must never target an operator, staging, or production database.

```powershell
docker compose up -d --wait
$env:DATABASE_URL='postgresql://renegade:renegade_dev_only@127.0.0.1:5432/renegade_release_acceptance'
$env:UPGRADE_MIGRATION_DATABASE_URL='postgresql://renegade:renegade_dev_only@127.0.0.1:5432/renegade_upgrade_acceptance'
$env:PAYLOAD_SECRET='local-release-verification-secret-with-at-least-32-characters'
$env:APP_URL='http://127.0.0.1:3100'
$env:SMOKE_TEST_TOKEN='local-release-smoke-token-at-least-24-characters'
npm run verify:release
```

`verify:release` is the CI contract (`.github/workflows/ci.yml`) and invokes clean install, migration verification, format, lint, typecheck, unit/integration tests, production build, and production smoke. The runner is `scripts/verify-clean-clone.mjs`; its implementation—not historical success claims—is authoritative.

Focused diagnosis commands (do not hide a failure by replacing the release command):

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:migrations:fresh
npm run test:migrations:upgrade
npm run build
npm run test:smoke
```

Record command, exit code, elapsed result, environment, and exact failing test/stage. A timeout or missing database is an **inconclusive environment failure**, not a pass and not a product regression. A failure present before this documentation directory is **pre-existing**; any failure after changing source must be triaged by reverting only the source change in an isolated worktree—not by weakening tests.
