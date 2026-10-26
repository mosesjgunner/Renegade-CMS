# 08 — Executable Coding-Agent Work Orders

- **Baseline Commit (HEAD SHA):** `05f58a570ee51b0a6154d71db9d9322340c2f59f`
- **Triage Date:** 2026-10-25
- **Execution Role:** Chief Engineer / Work Order Author
- **Policy:** Strict Dependency-Ordered Execution. Do NOT bundle unrelated changes. No live external network calls, no destructive database commands, and no parallel architecture replacements.

---

## 1. Work Order Execution Sequence & Architecture

```
R01 (BOM / Prettier) ──> R02 (Audience Logger) ──> R03 (Tenant Bypass P0) ──> R04 (Localhost Blackout P0)
                                                                                       │
┌──────────────────────────────────────────────────────────────────────────────────────┘
▼
R05 (Staff Recovery Codes) ──> R06 (Bluesky Mock) ──> R07 (Release Gate Order) ──> R08 (Unit Test Alignment)
                                                                                               │
┌──────────────────────────────────────────────────────────────────────────────────────────────┘
▼
R09 (Worker Stale-Job Reaper) ──> Integration Gate (Verification & Promotion)
```

---

## 2. Itemized Executable Work Orders

### Repair R01 — Prettier UTF-16 BOM Conversion
- **Findings:** `ISSUE-06` (`P9-CI-001`)
- **Dependencies:** None (Baseline HEAD `05f58a570ee51b0a6154d71db9d9322340c2f59f`).
- **Why first:** Prettier crashes immediately on UTF-16 BOM headers, blocking all automated format checks across the entire repository.
- **Acceptance criteria:** Both JSON files re-encoded as UTF-8 without BOM; `npx.cmd prettier --check .` exits 0.
- **Verification commands:** `npx.cmd prettier --check .`
- **Risk/rollback consideration:** Zero application code risk; strictly affects documentation evidence files.

```markdown
# TASK: Repair R01 — Convert UTF-16 LE BOM in Historical JSON Evidence to Standard UTF-8

## A. Bounded Goal & Scope
- **Finding ID:** `ISSUE-06` (`P9-CI-001`)
- **Goal:** Fix Prettier syntax errors caused by Windows PowerShell UTF-16 LE Byte Order Mark (BOM) headers in historical audit evidence files.
- **Starting Commit/SHA:** Baseline `05f58a570ee51b0a6154d71db9d9322340c2f59f`
- **Branch Policy:** Work on current branch; do not switch or branch off.
- **Affected Files:**
  - `docs/rc/evidence/rc1/18-pass/03A/final-verification.json`
  - `docs/rc/evidence/rc1/18-pass/05C/format-attribution.json`

## B. Observable Failure & Root Cause
- **Reproduction:** Run `npx.cmd prettier --check .`
- **Expected:** Prettier parses all JSON files and validates formatting.
- **Actual:** Prettier terminates with fatal syntax errors:
  `SyntaxError: Unexpected character '' (1:1) in docs/rc/evidence/rc1/18-pass/03A/final-verification.json`
  `SyntaxError: Unexpected character '' (1:1) in docs/rc/evidence/rc1/18-pass/05C/format-attribution.json`
- **Root Cause (PROVEN):** PowerShell `>` redirection on Windows defaulted to UTF-16 LE with BOM (bytes `0xFF 0xFE`). Prettier JSON parser requires UTF-8 without BOM.

## C. Implementation Requirements
- Inspect both files and re-encode them strictly as UTF-8 without BOM.
- Preserve all existing JSON keys, structure, and text content.
- Run `npx.cmd prettier --write` on the two files if any trailing whitespace alignment is needed.
- Do NOT modify any other files or application code.

## D. Verification & Regression Testing
- **Verification Command:** `npx.cmd prettier --check docs/rc/evidence/rc1/18-pass/03A/final-verification.json docs/rc/evidence/rc1/18-pass/05C/format-attribution.json`
- **Full Gate Command:** `npx.cmd prettier --check .` (Must exit with code 0).

## E. Non-Goals & Safety Restrictions
- No modifications to any application code in `src/` or tests in `tests/`.
- No package installs or dependency upgrades.
- Do not run git commit, push, or tag.

## F. Time/Complexity Budget
- **Budget:** SMALL (5 minutes, pure file re-encoding).

## G. Final Handoff Requirements
Report:
1. Exact command used to strip BOM and re-encode.
2. Exit code of `npx.cmd prettier --check .`
3. Status of finding `ISSUE-06` (VERIFIED FIXED).
```

---

### Repair R02 — Audience Command Center Route Undefined Logger Crash Guard
- **Findings:** `ISSUE-03` (`P9-FEAT-002`)
- **Dependencies:** Batch R01 complete.
- **Why first:** Unhandled TypeError crashes the Audience Command Center route in environments where Payload logger is not instantiated, causing test suite failures.
- **Acceptance criteria:** Error block safely checks `payload?.logger?.error` before calling it; returns HTTP 503 JSON; `rc01-admin-truth.test.tsx` passes line 152.
- **Verification commands:** `npx.cmd vitest run tests/unit/rc01-admin-truth.test.tsx -t "reports HTTP 503"`
- **Risk/rollback consideration:** Low risk; fallback to `console.error` ensures diagnostic information is never lost.

```markdown
# TASK: Repair R02 — Guard Against Undefined Payload Logger in Audience Command Center Route

## A. Bounded Goal & Scope
- **Finding ID:** `ISSUE-03` (`P9-FEAT-002`)
- **Goal:** Prevent uncaught `TypeError: Cannot read properties of undefined (reading 'error')` when `payload.logger` is undefined in error catch blocks.
- **Starting Commit/SHA:** Current HEAD (with Batch R01 applied).
- **Branch Policy:** Work on current branch.
- **Affected File:** `src/app/(frontend)/api/admin/audience/command-center/route.ts`

## B. Observable Failure & Root Cause
- **Reproduction:** Run `npx.cmd vitest run tests/unit/rc01-admin-truth.test.tsx`
- **Expected:** When audience aggregate service throws, route catches the error and returns `{ error: 'Failed to load audience command center data' }` with HTTP 503.
- **Actual:** Route throws unhandled `TypeError: Cannot read properties of undefined (reading 'error')` at line 336.
- **Root Cause (PROVEN):** Line 336 unconditionally dereferences `payload.logger.error(...)`. When Payload is initialized in test environments or lightweight CLI modes without a custom logger instance, `payload.logger` is undefined.

## C. Implementation Requirements
- Inspect `src/app/(frontend)/api/admin/audience/command-center/route.ts` around line 336.
- Use optional chaining and fallback to standard console logging:
  ```typescript
  if (payload?.logger?.error) {
    payload.logger.error({ err: error, event: 'audience.command_center.load_failed' }, 'Failed to load audience command center data')
  } else {
    console.error('Failed to load audience command center data:', error)
  }
  ```
- Do NOT alter response payload format or HTTP 503 status code.

## D. Verification & Regression Testing
- **Failing State:** Verify test fails before edit.
- **Verification Command:** `npx.cmd vitest run tests/unit/rc01-admin-truth.test.tsx`
- Ensure test case "reports HTTP 503 when audience aggregate services fail" passes with exit code 0.

## E. Non-Goals & Safety Restrictions
- Do not refactor the entire route or touch other audience routes.
- Do not add mock libraries or change test runner settings.

## F. Time/Complexity Budget
- **Budget:** SMALL (5 minutes, localized guard).

## G. Final Handoff Requirements
Report:
1. Git diff of `src/app/(frontend)/api/admin/audience/command-center/route.ts`.
2. Test output and exit code of `rc01-admin-truth.test.tsx`.
3. Status of finding `ISSUE-03` (VERIFIED FIXED).
```

---

### Repair R03 — Active-Site Cookie Cross-Tenant Authorization Fix
- **Findings:** `ISSUE-01` (P0 Security Vulnerability)
- **Dependencies:** Batch R02 complete.
- **Why first:** Critical multi-tenant privilege escalation defect. Allows an operator authorized on Site A to inject content into Site B by forging a request cookie. Must be fixed before any other feature work.
- **Acceptance criteria:** `Content.hooks.beforeValidate` verifies operator grant on `cookieSite` via `checkOperatorSiteAccess`; unauthenticated/unauthorized attempts throw HTTP 403; automated negative test asserts 403 on forged cookie.
- **Verification commands:** `npx.cmd vitest run tests/unit/tenant-isolation.test.ts`
- **Risk/rollback consideration:** Crucial security boundary; ensures tenant isolation invariant holds across all content mutations.

```markdown
# TASK: Repair R03 — Enforce Multi-Tenant Operator Authorization on Active-Site Request Cookie

## A. Bounded Goal & Scope
- **Finding ID:** `ISSUE-01` (P0 Security Defect)
- **Goal:** Prevent cross-tenant content injection where an operator with access to Site A creates articles/pages under Site B via a forged `renegade-active-site` cookie.
- **Starting Commit/SHA:** Current HEAD (with Batches R01–R02 applied).
- **Branch Policy:** Work on current branch.
- **Affected Files:**
  - `src/collections/Publishing.ts` (around lines 976–998)
  - `tests/unit/tenant-isolation.test.ts`

## B. Observable Failure & Root Cause
- **Reproduction:** Submit `POST /api/content` without `site` in body and header `Cookie: renegade-active-site=<foreign-site-id>`.
- **Expected:** Request is rejected with HTTP 403 Forbidden because user lacks operator grants on the foreign site.
- **Actual:** Request succeeds; content is persisted under `<foreign-site-id>`.
- **Root Cause (PROVEN):** `operatorSiteCreateAccess` allows creation if user has access to *any* site when `data.site` is undefined. In `Content.hooks.beforeValidate`, lines 990–992 extract `cookieSite` from `req.headers.cookie` and assign `incoming.site = cookieSite` without calling `checkOperatorSiteAccess(req.payload, req.user, cookieSite)`.

## C. Implementation Requirements
- In `src/collections/Publishing.ts:beforeValidate`:
  When `!incoming.site && cookieSite` is true, check:
  ```typescript
  if (cookieSite && req?.payload && req?.user) {
    const hasAccess = await checkOperatorSiteAccess(req.payload, req.user, cookieSite)
    if (hasAccess) {
      incoming.site = cookieSite
    } else {
      throw new APIError('You do not have operator permission on the requested active site.', 403)
    }
  }
  ```
- Import `checkOperatorSiteAccess` from `src/modules/operations/operator-grants.ts` if not already imported.
- Ensure canonical error response using Payload's `APIError`.

## D. Verification & Regression Testing
- Add a negative test case in `tests/unit/tenant-isolation.test.ts`:
  1. Set up mock user with grant only for `site-alpha`.
  2. Simulate `beforeValidate` with `cookieSite = 'site-beta'` and `data.site = undefined`.
  3. Assert that hook throws an `APIError` with status 403.
- Run `npx.cmd vitest run tests/unit/tenant-isolation.test.ts`.

## E. Non-Goals & Safety Restrictions
- Do not remove the `renegade-active-site` cookie feature (admin UI relies on it for active site switching).
- Do not alter existing valid single-site create permissions.
- Do not run live database migrations.

## F. Time/Complexity Budget
- **Budget:** MEDIUM (20 minutes; security-critical logic + unit regression test).

## G. Final Handoff Requirements
Report:
1. Diff of `src/collections/Publishing.ts` and `tests/unit/tenant-isolation.test.ts`.
2. Output of `npx.cmd vitest run tests/unit/tenant-isolation.test.ts`.
3. Confirmation that negative cross-tenant creation test passes.
4. Status of finding `ISSUE-01` (VERIFIED FIXED).
```

---

### Repair R04 — Multi-Site Localhost Public Shell Blackout Fix
- **Findings:** `ISSUE-02` (P0 Availability Defect)
- **Dependencies:** Batch R03 complete.
- **Why first:** Critical availability bug. In any environment where more than one active site is configured, navigating to `localhost:3000` blacks out the entire frontend, returning empty navigation and zero articles.
- **Acceptance criteria:** `publicSiteForHost` falls back to the default/primary site when accessed via `localhost` / `127.0.0.1` in multi-site mode; public layout renders primary site content.
- **Verification commands:** `npx.cmd vitest run tests/unit/rc02-public-queries.test.ts`
- **Risk/rollback consideration:** Low risk; strictly scoped to local and unmapped hostname fallback logic.

```markdown
# TASK: Repair R04 — Resolve Public Shell Blackout on Localhost in Multi-Site Deployments

## A. Bounded Goal & Scope
- **Finding ID:** `ISSUE-02` (P0 Availability Defect)
- **Goal:** Fix public frontend blackout where visiting `http://localhost:3000` renders an empty page with missing navigation and branding when more than one active site exists.
- **Starting Commit/SHA:** Current HEAD (with Batches R01–R03 applied).
- **Branch Policy:** Work on current branch.
- **Affected File:** `src/modules/public/site-scope.ts` (lines 55–77)

## B. Observable Failure & Root Cause
- **Reproduction:** Call `publicSiteForHost('localhost:3000')` when `sites.docs.length > 1`.
- **Expected:** Returns the ID of the primary/default active site.
- **Actual:** Returns `""` (empty string). In `src/app/(frontend)/layout.tsx:82`, `resolvedSiteId === ''` creates `{ id: { exists: false } }`, causing all public content, navigation, and publication branding to disappear.
- **Root Cause (PROVEN):** Line 73 of `src/modules/public/site-scope.ts` only falls back to the first site if `allActive.docs.length === 1`. For multi-site instances on local test hostnames, no host matches `canonicalOriginsBySite`, returning empty string.

## C. Implementation Requirements
- In `src/modules/public/site-scope.ts`:
  In `publicSiteForHost`, when `isLocalHost(hostname)` is true (or host matches localhost/127.0.0.1) and no explicit custom domain mapping matches, resolve to the primary active site:
  ```typescript
  if (local) {
    const primary = allActive.docs.find((s) => !settings.canonicalOriginsBySite?.[s.id]) || allActive.docs[0]
    if (primary) return String(primary.id)
  }
  ```
- Ensure production custom-domain isolation remains untouched for non-local hostnames.

## D. Verification & Regression Testing
- Add test in `tests/unit/rc02-public-queries.test.ts` or `tests/unit/site-scope.test.ts`:
  Assert `publicSiteForHost('localhost:3000')` returns primary site ID when 2 active sites exist.
- Run `npx.cmd vitest run tests/unit/rc02-public-queries.test.ts`.

## E. Non-Goals & Safety Restrictions
- Do not disable multi-tenant routing for public domains.
- Do not hardcode static site IDs.

## F. Time/Complexity Budget
- **Budget:** SMALL (10 minutes; surgical fallback in `site-scope.ts`).

## G. Final Handoff Requirements
Report:
1. Diff of `src/modules/public/site-scope.ts`.
2. Unit test output verifying multi-site localhost resolution.
3. Status of finding `ISSUE-02` (VERIFIED FIXED).
```

---

### Repair R05 — Staff Emergency Recovery Codes API Forwarding
- **Findings:** `ISSUE-10` (P1 Identity & Account Recovery Defect)
- **Dependencies:** Batch R04 complete.
- **Why first:** High-priority disaster recovery gap. Staff operators completing passkey enrollment never receive their 10 emergency recovery codes because the route drops them from the JSON response.
- **Acceptance criteria:** `POST /api/auth/passkey/complete` forwards `recoveryCodes` array in the JSON response when `enrollmentToken` is provided.
- **Verification commands:** `npx.cmd vitest run tests/unit/passkey-auth.test.ts`
- **Risk/rollback consideration:** Zero risk; purely exposes generated emergency recovery codes to the enrolling staff operator.

```markdown
# TASK: Repair R05 — Forward Staff Emergency Recovery Codes in Passkey Completion Route

## A. Bounded Goal & Scope
- **Finding ID:** `ISSUE-10` (P1 Identity Defect)
- **Goal:** Ensure staff operators receive their 10 single-use emergency recovery codes upon completing passkey enrollment.
- **Starting Commit/SHA:** Current HEAD (with Batches R01–R04 applied).
- **Branch Policy:** Work on current branch.
- **Affected File:** `src/app/(frontend)/api/auth/passkey/complete/route.ts` (lines 25–34)

## B. Observable Failure & Root Cause
- **Reproduction:** Send `POST /api/auth/passkey/complete` with valid `enrollmentToken` and credential; inspect response.
- **Expected:** Response JSON includes `{ status: 'ok', enrolled: true, recoveryCodes: [...] }`.
- **Actual:** Response JSON only contains `{ status: 'ok', enrolled: true }`.
- **Root Cause (PROVEN):** Line 32 calls `completeStaffPasskeyEnrollment`, which generates 10 recovery codes and returns `{ user, recoveryCodes }`. Line 33 returns `Response.json({ status: 'ok', enrolled: true })`, completely discarding `result.recoveryCodes`.

## C. Implementation Requirements
- In `src/app/(frontend)/api/auth/passkey/complete/route.ts`:
  Update response to forward recovery codes:
  ```typescript
  return Response.json({
    status: 'ok',
    enrolled: true,
    recoveryCodes: result.recoveryCodes,
  })
  ```
- Ensure client-side setup/enrollment wizard receives the codes for user display.

## D. Verification & Regression Testing
- Add/update unit test in `tests/unit/passkey-auth.test.ts`:
  Assert response contains `recoveryCodes` array of length 10 when `enrollmentToken` is passed.
- Run `npx.cmd vitest run tests/unit/passkey-auth.test.ts`.

## E. Non-Goals & Safety Restrictions
- Do not modify recovery code generation crypto in `staff-enrollment.ts`.
- Do not alter ordinary member authentication routes.

## F. Time/Complexity Budget
- **Budget:** SMALL (5 minutes, 1 line fix + test assertion).

## G. Final Handoff Requirements
Report:
1. Diff of `src/app/(frontend)/api/auth/passkey/complete/route.ts`.
2. Test output confirming recovery codes are returned.
3. Status of finding `ISSUE-10` (VERIFIED FIXED).
```

---

### Repair R06 — Bluesky AT Protocol Mock Reconciliation
- **Findings:** `ISSUE-04` (`P9-REG-001`)
- **Dependencies:** Batch R05 complete.
- **Why first:** Unblocks failing unit test in distribution adapter suite (`dist-02-core-adapters.test.ts:303`).
- **Acceptance criteria:** Preflight `readRecord` mock returns HTTP 404 for clean post creation test; test passes with exit code 0.
- **Verification commands:** `npx.cmd vitest run tests/unit/dist-02-core-adapters.test.ts`
- **Risk/rollback consideration:** Test-only change; zero application code risk.

```markdown
# TASK: Repair R06 — Reconcile Bluesky AT Protocol Preflight Idempotency Mock

## A. Bounded Goal & Scope
- **Finding ID:** `ISSUE-04` (`P9-REG-001`)
- **Goal:** Fix unit test failure in `tests/unit/dist-02-core-adapters.test.ts` where Bluesky AT Protocol publishing test expects `status: 'published'` but gets `status: 'failed'`.
- **Starting Commit/SHA:** Current HEAD (with Batches R01–R05 applied).
- **Branch Policy:** Work on current branch.
- **Affected File:** `tests/unit/dist-02-core-adapters.test.ts` (lines 254–305)

## B. Observable Failure & Root Cause
- **Reproduction:** Run `npx.cmd vitest run tests/unit/dist-02-core-adapters.test.ts`
- **Expected:** Post creation succeeds with `status: 'published'`.
- **Actual:** Test fails at line 303:
  `AssertionError: expected 'failed' to be 'published'`
- **Root Cause (PROVEN):** Subpass 08C introduced a preflight `readRecord` call to check idempotency before publishing. The test mock returned `{ status: 200, body: '{}' }`. `readRecord` interprets HTTP 200 as an existing record, but missing post text causes it to throw `Existing record mismatch` and mark the post as `'failed'`.

## C. Implementation Requirements
- In `tests/unit/dist-02-core-adapters.test.ts`:
  In the fetch mock for `com.atproto.repo.getRecord`, return `{ status: 404, ok: false, json: async () => ({ error: 'RecordNotFound' }) }` when testing a fresh publish, so preflight idempotency check confirms the record does not exist and proceeds to `createRecord`.
- Ensure `createRecord` mock returns success `{ uri: 'at://did:plc:123/app.bsky.feed.post/456', cid: 'bafy123' }`.

## D. Verification & Regression Testing
- **Command:** `npx.cmd vitest run tests/unit/dist-02-core-adapters.test.ts` (Must exit 0).

## E. Non-Goals & Safety Restrictions
- Do not disable preflight idempotency checks in `src/modules/social/adapters/bluesky.ts`.
- Do not make external network requests to Bluesky APIs.

## F. Time/Complexity Budget
- **Budget:** SMALL (5 minutes, test mock alignment).

## G. Final Handoff Requirements
Report:
1. Diff of `tests/unit/dist-02-core-adapters.test.ts`.
2. Output of `dist-02-core-adapters.test.ts`.
3. Status of finding `ISSUE-04` (VERIFIED FIXED).
```

---

### Repair R07 — Release Scheduling Preflight Validation Precedence
- **Findings:** `ISSUE-05` (`P9-REG-002`)
- **Dependencies:** Batch R06 complete.
- **Why first:** Unblocks failing unit test in release workflow acceptance suite (`flow-04-acceptance.test.ts:370`).
- **Acceptance criteria:** Test fixture or service expectation aligned so release preflight quality gate failures are asserted on approved releases; test passes with exit code 0.
- **Verification commands:** `npx.cmd vitest run tests/unit/flow-04-acceptance.test.ts`
- **Risk/rollback consideration:** Test-only change.

```markdown
# TASK: Repair R07 — Align Release Scheduling Preflight Quality Gate Test Fixture

## A. Bounded Goal & Scope
- **Finding ID:** `ISSUE-05` (`P9-REG-002`)
- **Goal:** Fix unit test failure in `tests/unit/flow-04-acceptance.test.ts` where release scheduling test receives `'Only an approved release can be scheduled.'` instead of expected gate error regex.
- **Starting Commit/SHA:** Current HEAD (with Batches R01–R06 applied).
- **Branch Policy:** Work on current branch.
- **Affected File:** `tests/unit/flow-04-acceptance.test.ts` (around line 370)

## B. Observable Failure & Root Cause
- **Reproduction:** Run `npx.cmd vitest run tests/unit/flow-04-acceptance.test.ts`
- **Expected:** Error matching `/blocked by unresolved publication-blocking quality or preflight gate issues/`.
- **Actual:** Test fails: throws error `'Only an approved release can be scheduled.'`.
- **Root Cause (PROVEN):** In `src/modules/releases/service.ts:518-520`, Subpass 07C checked `release.status !== 'approved'` before checking preflight gate snapshots. The test fixture at line 370 had status `'draft'`, triggering the approval guard before reaching gate evaluations.

## C. Implementation Requirements
- In `tests/unit/flow-04-acceptance.test.ts`:
  Set the test release fixture status to `'approved'` before asserting that unresolved quality gates block scheduling:
  ```typescript
  status: 'approved',
  ```
- Alternatively, if testing both guards, assert approval failure first, then test gate blocking on an approved release.

## D. Verification & Regression Testing
- **Command:** `npx.cmd vitest run tests/unit/flow-04-acceptance.test.ts` (Must exit 0).

## E. Non-Goals & Safety Restrictions
- Do not bypass the release approval requirement in production service code.

## F. Time/Complexity Budget
- **Budget:** SMALL (5 minutes, fixture state adjustment).

## G. Final Handoff Requirements
Report:
1. Diff of `tests/unit/flow-04-acceptance.test.ts`.
2. Output of `flow-04-acceptance.test.ts`.
3. Status of finding `ISSUE-05` (VERIFIED FIXED).
```

---

### Repair R08 — Unit Test Assertion & Hook Count Alignment
- **Findings:** `ISSUE-07` (`P9-FEAT-001`), `ISSUE-08` (`P9-REG-003`), `ISSUE-09` (`P9-REG-004`)
- **Dependencies:** Batch R07 complete.
- **Why first:** Resolves the final 3 failing unit test suites across the repository, achieving a 100% green test run across all 241 test files.
- **Acceptance criteria:**
  - `rc01-admin-truth.test.tsx:61` asserts CRM contacts directory markup.
  - `rc02-public-queries.test.ts:48-58` includes `contentType: 'article'` in spy matcher.
  - `tenant-isolation.test.ts:36` asserts `Categories.hooks.beforeChange` length of 3.
  - Full suite `npx.cmd vitest run tests/unit` passes with 0 failures.
- **Verification commands:** `npx.cmd vitest run tests/unit`
- **Risk/rollback consideration:** Test-only changes reflecting verified architectural enhancements from Subpasses 06A, 04A, and 09D.

```markdown
# TASK: Repair R08 — Reconcile Unit Test Spies, Default Tab Markup, and Hook Counts

## A. Bounded Goal & Scope
- **Finding IDs:** `ISSUE-07`, `ISSUE-08`, `ISSUE-09`
- **Goal:** Align stale unit test assertions with canonical implementations from Pass 09 features.
- **Starting Commit/SHA:** Current HEAD (with Batches R01–R07 applied).
- **Branch Policy:** Work on current branch.
- **Affected Files:**
  - `tests/unit/rc01-admin-truth.test.tsx` (line 61)
  - `tests/unit/rc02-public-queries.test.ts` (lines 48–58)
  - `tests/unit/tenant-isolation.test.ts` (line 36)

## B. Observable Failure & Root Cause
1. `rc01-admin-truth.test.tsx:61`: Fails expecting legacy placeholder text `'Audience intake'` in static markup. Subpass 09D unified the CRM contacts tab as default.
2. `rc02-public-queries.test.ts:48-58`: Fails because spy expects 2 `where.and` clauses, but receives 3 due to added `contentType: 'article'` filter.
3. `tenant-isolation.test.ts:36`: Fails expecting `Categories.hooks.beforeChange` length of 2, but receives 3 due to added `assertSeoCanonicalConflictFree` hook in Subpass 06A.

## C. Implementation Requirements
- In `tests/unit/rc01-admin-truth.test.tsx:61`: Update static markup assertion to verify unified CRM directory copy (`'CRM contacts'` or `'Audience directory'`).
- In `tests/unit/rc02-public-queries.test.ts:48-58`: Update spy assertion to expect `{ contentType: { equals: 'article' } }` alongside site and status.
- In `tests/unit/tenant-isolation.test.ts:36`: Update `toBe(2)` to `toBe(3)` for `Categories.hooks?.beforeChange?.length`.

## D. Verification & Regression Testing
- **Command:** `npx.cmd vitest run tests/unit` (Must pass all 241 test files with 0 failures).

## E. Non-Goals & Safety Restrictions
- Do not remove canonical query filters or validation hooks from production code.

## F. Time/Complexity Budget
- **Budget:** SMALL (10 minutes, targeted assertion updates).

## G. Final Handoff Requirements
Report:
1. Diff across all 3 test files.
2. Complete `npx.cmd vitest run tests/unit` summary (241 passed files).
3. Status of findings `ISSUE-07`, `ISSUE-08`, and `ISSUE-09` (VERIFIED FIXED).
```

---

### Repair R09 — Background Worker Stale Job Reaper
- **Findings:** `ISSUE-11` (P1 Data Integrity / Disaster Recovery Defect)
- **Dependencies:** Batch R08 complete.
- **Why first:** High data integrity risk. If worker is terminated during order settlement or payment event processing, jobs remain in `processing` indefinitely post-restore because worker lacks a stale-job recovery cycle.
- **Acceptance criteria:** Worker executes periodic sweep resetting `processing` jobs older than 10 minutes back to `pending`/`received`; automated test verifies reset.
- **Verification commands:** `npx.cmd vitest run tests/unit/commerce-tasks.test.ts` (or equivalent worker test)
- **Risk/rollback consideration:** 10-minute timeout ensures actively running jobs are not prematurely interrupted while orphaned jobs are reliably recovered.

```markdown
# TASK: Repair R09 — Implement Background Worker Stale Job Recovery Reaper

## A. Bounded Goal & Scope
- **Finding ID:** `ISSUE-11` (P1 Data Integrity Defect)
- **Goal:** Prevent webhook events and background jobs from remaining stranded in `processing` indefinitely following an ungraceful shutdown or database restore.
- **Starting Commit/SHA:** Current HEAD (with Batches R01–R08 applied).
- **Branch Policy:** Work on current branch.
- **Affected Files:**
  - `src/scripts/run-jobs-worker.ts`
  - `src/modules/commerce/tasks.ts`
  - `tests/unit/worker-stale-jobs.test.ts` (new test)

## B. Observable Failure & Root Cause
- **Reproduction:** Insert a `payment-webhook-events` row with `processingState: 'processing'` and `updatedAt` set to 20 minutes ago. Start worker.
- **Expected:** Worker detects stale in-flight job, resets it to `'received'`, and re-processes it.
- **Actual:** Job remains in `'processing'` forever; order is never settled.
- **Root Cause (PROVEN):** In `src/scripts/run-jobs-worker.ts`, the SIGTERM handler immediately exits without awaiting jobs. The worker poll loop only queries jobs in `'pending'` or `'received'`. There is no sweep for stale `'processing'` records.

## C. Implementation Requirements
- In `src/scripts/run-jobs-worker.ts` (or via a scheduled commerce task):
  Add `recoverStaleProcessingJobs(payload)` that runs on worker boot and every 5 minutes:
  1. Query `payment-webhook-events` where `processingState: 'processing'` and `updatedAt < Date.now() - 10 * 60 * 1000`.
  2. Update them to `processingState: 'received'`.
  3. Query `payload-jobs` in state `'processing'` with stale lock timeouts and reset to `'pending'`.
- Log all recovered jobs with `logger.warn({ count, event: 'jobs.stale_recovered' })`.

## D. Verification & Regression Testing
- Create `tests/unit/worker-stale-jobs.test.ts`:
  1. Insert mock stale job in `processing` with old `updatedAt`.
  2. Invoke `recoverStaleProcessingJobs`.
  3. Assert job state is reset to `'received'`.
- Run `npx.cmd vitest run tests/unit/worker-stale-jobs.test.ts`.

## E. Non-Goals & Safety Restrictions
- Do not reduce the stale threshold below 10 minutes (prevents racing healthy slow jobs).
- Do not introduce distributed locks or external Redis dependencies.

## F. Time/Complexity Budget
- **Budget:** MEDIUM (25 minutes; worker lifecycle logic + unit test).

## G. Final Handoff Requirements
Report:
1. Diff of `src/scripts/run-jobs-worker.ts` and test file.
2. Output of `npx.cmd vitest run tests/unit/worker-stale-jobs.test.ts`.
3. Status of finding `ISSUE-11` (VERIFIED FIXED).
```

---

## 3. Final Integration Gate Work Order

### Integration Gate — Full Repository Verification & Pass-10 Promotion
- **Findings:** Validates complete resolution of `ISSUE-01` through `ISSUE-11`.
- **Dependencies:** Batches R01 through R09 complete.
- **Goal:** Verify all repository release gates cleanly pass and prepare an atomic commit for Pass 10 entry.

```markdown
# TASK: Integration Gate — Pass-10 Entry Verification & Promotion

## A. Bounded Goal & Scope
- **Goal:** Execute the non-negotiable Pass-10 Entry verification matrix across formatting, linting, typechecking, unit tests, presentation bundles, and production build.
- **Starting Commit/SHA:** Current HEAD (with Batches R01–R09 applied).
- **Branch Policy:** Work on current branch.

## B. Execution Matrix & Gate Verification Commands
Execute sequentially; any non-zero exit code halts the gate:
1. `npx.cmd prettier --check .` (Gate G-01a: Formatting Cleanliness)
2. `npx.cmd eslint . --max-warnings=0` (Gate G-01b: Zero Lint Warnings/Errors)
3. `npx.cmd tsc --noEmit` (Gate G-01c: Zero TypeScript Diagnostics)
4. `npx.cmd vitest run tests/unit` (Gate G-01d: All 241 Test Files Pass)
5. `node scripts/verify-presentation-bundles.mjs` (Gate G-06a: Zero Presentation Bundle Leaks)
6. `npm run build` (Gate G-06b: Next.js Standalone Production Build)

## C. Atomic Commit & Worktree Cleanliness
- Review `git status --short` to ensure zero stray files or uncommitted changes.
- Stage verified files and commit atomically with message:
  `fix(release): resolve pass-9 audit ledger findings (R01-R09) and unblock pass 10`
- Confirm new commit SHA.

## D. Handoff Deliverables
1. Full test and build execution logs.
2. Promotion verdict: GO FOR PASS 10.
```

---

## 4. Targeted Reproduction Work Order (Insufficient Evidence)

### Targeted Repro — Authentic Predecessor Production Database Upgrade
- **Finding:** `ISSUE-13` (Predecessor Upgrade Verification Gap)
- **Status:** `UNVERIFIED RELEASE GATE`
- **Why Repro First:** [`src/scripts/verify-upgrade-migration.ts`](file:///c:/Projects/RENEGADE%20CMS/Renegade-CMS/src/scripts/verify-upgrade-migration.ts) currently generates synthetic rows via raw `INSERT` rather than testing an authentic historical dump. A coding agent cannot implement a fix without the authentic predecessor database artifact.

```markdown
# TASK: Targeted Reproduction — Authentic Predecessor Database Dump Capture & Upgrade Verification

## A. Bounded Goal & Scope
- **Finding ID:** `ISSUE-13`
- **Goal:** Capture an authentic predecessor PostgreSQL `.dump` from migration 67 (`20260914_110000_med_05_video_workflow`) to replace synthetic `createHistoricalFixture` rows in `verify-upgrade-migration.ts`.
- **Prerequisite:** Access to a disposable historical database instance.

## B. Reproduction Protocol
1. Start disposable PostgreSQL container:
   `docker run --name renegade-historical-db -e POSTGRES_PASSWORD=postgres -p 5439:5432 -d postgres:17-alpine`
2. Run migrations up to milestone 67 using `DATABASE_URI=postgres://postgres:postgres@localhost:5439/postgres`:
   `npx payload migrate --to 20260914_110000_med_05_video_workflow`
3. Populate baseline data (1 publication, 2 sites, 5 articles, 2 staff accounts, 1 payment method).
4. Export sanitized dump artifact:
   `pg_dump -Fc -f fixtures/historical/renegade-predecessor-mig67.dump postgres://postgres:postgres@localhost:5439/postgres`
5. Update `verify-upgrade-migration.ts` to import `renegade-predecessor-mig67.dump` before running `payload migrate`.

## C. Non-Goals
- Do NOT simulate this with synthetic TypeScript mock objects.
```

---

## 5. Documented Justified Deferrals (Passes 10–18)

| Issue ID | Severity | Deferred Phase | Justification & Architectural Rationale |
| :--- | :---: | :---: | :--- |
| **`ISSUE-12`** | `P1` | Passes 11–12 | **17 Migrations Lack Rollback (`down()`):** Major structural milestones (e.g. video workflow, commerce settlement) permanently drop deprecated tables. Renegade CMoS architectural policy mandates a restore-from-backup disaster recovery model rather than in-place schema rollbacks. Documented in operator manual; non-blocking for Pass 10 packaging. |
| **`ISSUE-13`** | `P1` | Passes 12–13 | **Authentic Predecessor Upgrade Dump:** Requires sanitizing a real predecessor database dump from an authentic September 2026 deployment. Staging environment rehearsal is scheduled prior to multi-instance cloud deployments. |
| **`ISSUE-14`** | `P2` | Passes 13–15 | **Hardware WebAuthn & Carrier SMS Dispatch:** Cloud CI runners and offline sovereign test environments cannot attach physical USB FIDO2 tokens or cellular SIM cards. Emulators and CDP virtual authenticators provide comprehensive software layer coverage. |
| **`ISSUE-15`** | N/A | Dismissed | **Fabricated Telecom Stub Exception Claim:** Disproved by direct source inspection. `disabledTelecomAdapter` safely handles missing credentials with `{ ok: false, failure: { code: 'telecom_disabled' } }`. |
