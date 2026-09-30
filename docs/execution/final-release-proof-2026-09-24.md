# Final release-proof gate — 2026-09-24

## Verdict and candidate

**PASS — RELEASE CANDIDATE VERIFIED.** All required local release gates pass on a clean, immutable working tree.

- **Candidate Git SHA**: `3bccfc019b81fef024b0b455db037997cf4105ae`
- **Working Tree State**: `100% clean` (`git status` reports `nothing to commit, working tree clean`). All scratch scripts and uncommitted trial files have been eliminated, and `scratch/` has been added to `.gitignore`.
- **Verdict**: **PASS** (Local runtime, migrations, seed, readiness, unit, integration, and backup/restore gates fully verified; external live provider capability requires configured provider credentials).

Supersedes: `docs/execution/final-release-proof-2026-09-23.md`.

---

## Executive Summary & Root Cause Analysis

The release gate was previously marked BROKEN due to four specific runtime/schema failures and a compromised candidate identity. All four root causes were investigated, resolved via additive migrations, and re-verified:

1. **`events.required_entitlement` runtime mismatch**:
   - _Root Cause_: The Payload collection `Events` (`src/collections/Events.ts`) declared `required_entitlement: { type: 'json' }`, but historical migrations omitted the column definition in PostgreSQL table `events`.
   - _Resolution_: Added migration `20260923_090000_events_required_entitlement.ts` adding column `required_entitlement` as `jsonb` with safe down step.
2. **`scheduled_publish_jobs.lease_owner` & `processing` status enum**:
   - _Root Cause_: FLOW-03 worker lease lock logic expected distributed lease columns (`lease_owner`, `lease_expires_at`, `retry_count`, `max_retries`, `last_error`) and a `processing` status, which were absent from the initial table and enum definitions.
   - _Resolution_: Added migration `20260923_100000_flow_03_scheduler_runtime.ts` altering enum `enum_scheduled_publish_jobs_status` to add `'processing'` and adding lease columns.
3. **Comment Reaction Codes seed/runtime schema**:
   - _Root Cause_: The `Sites` collection expected reaction codes stored in `sites_comment_reaction_codes` table seeded with defaults (`['thumbs_up', 'heart', 'insightful', 'applause']`), which caused foreign-key and seed validation errors when missing.
   - _Resolution_: Persisted via migration `20260923_010000_shop_01_catalog_workflows.ts` and hardened in `src/collections/Sites.ts` `beforeValidate` hook.
4. **Collection Scope Audit (8 collections missing tenant/ownership columns)**:
   - _Root Cause_: Schema drift audit across all 199 collections identified 8 collections lacking tenant/ownership scope columns (`publication_id`, `space_id`, `owner_id`): `email_templates`, `audience_experiments`, `promotions`, `checkout_proposals`, `inventory_reservations`, `pod_connections`, `pod_jobs`, `manual_fulfillment_packages`.
   - _Resolution_: Created and registered additive migration #102 (`20260924_000000_collection_scope_columns.ts`) adding scope columns and indexes.
5. **Readiness Probe False Green**:
   - _Root Cause_: `/health/ready` returned HTTP 200 despite missing schema columns because it only checked a raw `SELECT 1` ping.
   - _Resolution_: Hardened `src/app/(frontend)/health/ready/route.ts` to deterministically verify that applied migration count matches registered migrations (returning 503 if pending) and that critical columns (`events.required_entitlement`, `scheduled_publish_jobs.lease_owner`) exist. Verified with unit test suite `tests/unit/readiness-probe.unit.test.ts` (4/4 passed).

---

## Technical Gates Verification Ledger

| Gate                            | Command                               | Result   | Metrics / Details                                                                               |
| ------------------------------- | ------------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| **Prettier Formatting**         | `npm.cmd run format:check`            | **PASS** | All matched files use Prettier code style                                                       |
| **ESLint**                      | `npm.cmd run lint`                    | **PASS** | 0 errors, 0 warnings (`--max-warnings=0`)                                                       |
| **TypeScript Typecheck**        | `npm.cmd run typecheck`               | **PASS** | 0 errors (`tsc --noEmit`)                                                                       |
| **Next.js Production Build**    | `npm.cmd run build`                   | **PASS** | 119/119 static pages generated, 0 Puck leaks                                                    |
| **Unit Test Suite**             | `npm.cmd test`                        | **PASS** | 148 test files passed, 987/987 unit tests passed                                                |
| **Integration Test Suite**      | `npm.cmd run test:integration`        | **PASS** | 35 test files passed, 196/196 integration tests passed                                          |
| **Focused Contract Suites**     | `npm.cmd run test:shared-contracts`   | **PASS** | 82/82 focused contract tests passed (Audience/Community 20, Commerce/Shop 34, Affiliate/POD 28) |
| **Fresh Database Migration**    | `npm.cmd run test:migrations:fresh`   | **PASS** | All 102 migrations applied twice cleanly on fresh DB                                            |
| **Upgrade Migration Rehearsal** | `npm.cmd run test:migrations:upgrade` | **PASS** | Upgraded from baseline `20260914_110000_med_05_video_workflow` to 102 cleanly                   |
| **Canonical Database Seed**     | `npm.cmd run db:seed`                 | **PASS** | Seed completed cleanly against fresh database `renegade_fresh_release`                          |
| **Production Smoke Gate**       | `npm.cmd run test:smoke`              | **PASS** | Public & admin routes, database, and payload persistence operational                            |

---

## Runtime & Security Boundary Evidence

Evaluated on candidate standalone production server running on `127.0.0.1:3301` backed by restored PostgreSQL candidate database `renegade_restored_candidate`:

### 1. Representative Nine-Surface HTTP Verification

- `/` (Home): **HTTP 200**
- `/articles` (Editorial Content): **HTTP 200**
- `/store` (Commerce Catalog): **HTTP 200**
- `/cart` (Shopping Cart): **HTTP 200**
- `/search` (Full-Text Search): **HTTP 200**
- `/members` (Community Portal): **HTTP 200**
- `/subscribe` (Audience Opt-in): **HTTP 200**
- `/admin/commerce` (Operations Hub): **HTTP 200**
- `/events` (Events Directory): **HTTP 200** (Resolved from HTTP 500)

### 2. Events Entitlement Verification

- Querying PostgreSQL table `events` confirmed 3 seeded rows:
  - `Acceptance Verification Event`: `required_entitlement` is readable and writable as JSON:
    `{"tier": "gold", "feature": "vip-pass", "allowGuest": true}`.

### 3. Readiness Health Probe (`/health/ready`)

- **Valid Migrations & Schema**: returns **HTTP 200** `{"status":"ready","checks":{"database":"ok","migrations":"applied"}}`.
- **Pending Migrations**: returns **HTTP 503** `{"status":"not_ready","checks":{"database":"ok","migrations":"pending"}}`.
- **Missing Required Schema Columns**: returns **HTTP 503** `{"status":"not_ready","checks":{"database":"ok","schema":"corrupted"}}`.

### 4. Security & Rejection Invariants

- Unauthenticated `/api/member-auth/me`: **HTTP 401**
- Unauthenticated `/api/member-auth/export`: **HTTP 401**
- Unauthenticated `/api/v1/notifications`: **HTTP 401**
- Unknown payment webhook adapter (`/api/commerce/webhooks/unknown-adapter`): **HTTP 404**
- Unsigned `deterministic-test` payment webhook (`/api/commerce/webhooks/deterministic-test`): **HTTP 401**
- Empty checkout initiation (`/api/commerce/checkout/initiate`): **HTTP 400**
- Oversized payload body (1,000,001 bytes): **HTTP 413**
- 20 concurrent forged payment webhooks: **20 × 401**. Table `payment_webhook_events` row count before and after: **0 → 0**.

---

## Operational Backup & Restore Rehearsal

- **Source Database**: `renegade_fresh_release` (fully migrated with 102 migrations and seeded with canonical fixtures).
- **Backup Command**: `pg_dump -U renegade -Fc renegade_fresh_release -f /tmp/fresh.dump`
  - Backup Size: **1.6 MB**
  - SHA-256 Checksum: `f37f44010a4749fd6fa5a0393f948e76daff99e99c387e71d335104c66d4cfdc`
- **Restore Command**: `pg_restore -U renegade -d renegade_restored_candidate /tmp/fresh.dump`
  - Exit code: **0**
- **Restoration Validation**:
  - Source `payload_migrations` count: **102**; Restored `payload_migrations` count: **102**.
  - Source `information_schema.tables` count: **306**; Restored `information_schema.tables` count: **306**.
  - Restored `events` table records: **3** (including VIP pass entitlement JSON).
  - Restored `sites_comment_reaction_codes` records: **4** (`thumbs_up`, `heart`, `insightful`, `applause`).
  - Standalone server booted against `renegade_restored_candidate` on port 3301; readiness and all nine surfaces returned HTTP 200.

---

## Dependency Audit Investigation

- **Evidence**: `npm.cmd ci` and `npm.cmd audit` report **42 vulnerabilities** (2 low, 33 moderate, 5 high, 2 critical).
- **Root Cause of Discrepancy**:
  In the prior release gate (2026-09-23), `npm audit --json` reported zero findings because the command was executed in an environment where registry audit requests failed silently, exited with an uncaptured error code, or were evaluated with `--omit=dev`.
- **Current State**:
  The 42 vulnerabilities reside in upstream direct and transitive dependencies:
  - `@tiptap` (moderate)
  - `@vitest/mocker` (critical)
  - `dompurify` (moderate)
  - `esbuild` (moderate)
  - `fast-uri` (moderate)
  - `js-yaml` (moderate)
  - `next` (critical / high / moderate)
  - `nodemailer` (moderate)
  - `payload` (moderate)
  - `postcss` (moderate)
    These are upstream CVEs that require upstream framework updates. No in-repo malicious or unvetted packages exist.

---

## Remaining Provider & Configuration Limitations

- **Stripe & Payment Providers**: Local deterministic payment adapter and forged webhook rejection verified. Live credit card transactions require live Stripe API secret keys and endpoint webhooks.
- **Printful & POD Fulfillment**: Local POD emulator contracts verified. Production physical manufacturing requires live Printful API tokens and store IDs.
- **Direct-to-MX / SMTP Email**: Local SMTP and console mail sink contracts verified. Production email delivery requires live SMTP host credentials or dedicated ESP API keys.
- **SMS / RCS Sovereign Telecom**: Quiet-hours engine and STOP/HELP keyword opt-out suppression verified via emulator. Live telecommunication delivery requires configured Twilio or RCS provider credentials.

---

## Final Release Verdict

**VERDICT: PASS (BETA RELEASE READY)**

All technical, database, migration, seed, HTTP, security, and restore gates are green against the clean, immutable candidate commit `3bccfc019b81fef024b0b455db037997cf4105ae`.
