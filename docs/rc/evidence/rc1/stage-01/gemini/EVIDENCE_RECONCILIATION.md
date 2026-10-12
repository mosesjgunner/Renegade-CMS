# Evidence Reconciliation & Shipping Contract — Stage 01 (Gemini)

Date: 2026-10-11  
Assigned Agent: **Gemini** (Stage 01 — Baseline, scope, and evidence reconciliation)  
Repository HEAD: `764e77dd869564e13ab5add7e10710f2cb6c61e9` (branch `main`)  
Status: **STAGE 01 GEMINI COMPLETE — BASELINE & SCOPE RECONCILED; CANDIDATE REPAIRS PRE-VERIFIED (RC1 NOT READY)**

---

## 1. Executive Baseline & Current Inventory

The current repository HEAD is `764e77dd869564e13ab5add7e10710f2cb6c61e9`.

### Workspace State:
- **Tracked Modifications**: 58 files (including 12 files where formatting issues were repaired in this stage, plus `.env.example`, `compose.restore.yaml`, and `docs/rc/RC1-PLAN-AND-PROMPTS.md`).
- **Untracked Candidate & Evidence Files**: 28 files (identity/recovery, commerce routes, fulfillment routes, tests, and Stage 01 Gemini evidence).
- **Active Worktrees**: 9 worktrees present on the host system:
  1. `C:/Projects/RENEGADE CMS/Renegade-CMS` (current main, HEAD `764e77d`)
  2. `C:/Projects/RENEGADE CMS/Events-Release-Candidate` (`4e73c86`)
  3. `C:/Projects/RENEGADE CMS/rc08c-candidate` (`aede4e6`)
  4. `C:/Projects/RENEGADE CMS/rc08c-final-01908f3` (`01908f3`)
  5. `C:/Projects/RENEGADE CMS/rc08c-verify-9ec71fb` (`d32b5d8`)
  6. `C:/Projects/RENEGADE CMS/rc08d-reconcile-0159f6b` (`0159f6b`)
  7. `C:/Projects/RENEGADE CMS/rc08d07-3dcce7e` (`3dcce7e`)
  8. `C:/Projects/RENEGADE CMS/rc08d07-7f0ef9f` (`7f0ef9f`)
  9. `C:/Projects/RENEGADE CMS/Renegade-CMS-ci-fix` (`1d81814`)

All user databases, media directories, `.env` files, and historical execution artifacts are strictly preserved.

---

## 2. Comparison of Historical Reports & Evidence Traceability

Historical claims from the October 8 `FINAL_RC_REPORT.md` and RC08D receipts were analyzed against actual underlying command outputs and source containment.

| Historical Document / Claim | Tested SHA / Context | Underlying Execution & Artifacts | Status & Evidence Classification |
|---|---|---|---|
| **October 8 FINAL_RC_REPORT** ("RC Pass on `100bd80`") | `100bd80fa8451ab04eb6e14c937697bb77970e4c` | Reports aggregate pass for verify release checks, browser, migrations, and docker. | **STALE PROOF / INVALIDATED**. `100bd80` is an ancestor of `HEAD`, but the current working tree has 58 tracked modifications and 28 untracked files containing critical bug fixes. The report summaries cannot be inherited without full rerun on the frozen candidate. |
| **BLOCKERS.md & HANDOFF.md** (Oct 7 lead failure) | `01908f3` / historical | Documents previous failures during RC08C closure. | **HISTORICAL RECORD**. Kept for audit trail; superseded by RC08D and RC1 execution runs. |
| **RC08D-01 (Site settings & lock projection)** | RC08C baseline | `verify:release:checks` with 1,185 unit, 269 integration. Lacked browser save/reload trace on repaired source. | **RERUN REQUIRED**. Unit/integration tests pass, but ordinary browser save/reload with document locks must run in Stage 03. |
| **RC08D-02 (Staff invitations & enrollment)** | Unbound tree | 1,143 unit tests reported; no browser proof attached in receipt. | **RERUN REQUIRED**. Staff invitation, token redemption, and passkey registration must be proved in Stage 03 browser testing. |
| **RC08D-03 (Tenant isolation & multi-site)** | Mocked test runs | 3 tenant tests, 8 integration tests. Native collection parent scoping was dirty. | **RERUN REQUIRED**. Cross-site isolation across Site 1 and Site 2 for all collections must run in Stage 03/05. |
| **RC08D-04 (Commerce & fulfillment)** | Build/typecheck | Static typecheck and build logs; no persisted database orders, downloads, or fulfillment tracking. | **REPAIR & RERUN REQUIRED**. Uncovered defects in fulfillment and telecom simulator require code repairs in Stage 02. |
| **RC08D-05 (Security ledger & container image)** | Previous image build | JSON named 19 advisory decisions; lacked full image inspection and web/worker runtime proof on current SHA. | **RERUN REQUIRED**. Full container build, vulnerability audit, and runtime security negative suite must run in Stage 05. |
| **RC08D-06 (Full suite counts)** | Historical runner | 1,193 unit, 270 integration, 112 migrations. Recorded 27 passed / 1 skipped browser tests. | **STALE PROOF**. Must be re-executed on clean frozen candidate in Stage 02/07. |
| **RC08D-07 (Release closure)** | Historical runner | Claimed final release closure but documented 1 browser test skipped. | **DEFECT / CONTRADICTION RESOLVED** (see Section 3). |
| **RC-02 (Site build & authoring)** | `b684ee1` | Rich browser trace and receipts, but `b684ee1` is not an ancestor of current HEAD. | **VALID RETAINED PATTERN / RERUN REQUIRED**. Proven script pattern exists in `tests/rc02/site-build.spec.ts`; must run on clean candidate. |
| **RC-03 / RC-04 (Audience & Community)** | Historical | Local adapter outbox, newsletter double opt-in, suppression lists verified in isolation. | **RERUN REQUIRED**. Must be re-verified against candidate in Stage 04. |
| **Customer Predecessor Upgrade** | None available | `test:migrations:upgrade` uses synthetic baseline `20260914_110000_med_05_video_workflow`. | **GENUINE EXTERNAL PREREQUISITE**. Fixture upgrade is verified, but customer predecessor backup artifact is absent; customer upgrade cannot be falsely advertised. |

---

## 3. Resolution of the '27 passed / 1 skipped' vs 'No Skips' Contradiction

### The Exact Skipped Test
- **File**: `tests/browser/phase-a-install-login.spec.ts`
- **Line**: 16
- **Test Title**: `'operator completes setup and later logs in again through HTTP routes and WebAuthn'`
- **Skip Mechanism**:
  ```typescript
  const setupToken = process.env.A01_SETUP_TOKEN
  test('operator completes setup and later logs in again through HTTP routes and WebAuthn', async ({ page, context }) => {
    if (!setupToken) {
      test.skip(true, 'A01_SETUP_TOKEN must come from the local web-container log')
      return
    }
    // ...
  })
  ```

### Root Cause of Contradiction
In the historical RC08D-07 execution, Playwright executed all browser specs, but because the test harness did not capture and pass `A01_SETUP_TOKEN` from container logs into the test runner environment, the spec dynamically skipped itself. The runner output recorded **27 passed, 1 skipped**. However, the October 8 `FINAL_RC_REPORT.md` narrative stated "no skipped gates," creating a direct contradiction between the narrative summary and the underlying execution logs.

### Requirement Classification
- **Classification**: **MANDATORY PRODUCT CAPABILITY**.
- **Impact on RC1**: First-run bootstrap, owner passkey creation, and initial login via WebAuthn are foundational product requirements. A skipped first-run setup spec CANNOT be counted as a PASS for release readiness.
- **Resolution for RC1 Run**: In Stage 03, the browser runner must capture the actual bootstrap token from the web container / bootstrap service and execute this spec to completion with full WebAuthn virtual authenticator assertions.

---

## 4. Reconciled RC1 Shipping Contract

The shipping contract for `v0.1.0-rc.1` is strictly reconciled to source-supported features across module configurations:

### 4.1 Module Configurations & Profiles
1. **Lean / Default Core** (`RENEGADE_MODULES=lean` or default core):
   - Scope: Core publishing, pages, articles, navigation, media assets, taxonomy, redirects, SEO metadata, sitemap.xml, robots.txt, and system health.
   - Optional modules (Commerce, Audience, Community, Podcasts, Telecom) are strictly unregistered or disabled.
   - Memory floor: 512 MB.
2. **Standard** (`RENEGADE_MODULES=standard`):
   - Scope: Core + Audience (newsletter opt-in, suppression lists, local sink) + Local Test Commerce (guest/member cart, test checkout, digital downloads) + Community (basic feedback/comments).
   - Memory floor: 1 GB.
3. **Enabled-All** (`RENEGADE_MODULES=all`):
   - Scope: All available modules including advanced subscription plans, physical POD fulfillment routing, telecom simulation, and federation adapters.
   - Memory floor: 2 GB.

### 4.2 First-Run & Passkeys (WebAuthn)
- First-run setup requires ephemeral bootstrap token from server logs/console.
- Setup registers the primary site owner with WebAuthn resident key (passkey).
- Subsequent logins require WebAuthn ceremony with challenge/response verification.
- Offline owner recovery CLI (`src/scripts/recover-installation.ts`) generates emergency single-use recovery credentials when passkey is lost.

### 4.3 Multi-Site & Role Boundaries
- **Roles**: `owner`, `administrator`, `staff` (editor/author/community-manager), `member`, `anonymous`.
- Strict multi-site isolation between Site 1 and Site 2:
  - Users have explicit site grants via `member-site-roles`.
  - Content, media, categories, orders, and subscriber data belong strictly to their parent `site`.
  - Cross-site reads or mutations without explicit multi-site grant return 403 Forbidden.

### 4.4 Authoring & Public Publishing Journey
- Rich text body, taxonomy binding, media attachments, revision history, and drafts.
- Draft content isolation: unauthenticated visitors cannot access draft pages or preview URLs.
- Scheduled publication executed by background worker (`src/scripts/run-jobs-worker.ts`).
- Public rendering of published documents with JSON-LD schema, OpenGraph tags, sitemap, and RSS feed.

### 4.5 Audience & Community
- Truthful audience metrics (no mocked or synthetic subscriber numbers).
- Double opt-in newsletter subscription with verified token and unsubscribe/suppression support.
- Worker dispatch with retry and exponential backoff to configured SMTP or local test sink.
- Community discussions with moderation controls, profanity filtering, and member-scoped privacy.

### 4.6 Commerce & Fulfillment Boundaries
- **Cart & Proposals**: Guest cart creation, member cart binding and ownership merge, server-authoritative price calculation, cryptographic proposal signature to prevent tampering.
- **Payment Methods**:
  - `local-test`: Deterministic, zero-cost checkout enabled only on loopback or `.test` domains when explicitly configured.
  - `stripe-test`: Configured test-mode Stripe adapter using signed webhook verification (`/api/commerce/webhooks/stripe`).
  - `live`: Disabled by default; requires explicit runtime secrets.
- **Digital Delivery**: Time-limited, signed download grant keys (`/api/commerce/download/[grantKey]`). Revoked on refund.
- **Fulfillment**: Truthful provider separation:
  - `PodEmulatorAdapter`: Explicit emulator for testing.
  - `PrintfulAdapter`: Real API adapter. Must NOT synthesize fake order IDs or fake preflight artwork.
  - Manual fulfillment: Package creation for physical goods requiring staff shipping.
  - **Defect Notice**: Stage 02 must repair fake address fallbacks and UI error masking.

### 4.7 Providers & Degraded Safe Fallbacks
- Safely unconfigured providers do not block RC1:
  - Unconfigured SMTP -> queues to local test sink or logs warning; does not crash worker.
  - Unconfigured Stripe -> hides Stripe payment method; local-test remains available if enabled.
  - Unconfigured Printful -> physical orders route to manual fulfillment queue.
  - Unconfigured S3/Cloud Storage -> persists to local filesystem media directory.

### 4.8 Security Boundaries
- Strict tenant isolation, document locking, CSRF origin verification on mutations.
- One-time credential consumption (invitation tokens, recovery codes, setup tokens).
- Zero secret leakage in API responses, server logs, or error payloads.

### 4.9 Production Image & Packaging
- Multi-stage Dockerfile producing production container running as non-root user.
- Both web server (`node server.js`) and background worker (`run-jobs-worker.ts`) verified.
- Embedded `BUILD_SHA` and immutable image digest.

### 4.10 Recovery, Backup & Restore
- Consistent database dump + media directory archive with SHA-256 checksums.
- Restore into clean disposable container verifies data and media integrity.
- Worker resume after sudden interruption deduplicates jobs and prevents double publication/billing.

### 4.11 Upgrade & Rollback Contract
- **Synthetic Schema Baseline**: `test:migrations:upgrade` executes from `20260914_110000_med_05_video_workflow` through latest additive migrations. Mandatory gate for schema compatibility.
- **Authentic Predecessor Upgrade**: Requires a real immutable predecessor release archive. Since `v0.1.0-rc.1` is the initial release candidate and no production predecessor backup exists, universal customer upgrade is classified as a **Genuine External Prerequisite** and will NOT be falsely claimed.

---

## 5. Canonical Golden Journey Definition from Source

The canonical golden journey is established from source code (`tests/rc02/site-build.spec.ts`) and verified attachment documentation:

### Steps A through T (No Database Seeding Around Ordinary Workflows):
- **A. Install / Boot**: Start Standard candidate on clean disposable database and media.
- **B. Obtain Setup Token**: Read one-time bootstrap token from container logs.
- **C. Enroll Owner Passkey**: Complete WebAuthn ceremony via browser virtual authenticator.
- **D. Admin Entry**: Enter administration dashboard as authenticated owner.
- **E. Site Settings**: Configure site identity, title, locale, and active theme.
- **F. Navigation & Layout**: Build homepage layout and main navigation menus.
- **G. Media Upload**: Upload genuine image asset and record SHA-256 checksum.
- **H. Content Creation**: Author page and article with body, media relation, taxonomy, and SEO tags.
- **I. Preview & Publication**: Preview draft with draft-isolation check, then trigger publication.
- **J. Public Verification**: Verify HTTP 200 public rendering, JSON-LD, OpenGraph, sitemap, robots, RSS.
- **K. Redirects**: Modify article slug and verify 301/308 redirect from legacy URL.
- **L. Scheduled Job**: Schedule publication and verify background worker publishes it on schedule.
- **M. Audience Subscription**: Submit email on frontend, complete confirmation, verify sink dispatch.
- **N. Community Action**: Submit comment/feedback as member, verify staff moderation queue.
- **O. Commerce Journey**: Add item to cart, verify proposal signature, complete test checkout, verify order.
- **P. Health & Truth**: Check telemetry and command centers for truthful non-mocked data.
- **Q. Worker Restart**: Simulate worker shutdown and restart; verify zero duplicate side effects.
- **R. Clean Session**: Log out, clear cookies, and log in from fresh browser session via passkey.
- **S. Operational Backup**: Trigger backup CLI to produce database dump and media archive.
- **T. Clean Restore**: Restore backup into separate empty instance; verify identical media checksum and data.

---

## 6. Predecessor Release Artifact Analysis

- **Required by advertised customer upgrade claims**:
  1. An immutable predecessor git commit, tagged release, and container image digest.
  2. A database dump and media archive generated from that predecessor running standard workflows.
  3. Documented configuration, module list, and schema state.
- **Current Repository State**:
  - `v0.1.0-rc.1` is the first formal release candidate.
  - There is no released `v0.0.x` production database or media artifact in the repository.
  - The synthetic migration test (`test:migrations:upgrade`) tests migration step validity from `20260914_110000_med_05_video_workflow`, which is necessary schema validation but does NOT constitute a customer upgrade proof.
- **Policy Decision**:
  - The RC1 release notes will explicitly declare: *Fresh installations and synthetic migration paths verified; historical customer upgrades from pre-RC versions are unsupported pending an official predecessor baseline artifact.*
  - This avoids fabricating upgrade claims while allowing RC1 to ship legitimately.

---

## 7. Focused Checks Execution & Results (Stage 01 Gemini)

All focused pre-commit checks were executed on the candidate working tree:

```text
Environment:
  NODE_ENV=test
  DATABASE_URL=postgresql://rc1_disposable:unit_only@127.0.0.1:1/rc1_stage01_disposable_release_acceptance
  PAYLOAD_SECRET=rc1-stage01-unit-only-synthetic-secret-32-characters
  APP_URL=http://localhost:3110
  RENEGADE_MODULES=all

1. focused-unit:
   Command: node node_modules/vitest/vitest.mjs run <22 unit test files>
   Exit code: 0
   Results: 22 test files passed (22/22), 155 unit tests passed (155/155), 0 failed, 0 skipped.

2. focused-lint:
   Command: node node_modules/eslint/bin/eslint.js <candidate sources> --max-warnings=0
   Exit code: 0
   Results: 0 lint errors, 0 warnings.

3. focused-format:
   Command: node node_modules/prettier/bin/prettier.cjs --check <candidate files>
   Exit code: 0
   Results: 12 previously unformatted files were formatted with Prettier; all matched files use Prettier style.

4. diff-check:
   Command: git diff --check
   Exit code: 0
   Results: Clean diff, zero whitespace errors.
```

---

## 8. Defect Queue for Stage 02 Resolution

The following implementation defects were identified during source review and are queued for Stage 02 repair:

1. **Fulfillment Address & Mock Data Fallback** (`src/modules/commerce/service.ts`):
   - `buildFulfillmentPlan` falls back to hardcoded Portland address when recipient address is omitted. Must be rejected with clear validation error rather than inventing customer data.
   - POD job creation failure in `service.ts` is logged and swallowed while marking the order fulfilled. Must record error and fail safely.
2. **Fulfillment Admin Route & UI** (`src/app/(frontend)/api/admin/fulfillment/route.ts` & `src/modules/admin/FulfillmentCommandCenter.tsx`):
   - Route unconditionally selects `PodEmulatorAdapter` even when real provider key is present. Must select proper adapter or report unconfigured state.
   - Route supplies mock preflight artwork. Must validate real artwork or flag pending upload.
   - UI reports success when HTTP status is 200 even if response payload has `success: false`.
3. **Telecom Simulator Site Boundary** (`src/app/(frontend)/api/admin/telecom/simulate/route.ts`):
   - Simulator route mutates global emulator history and receipts across sites. Must enforce tenant isolation and restrict execution to explicit test environments.
4. **Restore Docker Compose Test Mode** (`compose.restore.yaml`):
   - Sets `LOCAL_E2E_TEST_MODE: ${LOCAL_E2E_TEST_MODE:-true}`. Must default to `false` for realistic restoration verification.
5. **Operator Site Create Access Form Permission** (`src/modules/operations/operator-grants.ts`):
   - Ensure form permission does not inadvertently permit unscoped global writes.
