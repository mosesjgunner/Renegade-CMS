# Shared Contract Candidate Run — 2026-09-23

## Status

**PARTIAL** — the first run was blocked by Docker access; the continued run below resolved that setup issue and exposed/fixed a UUIDv7 defect in first-run provisioning. The broad requested surface acceptance remains incomplete.

## Candidate identity and configuration

- Base Git SHA: `8eaa32b895599fa1b6ae1fcac44d89d6bbab0082`.
- Candidate tree was dirty at start: 49 tracked files changed and numerous untracked SHOP files. The tested tree is therefore not represented by the base SHA; changes were preserved.
- Runtime: Node `v24.19.0`; project requires Node `>=20.9.0`, npm `>=10`. `npm.cmd` was used because PowerShell blocks `npm.ps1` under the current execution policy.
- `.env`, `.env.production`, and `.env.example` exist. Secret values were not copied into this report. Docker services were unavailable; no acceptance database URLs were supplied to migration verifiers; no provider test credential was present in the process environment. This does not establish what credentials may be stored in local env files.
- `node_modules` was present. No fresh `npm ci` was performed, so dependency installation state is inherited, not a clean-install result.
- Migrations, seed, and import state: fresh/upgrade/commerce migration acceptance did not execute; no isolated database state or seed/import result was produced.
- Provider/policy/template versions: SHOP-04 documentation identifies adapter contract `shop-04.v1` and Stripe API pin `2025-06-30.basil`; actual test-account readiness was not verified. Other runtime policy/template versions were not captured.
- Baseline: test-start checkout state above; no clean database, setup owner/passkey, seeded site, or emulator baseline was established.

## Capability ledger

Evidence status from this run:

| Boundary                                                                                                                   | Ledger status                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Catalog, carts/checkouts, payments/orders, refunds/disputes                                                                | Implemented surfaces exist in the candidate; end-to-end behavior unverified                                   |
| Subscriptions, dunning, entitlements, donations, affiliate conversions/commissions                                         | Implemented surfaces exist in the candidate; end-to-end behavior unverified                                   |
| POD fulfillment                                                                                                            | Implemented surfaces exist in the candidate; unit suite has a type error and runtime acceptance is unverified |
| Provider health, reconciliation age, worker failures, audit, privacy-safe metrics/drilldowns                               | Not verified through running UI/output                                                                        |
| Fresh install, upgrade, setup/passkey, editorial/shop review and publish, discovery/search/schema/SEO/release/distribution | Not run                                                                                                       |
| Portals, permissions, post-order catalog/search/cache behavior, accessibility, query bounds                                | Not run                                                                                                       |

Provider claims remain conditional: only documented `deterministic-test` and Stripe hosted test checkout capabilities were found; neither was exercised against a configured test account in this run. Local/no-provider behavior was not acceptance-verified.

## Commands and results

- `docker compose ps` — failed: Docker engine pipe unavailable. This is the first blocker.
- `npm.cmd run format:check` — failed: Prettier reported style issues in 151 files.
- `npm.cmd run lint` — failed: 5 ESLint errors (one `prefer-const` in subscriptions grant; four Next `no-html-link-for-pages` reports in donation reconciliation panel).
- `npm.cmd run typecheck` — failed: 3 TS2339 errors in `tests/unit/shop-03-pod-fulfillment.test.ts` (access to `retryable` and `handoffRequired` without narrowing `SubmitPodJobOutcome`).
- `npm.cmd test -- --reporter=dot` — 968 passed, 2 failed, 146 files; 1 unhandled error. Failures: a COMM-03B route test attempted PostgreSQL (`ECONNREFUSED 127.0.0.1:5432`); `payload-domains.test.ts` expected registration list omits `pod-connections`, `pod-jobs`, and `manual-fulfillment-packages`.
- `npm.cmd run test:migrations:fresh` — did not execute: required dedicated `DATABASE_URL` ending `_release_acceptance` absent.
- `npm.cmd run test:migrations:upgrade` — did not execute: required dedicated `UPGRADE_MIGRATION_DATABASE_URL` ending `_upgrade_acceptance` absent.
- `npm.cmd run test:migrations:commerce` — did not execute: required dedicated release acceptance `DATABASE_URL` absent.
- `npm.cmd run build` — compiled successfully; failed during TypeScript validation with the same 3 POD outcome TS2339 errors listed above.
- Startup profiles, integration/browser flows, provider/search/media conformance, accessibility, query bounds, worker, reconciliation, audit, and normal UI/output walkthroughs — not run because the isolated database and local emulators were unavailable.

No traces or sanitized transaction IDs were generated because no provider or database transaction was exercised. No ledger capability has been promoted to verified based on code presence or unit coverage.

## Initial blocker and handoff

The initial blocker was resolved in the continuation below. Provider, worker, audit, metrics, accessibility, query-bound, and full editorial/commerce surface evidence still needs execution before any broader readiness claim.

## Continuation after restart — 2026-09-23

- Docker engine was available. The production Compose profile kept Postgres private inside Docker; a temporary Compose override bound it to `127.0.0.1:5432` only and set `max_locks_per_transaction=512`. Existing named DB volume was preserved. Dedicated databases `renegade_release_acceptance` and `renegade_upgrade_acceptance` were used. Process-only verification config supplied APP_URL and a local-only PAYLOAD_SECRET; env files were not edited.
- `npm.cmd run test:migrations:fresh` — PASS after UUID fix.
- `npm.cmd run test:migrations:upgrade` — PASS from `20260914_110000_med_05_video_workflow` to current. The historical fixture now inserts only baseline-era site/member/profile fields.
- `npm.cmd run test:migrations:commerce` — PASS; verified digital grants/imports/proposals/promotions/reservations, payment attempts/refunds/disputes, affiliate offers/commission ledgers/settlements, donation tables, POD connections/jobs/manual packages, `products.offers`, and cart version.
- First normal UI setup attempt failed in site provisioning: `renegade_uuid_v7()` returned an invalid UUID layout. Fixed the generator in `20260921_020000_comm_03a_comment_identity.ts` and added a corrective definition to SHOP-01 migration for already-migrated installations.
- Browser-driven setup rerun using a virtual WebAuthn authenticator — PASS: site created, 10 recovery codes displayed, owner session cookie issued, and subsequent `/setup` displayed the locked state. Test used only the release acceptance DB; the virtual credential is not a real user credential.
- Built standalone production server `node .next/standalone/server.js` on port 3300 against the acceptance DB. `/health/live`, `/health/ready`, `/`, `/setup`, `/store`, `/search`, `/admin/catalog`, `/admin/commerce`, and `/admin/fulfillment` each returned HTTP 200 after setup.
- `npm.cmd test -- --reporter=dot` — PASS: 970 tests across 146 files. Updated the collection ledger expectation for `pod-connections`, `pod-jobs`, and `manual-fulfillment-packages`.
- Commerce-focused unit suite — PASS: 127 tests across 12 files.
- `npm.cmd run format` — PASS; `npm.cmd run format:check` — PASS after formatting one remaining provider file; `npm.cmd run lint` — PASS; `npm.cmd run typecheck` — PASS.
- `npm.cmd run build` — PASS; standalone production startup and the HTTP checks above passed.
- Existing app health at port 3200 remained HTTP 200 with database and migration checks `ok` after Postgres restart.

Provider test accounts, checkout/refund/dispute provider events, actual POD provider calls, coordinated editorial release, full catalog/campaign/affiliate UI authoring, accessibility and query-bound suites, worker failure/reconciliation drilldowns, and audit/metrics privacy evidence remain unverified. No provider capability is promoted to verified from these migration and unit results.
