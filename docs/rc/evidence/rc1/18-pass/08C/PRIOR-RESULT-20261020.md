# RC1 SUBPASS 08C/70 RESULT: DISPATCH, OUTBOX, RETRIES AND ACCEPTANCE

## Status: PASS

- **Subpass**: 08C/70 — Dispatch, Outbox, Retries and Acceptance
- **Date**: 2026-10-20
- **Environment**: Isolated disposable PostgreSQL container `rc108c-20261020` on port `5449` (`rc108c_release_acceptance`), Next.js dev server on port `38997`, Playwright Chromium headless.
- **Tested Tree Manifest**: See `tested-tree.txt`.

---

## 1. Scope & Implementation Delivered

1. **Worker Dispatch Engine & Task Runner (`src/modules/social/tasks.ts`, `/api/admin/social/worker`)**:
   - Implemented `/api/admin/social/worker` supporting worker operations: `dispatch`, `dispatch-item`, `retry-failed`, and `reconcile`.
   - Multi-tenant site scoping enforced via operator grants (`operator-grants`, `member-site-roles`), active site header/cookie (`renegade-active-site`), and role permission checks (owner, administrator, staff).
   - Concurrency safety with distributed execution locks (`withExecutionLock` on `social-variant:${variantId}`) and database leases (`leaseOwner`, `leaseUntil`) preventing double-dispatch.

2. **Multi-Destination Delivery & Partial Destination Failure**:
   - Multi-variant drafts deliver to each destination independently.
   - When one destination succeeds (Bluesky) and another encounters a transient failure (ActivityPub 500), child variants accurately reflect `published` and `failed` states.
   - Parent draft status synchronizes dynamically to `partially-published`.
   - Recorded verified receipts in `external-posts` (`remoteId`, `remoteUrl`, `publishedAt`, `remoteState: 'published'`) and logged full execution history in `social-publish-attempts`.

3. **Truthful Provider Receipts & Local Harness Mode**:
   - Provider adapters (Bluesky, Mastodon/ActivityPub) utilize `socialFetch` with loopback enforcement via `SOCIAL_LOCAL_ADAPTER_ORIGINS`.
   - Local mock harness receipts retain `providerMode: 'local-harness'`, verified in database records and displayed as dedicated pills in the operator UI.

4. **Bounded Failed-Only Retries**:
   - `retry-failed` targets only failed queue items with `attemptCount < MAX_PROVIDER_ATTEMPTS` (3).
   - Successful items (Bluesky) are never re-sent (zero additional provider calls).
   - Failed items increment `attemptCount` through attempts 2 and 3.
   - Once `attemptCount >= 3`, retry policy halts further automated attempts, ensuring retries are strictly bounded.

5. **Lost-Response Reconciliation Across Worker Restarts**:
   - Provider adapters execute pre-flight `getRecord` lookups using deterministic `rkey = sha256(idempotencyKey).slice(0, 32)`.
   - If a post already exists on the remote provider (simulating worker crash before database write), the item is reconciled without creating duplicate posts (`createRecord` is not called).
   - Reconciled receipts are persisted with `reconciled: true` and transition the queue item to `published`.

6. **Safe Disconnect on Revoked Credentials**:
   - Accounts with revoked credentials (simulated 401 Unauthorized / expired token) fail cleanly with normalized `deadLetterReason` indicating `reconnect-required`.
   - Automated retries are suppressed until the operator reconnects the account credentials.

7. **Operator UI (Social Command Center)**:
   - Live status badge transitions dynamically (`SCHEDULED` -> `PARTIALLY-PUBLISHED`).
   - Persisted queue table presents status badges, retry counts, external links, dead letter reasons, and `local-harness` provider pills.
   - Added `⚡ Dispatch Due Queue` and `🔄 Retry Failed` action buttons with live feedback banner.

8. **PostgreSQL Container Restart Persistence**:
   - Verified that all states, drafts, variants, queue items, receipts, attempt counts, and dead letter reasons survive an ungraceful container restart.

---

## 2. Verification & Acceptance Results

### Unit Tests
- `tests/unit/rc1-08c-social-dispatch.test.ts`: **8 passed** (8/8).
  - Outbox status transitions, bounded retry policy, idempotency key generation, rate limit retry-after header parsing, reconnect-required classification, and dead-letter normalization.
- Across Subpasses 08A, 08B, and 08C: **20/20 unit tests passed**.

### Types & Lint
- `node ./node_modules/typescript/bin/tsc --noEmit -p tests/rc1-08c/tsconfig.json`: **0 errors**.
- `npx.cmd eslint`: **0 warnings, 0 errors**.

### Browser & Operator Acceptance Suite (`tests/rc1-08c/verify.ts`)
- **49/49 Acceptance Checks Passed**:
  - PASS 1-4: Sites, users, operator grants, and connected accounts seeded.
  - PASS 5-8: Negative security & access control (unauthenticated GET/POST 403, invalid token 403, foreign operator 403).
  - PASS 9-10: Worker stats endpoint and queue counters verified.
  - PASS 11-15: Multi-destination draft created, scheduled, and 2 queue items persisted.
  - PASS 16-18: Headless Chromium browser loads Social Command Center, selects Draft 1, verifies SCHEDULED badge.
  - PASS 19-23: Operator clicks [⚡ Dispatch Due Queue], UI dynamically updates to PARTIALLY-PUBLISHED, Bluesky displays PUBLISHED with `local-harness` pill, ActivityPub displays FAILED with truthful reason.
  - PASS 24-28: Database verified: Draft 1 partially-published, Bluesky published (attemptCount 1), ActivityPub failed (attemptCount 1).
  - PASS 29-32: External post record verified with remoteId and remoteUrl.
  - PASS 33-35: Publish attempts audit log verified with 2 attempts.
  - PASS 36-40: Bounded retries: Bluesky not re-sent, ActivityPub retried to attemptCount 2 and 3, bounded policy stops further retries (0 items retried).
  - PASS 41-47: Lost-response reconciliation: pre-flight check recovers existing record without calling createRecord, item published, receipt marked `reconciled: true`.
  - PASS 48-49: Safe disconnect on revoked credentials: item failed with `reconnect-required`.

### Container Restart Persistence (`tests/rc1-08c/verify.ts --restart`)
- **11/11 Persistence Checks Passed**:
  - PASS 1-2: Draft 1 persisted with `partially-published` status.
  - PASS 3-6: Bluesky queue item remains `published` with external post and `local-harness` receipt.
  - PASS 7-8: ActivityPub queue item remains `failed` with preserved attempt count 3 (bounded max).
  - PASS 9: Draft 2 reconciled item remains `published`.
  - PASS 10-11: Draft 3 safe disconnect item remains `failed` with `reconnect-required` reason.

---

## 3. Artifacts Captured

- UI Screenshots:
  - `01-draft-scheduled.png`: Draft 1 in scheduled state with 2 persisted queue items.
  - `02-after-dispatch.png`: Live Social Command Center post-dispatch showing PARTIALLY-PUBLISHED badge, Bluesky published pill, and ActivityPub failure reason.
- API & Navigation Trace: `journey-trace.json`.
- Restart State Checkpoint: `state.json`.
- File Manifest: `tested-tree.txt`.
