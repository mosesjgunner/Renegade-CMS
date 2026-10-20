# RC1 SUBPASS 08B/70 RESULT: COMPOSER, APPROVAL AND SCHEDULING

## Status: PASS

- **Subpass**: 08B/70 — Composer, Approval and Scheduling
- **Base Commit**: `41fd29400811ef564043e4daaad1757f98f68513`
- **Date**: 2026-10-20
- **Environment**: Isolated disposable PostgreSQL container `rc108b-20261019` on port `5448` (`rc108b_release_acceptance`), Next.js dev server on port `38996`, Playwright Chromium headless.
- **Tested Tree Manifest**: See `tested-tree.txt`.

---

## 1. Scope & Implementation Delivered

1. **Persisted Social Drafts & Network Variants**:
   - Implemented `/api/admin/social/drafts` REST endpoint supporting full lifecycle actions: `create-draft`, `update-draft`, `submit-review`, `approve`, `decline`, and `schedule`.
   - Built canonical attribution binding `sourceContentId`, `sourceRevisionId`, `canonicalUrl`, and strict multi-tenant site scoping with `renegade-active-site` cookie and operator grant verification.
   - Per-network copy/media variants in `social-network-variants` with inheritance from canonical draft copy and independent per-platform overrides.

2. **Adapter Pre-flight & Platform Constraints**:
   - Integrated adapter validation (`validatePost`) checking character length limits (e.g., Bluesky 300-grapheme limit) and media attachment constraints before draft creation and variant updates.
   - Verified negative validation: draft creation with 350-character text on Bluesky is rejected with HTTP 400 and clear error message (`Text length (350) exceeds Bluesky 300 grapheme limit by 50`).

3. **Approval Gates & Cryptographic Hash Pinning**:
   - Enforced role gates: only users with `owner` or `administrator` roles can approve, decline, or schedule drafts (`staff` and unauthorized roles are rejected with HTTP 403).
   - Approval gate computes a cryptographic SHA-256 hash (`approvalHash`) over the variant network, canonical URL, resolved text, and sorted attachment IDs, pinning the exact approved content.
   - Any post-approval edits require re-submission and re-approval.

4. **Release Scheduling & Queue Items**:
   - Scheduling action verifies draft is in `approved` status, validates `scheduledFor` timestamp, sets draft and variant status to `scheduled`, and atomically creates rows in `social-queue-items`.
   - Each queue item receives a deterministic idempotency key (`draft:{draftId}:network:{network}:hash:{hash[:12]}`) to prevent duplicate enqueueing or dispatches.

5. **Decline Gate & Unsent Policy**:
   - Declining a draft transitions the draft and all child variants to `cancelled`.
   - Scheduling a cancelled draft is rejected with HTTP 400.
   - Confirmed in database that declined drafts produce exactly zero `social-queue-items`, guaranteeing publication remains opt-in and unsent.

6. **Interactive UI (Social Command Center)**:
   - Added Persisted Draft & Scheduling Workflow card (`[data-testid="draft-workflow-panel"]`) in `src/modules/admin/SocialCommandCenter.tsx`.
   - Supports selecting drafts, creating new drafts, switching network tabs, toggling network overrides, entering custom copy/links/attachments, submitting for review, owner approval, declining, and scheduling release times.
   - Persisted queue items table displays scheduled queue items directly from the backend.

---

## 2. Verification & Acceptance Results

### Unit Tests
- `tests/unit/rc1-08b-social-composer.test.ts`: **6 passed** (approvalHash cryptographic pinning, adapter validation, canonical inheritance & override, deterministic idempotency keys).
- All social unit test suites (`dist-03-social-command-center.test.tsx`, `rc1-08b-social-composer.test.ts`, `rc1-08a-social-providers.test.ts`, `dist-05-social-api-routes.test.ts`): **23 passed**.

### Types & Lint
- `tsc --noEmit -p tests/rc1-08b/tsconfig.json`: **0 errors**.
- `eslint` on scoped files: **0 warnings, 0 errors**.

### Isolated Operator & Browser Acceptance (`tests/rc1-08b/verify.ts`)
- **42 checks passed**:
  - PASS 1-2: Social accounts created (Bluesky, ActivityPub/Mastodon).
  - PASS 3-5: Negative auth checks (unauthenticated 403, unauthorized 403, foreign tenant staff 403).
  - PASS 6: Negative validation (Bluesky > 300 chars rejected with 400).
  - PASS 7-19: Browser UI navigation, title entry, canonical URL, custom copy overrides for Bluesky and ActivityPub, draft save (`POST /api/admin/social/drafts` 201), status badge `draft`.
  - PASS 20-22: Review submission via UI, status badge updated to `in_review`.
  - PASS 23-25: Owner approval via UI, cryptographic `approvalHash` generated, status badge `approved`.
  - PASS 26-28: Scheduled release date selection and scheduling via UI, status badge `scheduled`, persisted queue items count = 2.
  - PASS 29-33: Database assertions on `social-queue-items` (exactly 2 created, status `scheduled`, deterministic `idempotencyKey`).
  - PASS 34: Screenshot saved (`composer-scheduled.png`).
  - PASS 35-41: Draft 2 created, declined via UI, database status `cancelled`, child variants `cancelled`, 0 queue items (unsent policy preserved), schedule attempt rejected with 400.
  - PASS 42: State and traces persisted.

### Container Restart & State Persistence (`tests/rc1-08b/verify.ts --restart`)
- **16 checks passed**:
  - PASS 1-3: Draft 1 persisted across container restart with status `scheduled` and canonical URL intact.
  - PASS 4-8: Both network variants (Bluesky, ActivityPub) persisted with status `scheduled` and `approvalHash` intact.
  - PASS 9-13: Both `social-queue-items` persisted with status `scheduled` and scheduled times intact.
  - PASS 14-15: Draft 2 persisted in `cancelled` status with zero queue items.
  - PASS 16: API GET `/api/admin/social/drafts?draftId=...` returns draft, variants, and queue items correctly.

**Total Acceptance Checks Passed**: 58 / 58 (100%).

---

## 3. Retained Artifacts
- `composer-scheduled.png`: UI screenshot showing scheduled draft with approved variants and persisted queue table.
- `state.json`: IDs and state captured during primary verification.
- `trace-verify.json`: Traces of all HTTP requests and browser steps.
- `persistence-final.json`: Dump of persisted records verified after PostgreSQL container restart.
- `tested-tree.txt`: Short working tree manifest.
