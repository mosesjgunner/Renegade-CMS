# Release checklist

- Run formatting, lint, typecheck, unit, integration, smoke and production build gates.
- Rehearse migrations, Docker start, backup and encrypted archive restore. `npm run test:migrations:upgrade` uses `UPGRADE_MIGRATION_DATABASE_URL`, a dedicated database ending in `_upgrade_acceptance`, to construct the pre-Second-Pass schema and deterministic sentinel data, then upgrade it in place. It rejects data loss, relationship drift, enum regressions, duplicate data, unsafe defaults, and non-idempotent repeat runs.
- Keep three checks distinct: `db:status` only reports recorded migration state; fresh-install acceptance starts an empty dedicated database at the first migration; previous-release upgrade acceptance starts at `20260825_180000_calendar_graphics` with preserved data and applies remaining migrations. Neither acceptance path uses schema push.
- Verify readiness, persistent storage, proxy/TLS, security headers, CORS/CSRF, authz, rate limits, logging redaction, upload/SSRF/open-redirect/webhook defenses.
- Classify every provider as verified, fixture-only, credential-dependent or provider-dependent.
- Exercise Lean, Standard and expanded capacity without schema changes.
- Collect evidence for the six capability scenarios and the end-to-end smoke journey.
