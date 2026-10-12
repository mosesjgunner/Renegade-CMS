# Stage 01 Baseline Receipt — Gemini

Date: 2026-10-11  
Assigned Agent: **Gemini** (Stage 01 — Baseline, scope, and evidence reconciliation)  
Repository Baseline HEAD: `764e77dd869564e13ab5add7e10710f2cb6c61e9` (branch `main`)  
Stage Outcome: **STAGE 01 GEMINI COMPLETE — BASELINE & SCOPE RECONCILED; CANDIDATE REPAIRS PRE-VERIFIED (RC1 NOT READY)**  

---

## 1. Inventory of Current Baseline

The current repository HEAD was inspected on Windows (`C:\Projects\RENEGADE CMS\Renegade-CMS`):
- **Commit SHA**: `764e77dd869564e13ab5add7e10710f2cb6c61e9`
- **Branch**: `main`
- **Tracked Modifications**: 58 files
- **Untracked Candidate & Evidence Files**: 28 files
- **Existing Worktrees**:
  1. `C:/Projects/RENEGADE CMS/Renegade-CMS` (main @ `764e77d`)
  2. `C:/Projects/RENEGADE CMS/Events-Release-Candidate` (`4e73c86`)
  3. `C:/Projects/RENEGADE CMS/rc08c-candidate` (`aede4e6`)
  4. `C:/Projects/RENEGADE CMS/rc08c-final-01908f3` (`01908f3`)
  5. `C:/Projects/RENEGADE CMS/rc08c-verify-9ec71fb` (`d32b5d8`)
  6. `C:/Projects/RENEGADE CMS/rc08d-reconcile-0159f6b` (`0159f6b`)
  7. `C:/Projects/RENEGADE CMS/rc08d07-3dcce7e` (`3dcce7e`)
  8. `C:/Projects/RENEGADE CMS/rc08d07-7f0ef9f` (`7f0ef9f`)
  9. `C:/Projects/RENEGADE CMS/Renegade-CMS-ci-fix` (`1d81814`)

All existing user databases, media directories, `.env` files, and historical receipts have been preserved without modification or deletion.

---

## 2. Review of Plan & Rules

- Read `AGENTS.md`: Autonomous Execution & Approvals active (no stopping for confirmation prompts; make executive decisions and proceed directly).
- Read `docs/rc/RC1-PLAN-AND-PROMPTS.md`: Seven Gemini→Sol pairs established for final RC1 completion run.
- Reviewed historical evidence in `docs/rc/evidence/` and current scope in `docs/rc/RC_SCOPE.md` and `docs/rc/CAPABILITY_LEDGER.md`.

---

## 3. Resolution of Contradictions & Evidence Findings

### 3.1 Historical Reports Stale Status
The October 8 `FINAL_RC_REPORT.md` claimed release pass on commit `100bd80fa8451ab04eb6e14c937697bb77970e4c`. Although `100bd80` is an ancestor of `HEAD`, the current tree contains extensive bug fixes and security modifications across identity, commerce, and fulfillment. The historical pass summary is **stale** and cannot be inherited without a complete re-run on a frozen candidate.

### 3.2 Resolution of '27 passed / 1 skipped' Contradiction
In RC08D-07, 27 browser tests passed and 1 was skipped:
- **Skipped Test**: `tests/browser/phase-a-install-login.spec.ts:16` (`'operator completes setup and later logs in again through HTTP routes and WebAuthn'`).
- **Cause**: Dynamically skipped because `process.env.A01_SETUP_TOKEN` was omitted by the test harness.
- **Classification**: **MANDATORY PRODUCT CAPABILITY**. First-run WebAuthn bootstrap is a non-negotiable shipping requirement.
- **Resolution**: This test must be executed with a real container bootstrap token in Stage 03; it cannot be skipped or counted as passed without execution.

### 3.3 Authentic Predecessor Artifact for Customer Upgrade
Customer upgrade from earlier released versions requires an authentic immutable predecessor artifact (release archive, database backup, media volume, and config manifest). No production predecessor artifact exists for this initial release candidate (`v0.1.0-rc.1`). The synthetic migration test (`test:migrations:upgrade`) verifies schema upgrade validity from `20260914_110000_med_05_video_workflow`, but real-customer upgrades are categorized as a **Genuine External Prerequisite** and will be explicitly excluded from RC1 marketing claims.

### 3.4 Canonical Golden Journey
Reconciled directly from source (`tests/rc02/site-build.spec.ts`) and verified attachment documentation:
Steps A through T form the unbroken golden journey from cold start to clean restore, without direct database seeding around ordinary user workflows.

---

## 4. Focused Pre-Commit Checks (Stage 01 Gemini)

During this stage, 12 previously unformatted candidate files were formatted using Prettier. All four focused checks were then executed and passed with exit code 0:

| Check | Command | Exit Code | Results |
|---|---|:---:|---|
| **focused-unit** | `node node_modules/vitest/vitest.mjs run <22 unit files>` | `0` | **22 test files passed, 155 tests passed (0 failed, 0 skipped)** |
| **focused-lint** | `node node_modules/eslint/bin/eslint.js <candidate sources> --max-warnings=0` | `0` | **0 lint errors, 0 warnings** |
| **focused-format** | `node node_modules/prettier/bin/prettier.cjs --check <candidate files>` | `0` | **All matched files adhere to Prettier code style** |
| **diff-check** | `git diff --check` | `0` | **Clean diff, zero whitespace errors** |

Detailed logs and test counts are persisted in `docs/rc/evidence/rc1/stage-01/gemini/`:
- `focused-checks.json`
- `focused-unit.json`
- `focused-unit.log`
- `focused-lint.log`
- `focused-format.log`
- `diff-check.log`

---

## 5. Candidate Groups & Defect Queue for Stage 02

The candidate changes are organized into 7 functional candidate groups in `candidate-groups.json`:

1. **Identity, Grants & Recovery** (16 files):
   - Staff invitation UI and endpoints, enrollment page, WebAuthn resident key handling, owner recovery script, lock projection, and site build tests.
2. **Scoped Operator & Native Collection Access** (15 files):
   - Catalog preview, AI connections/sites, commerce dashboard/donations/reconcile/refunds endpoints, and tenant isolation tests.
3. **Cart, Checkout, Digital Delivery & Subscriptions** (39 files):
   - Cart access, server proposal signature, local test checkout, status polling, member billing, subscription plans, webhook retries, and invariant tests.
4. **Audience Truth & Progressive Disclosure** (6 files):
   - Truthful audience metrics projection, calendar/connections UI, and progressive disclosure tests.
5. **Fulfillment Wiring** (3 files):
   - **Defect Queued for Stage 02**: `service.ts` invents a fallback Portland address when customer address is missing, and swallows POD creation errors. `/api/admin/fulfillment/route.ts` unconditionally forces `PodEmulatorAdapter` even when provider key is present and provides mock preflight artwork. UI reports success for HTTP 200 even when `success: false`. Must be repaired in Stage 02.
6. **Telecom Simulator** (2 files):
   - **Defect Queued for Stage 02**: `/api/admin/telecom/simulate/route.ts` mutates global emulator history across sites without tenant isolation. Must be repaired in Stage 02.
7. **Restore Configuration** (1 file):
   - **Defect Queued for Stage 02**: `compose.restore.yaml` sets `LOCAL_E2E_TEST_MODE: ${LOCAL_E2E_TEST_MODE:-true}`. Must default to `false` for realistic restoration acceptance.

---

## 6. Stage Conclusion & Handoff

Stage 01 Baseline, Scope, and Evidence Reconciliation is **COMPLETE**.
All historical contradictions are resolved, candidate repairs are formatted and verified via focused unit/lint/format/diff checks, and the acceptance matrix is fully populated.

The workspace is ready for **Sol's Stage 01 Independent Review** and subsequent **Stage 02 Candidate Freeze & Quality Gate Execution**.
