# Final release-proof gate — 2026-09-23

## Verdict and candidate

**BROKEN. Do not launch.** The first technical-gate failure was `format:check` (three files); it was corrected, along with one test-only ESLint error, then both gates passed. The **first launch blocker** is a fresh-install schema mismatch: 98/98 migrations are recorded, but `events.required_entitlement` is absent. `db:seed` fails on that column and `/events` returns HTTP 500 on both source and restored candidate servers. Readiness still reports HTTP 200, so readiness is not sufficient proof.

Base Git SHA: `8eaa32b895599fa1b6ae1fcac44d89d6bbab0082`. The working tree contained 138 modified tracked files and 103 untracked paths at this gate. Prior gates also described a dirty tree. Consequently the base SHA **does not identify the tested candidate**, and equivalence to the preceding gates' exact bytes cannot be proved. Two proof-only edits were made here: React test children were passed as the third `createElement` argument, and three files were formatted. No feature was added. This identity gap is an independent release blocker.

## Baseline and commands

- Windows PowerShell; Node `v24.19.0`; npm `11.17.0`; PostgreSQL Docker image `17.6-alpine`. All-modules test profile: `RENEGADE_MODULES=all`, `RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT=true`, `ALLOW_FIXTURE_SEED=true`. Runtime-only secret and database URL values came from `.env`; no values are recorded here. Candidate standalone servers used `127.0.0.1:3300` (source) and `:3301` (restore). No configured Stripe/Printful account was exercised.
- `npm.cmd ci`: exit 0, 885 packages added. Install output reported 42 vulnerabilities (2 low, 33 moderate, 5 high, 2 critical); a subsequent `npm.cmd audit --json` returned zero findings. These conflicting results were not resolved; no dependency safety claim follows.
- `npm.cmd run format:check`: first exit 1, then pass after formatting three files. `npm.cmd run lint`: first exit 1, then pass after correcting one test-only React invocation. `npm.cmd run typecheck`: pass. `npm.cmd run build`: pass; 117 static pages generated.
- `npm.cmd test -- --reporter=dot`: 146 files, **970/970 passed**.
- Shared-contract focused suites, with the all-modules environment: three files, **82/82 passed** (Audience/Community 20, Commerce/Shop 34, Affiliate/POD 28). A preliminary run without that environment failed collection registration and is not a code result.
- `npm.cmd run test:integration -- --reporter=dot`: **failed**, 17 failed files / 18 passed; 6 failed tests / 134 passed / 56 skipped. Many suites hit `Comment Reaction Codes` seed validation on the existing test database; FLOW-03 also hit missing `scheduled_publish_jobs.lease_owner` and invalid `processing` enum. These failures were not averaged into the focused-suite pass.
- `npm.cmd run test:migrations:fresh`: pass on new `final_20260923_release_acceptance`, 98 migration records, including SHOP-01–07 migrations. `npm.cmd run test:migrations:upgrade`: pass from `20260914_110000_med_05_video_workflow` on new `final_20260923_upgrade_acceptance`. `npm.cmd run db:seed` on the fresh database: failed, PostgreSQL `42703`, `events.required_entitlement` absent. Read-only schema query confirmed column count **0**.

## Attack and runtime evidence

- Candidate standalone `/health/live`, `/health/ready`, `/store`, `/search`: HTTP 200. `/health/ready` reported database `ok` and migrations `applied` despite the missing events column.
- Unauthenticated `/api/member-auth/me`, `/api/member-auth/export`, `/api/v1/notifications`: HTTP 401. Unknown payment webhook adapter: 404. Unsigned `deterministic-test` payment webhook: 401. Empty checkout initiation: 400. Oversize webhook body (1,000,001 bytes): 413.
- Twenty concurrent forged payment webhooks returned **20 × 401**. `payment_webhook_events` count before and after: **0 → 0**. This proves rejection of this forged input; it does not prove duplicate valid-event reconciliation or external side-effect uniqueness.
- Static scan of `src`, `docs`, `tests`, and `public` for `sk_live_`-shaped keys, common AWS access-key shape, and private-key PEM headers returned no matching filenames. This is a narrow pattern scan, not a comprehensive secret/privacy audit.
- Source and restored HTTP sample: `/`, `/articles`, `/store`, `/cart`, `/search`, `/members`, `/subscribe`, `/admin/commerce` each 200; `/events` **500** on both. Server traces identify the same missing `events.required_entitlement` column.

## Restart, restore, and provider limits

- Focused suites contain deterministic duplicate/replay and worker-restart cases; the 82 passing tests are retained as test-interface evidence. No process was killed mid-audience, mid-community, mid-payment, mid-renewal/dunning, or mid-POD transaction in this final gate. No live provider callback was sent. External exactly-once behavior remains unproved.
- Native `pg_dump -Fc` captured the isolated acceptance database at `scratch/final-release-proof/database.dump`; SHA-256 `C6E2AA65C07F6F9D7B390D4C6539B00B326344EB57336184A427D52400FEADD2`. `pg_restore -l` parsed it; restore into new `final_20260923_restore_acceptance` succeeded. Source and restore each had **98** migration records and **0** payment webhook records. The restored standalone server started and repeated the HTTP sample above.
- The source database was not fully seeded and no media archive was taken. Therefore this is **database restore proof only**: no nine-surface history reconciliation, media checksum comparison, privacy inspection of the dump, or complete functional restore acceptance. The existing operational backup script targets the running production Compose services and stops web/worker; it was not used against those services for this candidate gate.
- Capability matrix: deterministic payment adapter and local forged-signature rejection are exercised; Stripe hosted test and real callbacks require configured provider proof. Local POD emulator behavior is exercised in prior focused tests; Printful network, credentials, webhooks, and fulfillment side effects remain unverified. Email used a local/no-adapter test mode; production delivery remains unverified. Search/media output was sampled by HTTP only; provider conformance, query/load bounds, full privacy scan, and actual restart tests remain open.

## Final capability ledger and handoff

| Boundary                                       | Final label                                                                     | Evidence limit                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Fresh install and events                       | **BROKEN**                                                                      | Seed and `/events` fail after all migrations are marked applied.                       |
| Audience/community/commerce/POD contract tests | **PARTIAL**                                                                     | 82 focused tests pass; full integration fails and exact candidate identity is missing. |
| Unauthenticated access and forged webhook      | **DEGRADED BUT SAFE**                                                           | Sampled requests reject; cross-site/user and valid-event replay need live proof.       |
| External payment, POD, email                   | **VERIFIED WITH CONFIGURED PROVIDER REQUIRED** only for local adapter contracts | Configured network capability was not verified.                                        |
| Backup/restore                                 | **PARTIAL**                                                                     | Isolated database restores; full nine-surface/media/history proof absent.              |

First launch blocker: add a supported migration for the `events` runtime schema gap (and audit other collection/schema gaps), then rerun **all** gates on a clean, immutable candidate SHA. Also resolve full integration failures, the dependency-audit contradiction, live restart/replay/provider proof, and full nine-surface backup/restore before acceptance. Do not promote local adapter tests to live-provider capability.

Operator demo/runbook starting point: `docs/OPERATIONAL_BACKUP.md`, `docs/audience/AUD-08-OPERATOR-RUNBOOK.md`, `docs/commerce/SHOP-04-PAYMENT-OPERATIONS.md`. The release demo cannot be accepted on this candidate because the fresh fixture and `/events` fail. This document is the final handoff; the gate stops here.
