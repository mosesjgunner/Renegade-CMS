# Stage 07 RC1 Blockers & Prerequisites Report

Date: 2026-10-16  
Candidate Commit: `9b1272151458227f98750d1094b307cd97267815`  
Production Image: `renegade-cms:final-9b127215` (`sha256:58d37513510a8932cb0ea2d356f563ca067d3e548910bce538ab86132b6e049f`)

---

## 1. Resolved Internal Defects (Repaired in this Stage)

During Stage 07 execution, all internally solvable defects were repaired directly rather than filing tickets:

1. **Dead Code & Unused Variable Cleanup**:
   - Cleaned up unreviewed main edits and unused imports across admin/commerce/telecom files.
   - Formatted previously untracked Stage 06 Gemini receipts to satisfy `prettier --check .`.
   - Committed in candidate ancestry (`5bda8bdd`).

2. **Integration Test Self-Seeding**:
   - `tests/integration/rc03-restart-recovery.integration.test.ts` assumed prior test files had populated `sites`, `publications`, and `users`. When executed in isolation on a fresh database, it failed on missing user doc.
   - Repaired by adding idempotent `ensureRenegadePartyDemo(payload)` in `beforeAll()`.
   - Verified format, lint, and types; committed cleanly in candidate `9b1272151458227f98750d1094b307cd97267815`.

3. **Database Guard Rails in Harness**:
   - Repaired gate execution harness to supply dedicated `*_upgrade_acceptance` database for `verify-upgrade-migration.ts` and dedicated `*_release_acceptance` database for integration tests, strictly honoring safety guards against resetting shared databases.

4. **Production Image & Container Stack**:
   - Successfully built production image `renegade-cms:final-9b127215` with OCI label and `BUILD_SHA=9b1272151458227f98750d1094b307cd97267815`.
   - Booted disposable Compose project `rc1s07-final`: `migrate-1` (exit 0), `renegade-web-1` (healthy), `renegade-worker-1` (healthy), `postgres-1` (healthy).
   - Validated non-root execution (`uid=1001(nextjs)`), TLS reverse proxy on port 3279, disabled test routes (HTTP 404 for `/api/test/reset`), and verified health endpoints.

5. **Operational Backup & Restore Rehearsal**:
   - Executed `npm run backup:operational` producing verified archive `renegade-backup-2026-10-16T22-17-26-682Z` (database.dump, media.tar.gz, manifest.json; 112 migrations applied, non-secret metadata, secrets strictly excluded).
   - Executed `npm run restore:operational` into isolated disposable project `rc1s07-restore` with independent DB/volumes/credentials. Verified web and worker health and `/health/ready` -> HTTP 200 `{"status":"ready","checks":{"database":"ok","migrations":"applied"}}`.

6. **Stack Smoke Verification**:
   - Seeded neutral fixture architecture (`Demo Publication`) on isolated DB and executed `npm run test:smoke` with zero assertion bypasses. Output: `PASS: Next.js public/admin routes and Payload PostgreSQL persistence are operational.`

---

## 2. External Prerequisites & Handoff Conditions for Sol

The following external dependencies and boundary conditions are recorded with full truthfulness:

1. **Independent Sol Stage 06 & Stage 07 Sign-Off**:
   - Stage 06 Sol previously recorded `STAGE 06 BLOCKED` due to earlier Docker engine failures and missing predecessor assets.
   - Gemini Stage 07 has now proven the complete executable image build, container boot, backup, restore, smoke, and full static/integration gate chain on `9b1272151458227f98750d1094b307cd97267815`.
   - Release closure requires Sol Stage 07's independent verification and sign-off.

2. **Authentic Supported Predecessor Customer Upgrade Package**:
   - `test:migrations:upgrade` verifies migration rehearsal against the synthetic baseline `20260914_110000_med_05_video_workflow` (112 migrations applied, exit 0).
   - As documented in `predecessor-access-blocker.json.txt`, no authentic historical production customer backup package (from a real deployed prior version) exists in the repository artifacts. Universal predecessor upgrades are therefore bounded to supported migration schemas, not arbitrary legacy installations.

3. **External Third-Party Provider Sandboxes**:
   - All 26 provider matrix entries operate with truthful local adapters, safe unconfigured defaults, and local sinks (e.g. local SMTP sink, local POD adapter).
   - Live external provider charges, live carrier SMS dispatches, or live external Printful fulfillments were not authorized and were not executed.

4. **Release Tagging Authority**:
   - Per safety rules, Gemini does NOT create or alter the `v0.1.0-rc.1` git tag, nor push, publish, or deploy.
   - Only final Sol Stage 07 may create the local tag after actual independent verification.
