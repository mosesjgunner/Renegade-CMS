# Coordinated Releases & Release Orchestration (FLOW-04)

## Overview

Renegade CMoS Coordinated Releases (`FLOW-04`) provide a robust, transactional release orchestration engine replacing loose grouping tags with an immutable, auditable release lifecycle. A release binds together multiple content items (Pages, Posts, Products), global presentation snapshots (templates, layout blocks, theme variables), media asset versions with rights verifications, redirect definitions, and distribution drafts into an atomically scheduled or manually executed bundle.

---

## 1. Release Specification & Lifecycle

A `CoordinatedRelease` document is created in the `content-releases` collection with:

- **Identity**: `name`, `title`, `purpose`, `ownerTeam`.
- **Targeting**: `site`, `publication`, `space`.
- **Timing**: `plannedInstant` (ISO timestamp), `scheduledFor`, `timeZone`.
- **Taxonomy**: `labels`, `campaign`, `dependencies` (prerequisite release IDs).
- **Revision Control**: `releaseRevision` (monotonically incrementing integer).

### Release States

```
               ┌─────────┐
               │  draft  │
               └────┬────┘
                    │ Submit for review
                    ▼
               ┌───────────┐
               │ in-review │
               └────┬──────┘
                    │ Approve (All gates clear or waived)
                    ▼
               ┌──────────┐
               │ approved │
               └────┬─────┘
                    │ Schedule (or Execute now)
                    ▼
               ┌───────────┐
               │ scheduled │◄── Worker Lease
               └────┬──────┘
                    │ Worker triggers execution
                    ▼
               ┌───────────┐
        ┌─────►│ executing │◄────── Safe Retry Failed Steps
        │      └────┬──────┘
        │           │
        │    ┌──────┴────────────────────────┐
        │    │                               │
        │    ▼ All steps pass                ▼ Some/all steps fail
        │ ┌───────────┐             ┌──────────────────┐
        │ │ completed │             │ partially-failed │ (or failed)
        │ └─────┬─────┘             └────────┬─────────┘
        │       │                            │
        │       │ Rollback requested         │ Rollback / Compensate
        │       ▼                            ▼
        │ ┌─────────────┐             ┌─────────────┐
        └─┤ rolled-back │             │  cancelled  │
          └─────────────┘             └─────────────┘
```

> **Strict Semantic Invariant**: Partial success is **NEVER** marked `completed`. If any non-fatal or fatal step fails during execution, the release transitions to `partially-failed` (or `failed`).

---

## 2. Pinning Exact Approved Revisions

Releases pin explicit immutable references:

- **`content`**: Exact approved revision ID of Pages/Posts.
- **`presentation`**: Snapshot of template IDs, global blocks, and CSS custom property theme tokens.
- **`media`**: Media item ID, file hash/version, and active rights clearance status.
- **`redirect`**: Redirect source pattern, destination, and HTTP status code (`301`/`302`).
- **`distribution`**: Multi-channel distribution draft IDs.

### Automatic Invalidation

When pinned inputs change (e.g. an artifact is added, removed, or has its revision updated) after preflight gates were evaluated or after approval:

1. The release's `releaseRevision` increments.
2. The gate snapshot's `fingerprint` no longer matches the artifact SHA-256 fingerprint.
3. The release status falls back from `approved` / `scheduled` to `in-review` or `draft`, requiring re-evaluation and re-approval.

---

## 3. Preflight Gate Matrix

Before a release can transition to `approved` or `scheduled`, it must pass preflight gate evaluation.

| Gate Rule                 | Target            | Severity    | Description                                                                       |
| ------------------------- | ----------------- | ----------- | --------------------------------------------------------------------------------- |
| `gate:permissions`        | User / Team       | **Blocker** | Verifies the operator holds `staff`, `editor`, `admin`, or `owner` permissions.   |
| `gate:approvals`          | Sign-off          | **Blocker** | Verifies required editorial and staging sign-offs are in place.                   |
| `gate:unresolved-reviews` | Content           | **Blocker** | Verifies zero open blocking review comments on pinned content revisions.          |
| `gate:url-conflicts`      | Slugs & Canonical | **Blocker** | Verifies no slug collisions or conflicting canonical URLs across published items. |
| `gate:redirects`          | Routing           | **Warning** | Checks redirect loops or chains (e.g. circular A -> B -> A).                      |
| `gate:quality-center`     | Discovery / QA    | **Blocker** | Enforces zero critical/high Quality Center findings (SEO, a11y, schema).          |
| `gate:media-readiness`    | Assets            | **Blocker** | Ensures all pinned media assets are processed, sized, and rights-cleared.         |
| `gate:dependencies`       | Releases          | **Blocker** | Verifies all prerequisite upstream releases are in `completed` state.             |
| `gate:worker-health`      | Execution Engine  | **Warning** | Verifies background job queue workers and database responsiveness.                |
| `gate:migrations-policy`  | Product Policy    | **Blocker** | Ensures no unapplied schema migrations or disallowed DDL changes.                 |

### Authorized Waivers

Authorized users (`owner`, `admin`, or `staff` with override permissions) may waive specific non-blocking or blocking gate rules:

- Requires an explicit `reason`.
- Requires an optional `expiresAt` deadline.
- Waiver events are permanently recorded in the release's `gateSnapshot` and `executionAudit`.

---

## 4. Saga Outbox Execution & Boundaries

### Ordered Transactional Execution

1. **Worker Lease Acquisition**: Worker acquires a lock via `leaseOwner` and `leaseExpiresAt` (default 5 minutes), preventing concurrent execution or race conditions across distributed instances.
2. **Step 1 — Content Revisions**: Published content revisions are updated atomically within the database transaction.
3. **Step 2 — Presentation Snapshot**: Pinned layout blocks, global variables, and theme tokens are applied.
4. **Step 3 — Media Assets**: Attached media assets are verified and linked to published content.
5. **Step 4 — Redirects**: Redirect rules are inserted or updated in the routing table.
6. **Step 5 — Cache Invalidation (Outbox)**: External edge/CDN and ISR caches are evicted.
7. **Step 6 — Distribution Webhooks (Outbox)**: Outbox event dispatched for downstream RSS, syndication, and distribution channels.

### Partial Failure Isolation & Safe Retry

- If Step 5 (Cache Invalidation) or Step 6 (Distribution) fails, the release transitions to `partially-failed`.
- The operator can inspect the exact failing step in the Release Center UI.
- Calling `retryRelease(id)` skips already succeeded idempotent steps (Content, Presentation, Redirects) and retries only the uncompleted/failed steps.

---

## 5. Rollback & Compensating Actions

A release in `completed`, `partially-failed`, or `failed` state can be safely rolled back:

- **Deterministic Reversion**: Content and presentation are reverted to their `lastKnownGoodState` (recorded during pre-execution snapshotting), creating a new deliberate published revision.
- **Redirects Disabled**: Any newly introduced redirects created by the release are set to inactive.
- **Cache Eviction**: CDN and ISR caches for affected URLs are invalidated again.
- **Audit Integrity**: The release transitions to `rolled-back`. The existing execution steps and audit history are **never** erased; a `release.rolled-back` audit event is appended to `scheduleAudit` with the operator ID, timestamp, and rollback report.

---

## 6. Admin Command Center (`/admin/releases`)

The administrative UI is accessible at `/admin/releases` and through Payload CMS navigation under **Publishing > Content Releases**.

Features include:

1. **Release Overview & Status Badges**: Filter by `draft`, `in-review`, `approved`, `scheduled`, `executing`, `completed`, `partially-failed`, `rolled-back`.
2. **Artifact Drawer**: Add/remove Pages, Posts, Globals, Media, and Redirects with exact revision IDs and diff inspection.
3. **Preflight Checklist**: Interactive status for all 10 gate rules with blocker alerts and one-click waiver authorization.
4. **Execution Log & Saga Timeline**: Real-time per-step status (`pending`, `executing`, `succeeded`, `failed`, `compensated`) with error messages and compensating action details.
5. **Operator Action Bar**: One-click Submit, Approve, Schedule, Execute Now, Retry Failed Steps, and Rollback.
