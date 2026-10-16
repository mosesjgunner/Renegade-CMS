# Final Release Candidate Report — Stage 07 Gemini

**Document Date**: 2026-10-16  
**Assignment**: Stage 07 — Final immutable RC1 acceptance and local release (Gemini execution)  
**Candidate Commit**: `9b1272151458227f98750d1094b307cd97267815`  
**Production Image Tag**: `renegade-cms:final-9b127215`  
**Production Image ID**: `sha256:58d37513510a8932cb0ea2d356f563ca067d3e548910bce538ab86132b6e049f`  
**OCI Revision**: `9b1272151458227f98750d1094b307cd97267815`  
**Isolated Test Checkout**: `C:/Projects/RENEGADE CMS/rc1-stage07-final-5bda8bdd` (detached at `9b127215`)

---

## 1. Executive Summary & Verification Outcome

In accordance with the Stage 07 mission, candidate `9b1272151458227f98750d1094b307cd97267815` was frozen, built, and subjected to the full dependency-ordered acceptance chain in an isolated worktree against explicit disposable PostgreSQL databases and isolated Docker Compose projects.

All internal solvable defects identified during execution—including dead code cleanup, formatting of untracked receipts, harness database safety naming guards, integration test isolation self-seeding, and Docker build arguments—have been repaired and re-verified.

### Summary Gate Outcomes

| Gate Group                      | Command / Target                            | Exit Code | Verified Counts / Observations                                 |  Status  |
| :------------------------------ | :------------------------------------------ | :-------: | :------------------------------------------------------------- | :------: |
| **01. Format**                  | `npm run format:check`                      |    `0`    | All files match Prettier code style                            | **PASS** |
| **02. Lint**                    | `npm run lint`                              |    `0`    | Zero errors, zero warnings (`--max-warnings=0`)                | **PASS** |
| **03. Types**                   | `npm run typecheck`                         |    `0`    | `tsc --noEmit` clean compilation                               | **PASS** |
| **04. Unit Tests**              | `npm test`                                  |    `0`    | **196 test files / 1,296 passed / 0 failed / 0 skipped**       | **PASS** |
| **05. Fresh Migration**         | `npm run test:migrations:fresh`             |    `0`    | 112 migrations applied cleanly to empty database               | **PASS** |
| **06. Upgrade Migration**       | `npm run test:migrations:upgrade`           |    `0`    | Rehearsal: `20260914_110000_med_05_video_workflow` -> current  | **PASS** |
| **07. Commerce Migration**      | `npm run test:migrations:commerce`          |    `0`    | Verified 18 commerce tables, offers, cart versioning           | **PASS** |
| **08. Integration Tests**       | `npm run test:integration`                  |    `0`    | **51 test files / 298 passed / 0 failed / 0 skipped**          | **PASS** |
| **09. Production Build**        | `npm run build`                             |    `0`    | Next.js production standalone bundle built with `BUILD_SHA`    | **PASS** |
| **10. Presentation Bundles**    | `npm run verify:presentation-bundles`       |    `0`    | Public routes strictly exclude editor / Puck modules           | **PASS** |
| **11. Production Image Build**  | `docker build --build-arg BUILD_SHA=...`    |    `0`    | Image `renegade-cms:final-9b127215` (`sha256:58d37513...`)     | **PASS** |
| **12. Production Stack Boot**   | `docker compose -f compose.production.yaml` |    `0`    | `rc1s07-final`: web (healthy), worker (healthy), db (healthy)  | **PASS** |
| **13. Runtime Security Probes** | curl / docker exec                          |    `0`    | Non-root `uid=1001(nextjs)`, test routes 404, health 200       | **PASS** |
| **14. Operational Backup**      | `npm run backup:operational`                |    `0`    | Verified archive: database.dump + media.tar.gz + manifest.json | **PASS** |
| **15. Operational Restore**     | `npm run restore:operational`               |    `0`    | Restored into `rc1s07-restore`; web/worker healthy; ready 200  | **PASS** |
| **16. Stack Smoke**             | `npm run test:smoke`                        |    `0`    | Next.js public/admin routes and PostgreSQL operational         | **PASS** |

Total mandatory gate groups executed in Stage 07: **16 executed / 16 passed / 0 failed**.

---

## 2. Detailed Gate Receipts & Environmental Containment

### A. Static Quality & Units

- **Formatting**: Checked with Prettier over entire tree. All matched files adhere to style. Exit `0`.
- **Linting**: ESLint with zero warnings allowed. Zero violations. Exit `0`.
- **Type Checking**: TypeScript 5.8 `tsc --noEmit` completed with zero diagnostic errors. Exit `0`.
- **Unit Suite**: Vitest run over `tests/unit`. 196 test suites, 1,296 test cases passed in 24.9s. Zero failed, zero skipped. Exit `0`.

### B. Schema Migrations & Integration

- **Fresh Migrations**: Dedicated database `fresh_release_acceptance` on disposable PostgreSQL port 55437. All 112 migrations applied up to `20261014_230000_rc1_machine_request_scope`. Exit `0`.
- **Upgrade Migration Rehearsal**: Dedicated database `upgrade_upgrade_acceptance` on disposable PostgreSQL port 55437. Rehearsal baseline `20260914_110000_med_05_video_workflow` through current schema. Exit `0`.
- **Commerce Migration**: Verified digital delivery grants, catalog imports, proposals, inventory reservations, payments, refunds, affiliate offers, donation campaigns/events, POD jobs, manual packages. Exit `0`.
- **Integration Suite**: 51 integration files executing against migrated database with TLS certificate trusted via `scratch/rc02-tls/cert.pem`. 298 tests passed in 270.8s. Zero failed, zero skipped. Exit `0`.

### C. Build & Bundle Integrity

- **Production Build**: Executed `scripts/build.mjs` with `BUILD_SHA=9b1272151458227f98750d1094b307cd97267815`. Generates `.next/standalone` production artifacts. Exit `0`.
- **Presentation Bundle Isolation**: Executed `scripts/verify-presentation-bundles.mjs`. Confirms that public presentation routes bundle zero visual editor or Puck components. Exit `0`.

### D. Production Container Image & Multi-Instance Operations

- **Container Build**: Multi-stage Docker build targeting `runner`. Embedded label `org.opencontainers.image.revision=9b1272151458227f98750d1094b307cd97267815`. Digest: `sha256:58d37513510a8932cb0ea2d356f563ca067d3e548910bce538ab86132b6e049f`.
- **Primary Production Project (`rc1s07-final`)**:
  - Web container bind: `127.0.0.1:3278`, reverse-proxied with TLS SNI `dispatch.rc02.test:3279`.
  - Process user: `uid=1001(nextjs) gid=65533(nogroup)`.
  - `/health/ready` returns HTTP 200 `{"status":"ready","checks":{"database":"ok","migrations":"applied"}}`.
  - `/setup` returns HTTP 200.
  - `/api/test/reset` returns HTTP 404 (production test routes strictly disabled).
  - Web and worker services report Healthy under Docker healthchecks.
- **Operational Backup**:
  - Run via `npm run backup:operational -- --output scratch/s07-backup --maintenance-window-confirmed --env-file scratch/s07.env`.
  - Quiesces web and worker, captures `database.dump` (PostgreSQL 17 custom dump, 1,694,550 bytes) and `media.tar.gz` (97 bytes), generates `manifest.json`.
  - Verified archive directory: `scratch/s07-backup/renegade-backup-2026-10-16T22-17-26-682Z`.
  - Exit `0`.
- **Operational Restore into Isolated Project (`rc1s07-restore`)**:
  - Fresh project instance `rc1s07-restore` configured with distinct secrets in `scratch/s07-restore.env`.
  - Run via `npm run restore:operational -- --archive ... --target-version 0.1.0 --isolated --authorize-restore --env-file scratch/s07-restore.env`.
  - Proves clean restore into fresh database volume and media volume.
  - Web container bind: `127.0.0.1:3378`.
  - `http://127.0.0.1:3378/health/ready` returns HTTP 200 `{"status":"ready","checks":{"database":"ok","migrations":"applied"}}`.
  - Both web and worker report Healthy. Exit `0`.
- **Smoke Gate**:
  - Executed `npm run test:smoke` against dedicated seeded database `smoke_release_acceptance` on port 55437.
  - Proves Next.js public routes, admin mount, and PostgreSQL persistence without secret leakage.
  - Output: `PASS: Next.js public/admin routes and Payload PostgreSQL persistence are operational.` Exit `0`.

---

## 3. Scope, Provider Boundaries & Predecessor Limits

1. **Scope Alignment ([RC1-SCOPE.md](../../../RC1-SCOPE.md))**:
   - The shipping floor covers Installation, Identity, Multi-Site Publishing, Discovery, Presentation, Media, Audience, Community, Commerce, and Operational Recovery.
   - All 17 optional modules remain safely registered or bounded.

2. **Provider Matrix ([PROVIDER_MATRIX.md](../../../PROVIDER_MATRIX.md))**:
   - Local adapters and harnesses function deterministically without remote dependencies.
   - All external delivery/billing services (Stripe live charges, Twilio live SMS, Printful live manufacturing) are bounded: no external live charges or outbound messages occurred.

3. **Predecessor Upgrade Boundaries**:
   - Synthetic upgrade migration rehearsal from `20260914_110000_med_05_video_workflow` passed.
   - No customer database backup from a pre-release external deployment exists in the repository. Customer upgrades from arbitrary unversioned historical deployments are not advertised.

---

## 4. Handoff to Sol Stage 07

- **Candidate SHA**: `9b1272151458227f98750d1094b307cd97267815`
- **Image**: `renegade-cms:final-9b127215` (`sha256:58d37513510a8932cb0ea2d356f563ca067d3e548910bce538ab86132b6e049f`)
- **Dossier Records**: All JSON receipts and logs recorded in `docs/rc/evidence/rc1/stage-07/gemini/final/records/`.
- **Release Status**: Gemini implementation, repairs, and acceptance chain execution are **COMPLETE**. Handing off to Sol Stage 07 for independent verification and release decision.
