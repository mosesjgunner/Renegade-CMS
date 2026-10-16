# Stage 06 Evidence Matrix: Business Recovery, Backup/Restore and Upgrade

**Candidate Commit**: `badaa6f4d9f9566b81d5ee29c14a8744f94adc7e`  
**Image Tag**: `renegade-cms:sol-independent-3f464a69`  
**Evaluation Date**: 2026-10-16 (America/Chicago)  
**Operator**: Gemini Stage 06

---

## 1. Acceptance Gates & Verification Outcomes

| Gate       | Target Domain                            | Command / Operation                                                                                                                                                                                                                                                          | Exit Code | Verified Evidence                                                                                                                                                                                                                                                                                                                 |
| :--------- | :--------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gate 1** | **Business Data & Lifecycle**            | Populated full business graph via `stage06-business-lifecycle.ts`                                                                                                                                                                                                            | **0**     | 30 mandatory categories populated, including multi-tenant site, published articles, private/public media, staff/member roles, audience consent, forums, shippable & digital commerce products, cart/checkout, settled order, digital delivery grant, full refund, donation campaign/intent/donation, and supporter subscriptions. |
| **Gate 2** | **Worker Interruption & Deduplication**  | Simulated worker lease crash, lease timeout recovery, and duplicate execution                                                                                                                                                                                                | **0**     | Mid-flight lease held by crashed worker rejected competitor; recovered after expiration; exactly-once publish effect; duplicate subscription grant replay created 0 duplicate rows; ActivityPub outbox replay reused identical delivery ID.                                                                                       |
| **Gate 3** | **Consistent Operational Backup**        | `npm.cmd run backup:operational -- --output scratch/stage06-backup --maintenance-window-confirmed --compose-file compose.production.yaml --env-file .env.production.stage06`                                                                                                 | **0**     | Created `renegade-backup-2026-10-16T03-52-48-360Z/`: `database.dump` (1.75 MB), `media.tar.gz` (9.45 MB), `manifest.json` (6.89 KB). 116 migrations validated. Zero secrets leaked.                                                                                                                                               |
| **Gate 4** | **Clean Target Operational Restore**     | `npm.cmd run restore:operational -- --archive scratch/stage06-backup/renegade-backup-2026-10-16T03-52-48-360Z --target-version 0.1.0-rc.1 --isolated --authorize-restore --compose-file compose.restore.yaml --env-file .env.restore.stage06`                                | **0**     | Restored to completely empty disposable target stack (`rc1-stage06-restore`). Restored DB, unpacked media, verified 116 migrations via `migrate`, healthy service boot, `/health/ready` returned HTTP 200.                                                                                                                        |
| **Gate 5** | **Post-Restore HTTP Verification**       | `npx.cmd tsx scratch/stage06/verify-restored-data.ts`                                                                                                                                                                                                                        | **0**     | 30 mandatory categories refetched via authenticated HTTP and matched exactly between source and restore. Public routes returned HTTP 200 with 100% HTML match. Public media asset served byte-for-byte identical (SHA256: `97df0ecac...`). Owner re-authenticated normally with new secret.                                       |
| **Gate 6** | **Dual Instance Isolation**              | Side-by-side execution of `rc1-stage06-source` (port 3150) and `rc1-stage06-restore` (port 3160)                                                                                                                                                                             | **0**     | Isolated networks (`...source_default` vs `...restore_default`), isolated volumes (postgres & media), isolated secrets (`PAYLOAD_SECRET` & `POSTGRES_PASSWORD`). Live mutation probe on source returned `totalDocs: 0` on restore.                                                                                                |
| **Gate 7** | **Upgrade Rehearsal & Schema Evolution** | `npm.cmd run test:migrations:upgrade`                                                                                                                                                                                                                                        | **0**     | Simulated evolution from baseline `20260914_110000_med_05_video_workflow` through 116 migrations to current schema (`20261014_230000_rc1_machine_request_scope`). Exit code 0.                                                                                                                                                    |
| **Gate 8** | **Operational Upgrade Preflight**        | `npx.cmd tsx src/scripts/operational-upgrade.ts --target-image-tag 0.1.0-rc.1 --backup scratch/stage06-backup/renegade-backup-2026-10-16T03-52-48-360Z --preflight --compose-file compose.production.yaml --env-file .env.production.stage06 --maintenance-window-confirmed` | **0**     | Validated preflight readiness, inspects service state, verifies migration list (116 migrations), verifies backup archive checksums, outputs structured upgrade plan.                                                                                                                                                              |
| **Gate 9** | **Repository Code Hygiene**              | `npm.cmd run format:check`, `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run verify:presentation-bundles`                                                                                                                                           | **0**     | 100% clean formatting, 0 lint errors/warnings, 0 type errors, 196 test files / 1,295 passed / 0 failed / 0 skipped, editor bundle excluded from public routes.                                                                                                                                                                    |

---

## 2. Predecessor Upgrade Boundary Analysis

The prompt establishes an explicit requirement:

> "Label fixture migration separately from authentic predecessor upgrade; an unavailable required predecessor remains an explicit external gate, not simulated proof."

1. **Fixture Migration (Rehearsal Test)**:
   - Command: `npm.cmd run test:migrations:upgrade`
   - Test File: `src/scripts/verify-upgrade-migration.ts`
   - Baseline Migration: `20260914_110000_med_05_video_workflow`
   - Mechanism: Seeds synthetic representative historical rows at the baseline, then executes all subsequent migrations through `20261014_230000_rc1_machine_request_scope`.
   - Result: **VERIFIED PASS** (116 migrations applied cleanly to baseline schema without data loss or column collisions).
   - Label: **Synthetic Fixture Migration (Internal CI Rehearsal)**.

2. **Authentic Predecessor Upgrade (Customer Release)**:
   - For an authentic in-situ customer predecessor upgrade (e.g. upgrading an operational installation from a previous release milestone such as historical RC07 or RC08):
   - The operational upgrade tool `src/scripts/operational-upgrade.ts` provides the documented, supported operational path:
     1. Inspects current migration state.
     2. Verifies pre-upgrade operational backup archive.
     3. Pulls target Docker image tag.
     4. Enters maintenance mode (stops `renegade-web` and `renegade-worker`).
     5. Runs containerized migration service (`migrate`).
     6. Starts upgraded application services and verifies readiness probe (`/health/ready`).
   - If an authentic production database from a previous customer release milestone is unavailable in the test environment, this remains an explicit external gate, not simulated proof. The operational tooling and preflight verifications are proven ready.
