# RC1 07B — PASS (bounded scheduler and durable worker execution), 2026-10-19

Timezone/DST-aware scheduling, worker claiming, leases, stale lease recovery, cancellation, and idempotent execution passed the scoped ordinary operator/API, negative, and restart acceptance. Aggregate RC1 remains NOT READY: full repository types retain preexisting 03D diagnostics.

## Source and Changes

Tested on dirty-tree overlay atop commit `ba65c8c7e40ff6b703ca9780d4da1ced44974934`.
Exact file state documented in `docs/rc/evidence/rc1/18-pass/07B/tested-tree.txt`.

Implementation paths updated for 07B:
- `src/modules/editorial/scheduler.ts`:
  - Added `getEffectiveSchedule` helper exposing target revision sequence, schedule status, worker lease metadata, retry counts, and sanitized execution logs.
  - Hardened `reconcileScheduleWorkerJobs` with `reclaimedStaleLeases` tracking and stale lease reclamation across worker crashes/timeouts.
  - Implemented `sanitizeErrorLog` to redact credentials, basic auth, database URLs, and bearer tokens from scheduler failure logs.
  - Maintained optimistic concurrency and revision pinning immutability: published revision is strictly pinned to the approved revision even if author creates newer drafts.
- `src/app/(frontend)/api/admin/calendar/schedule/route.ts`:
  - Enforced operator permissions: authenticated administrators/owners can schedule/cancel publications.
  - Integrated `convertLocalToUtc` with IANA timezone evaluation, ambiguous DST time handling ('earlier'/'later'), and nonexistent gap resolution ('advance'/'reject').
  - Enhanced `action === 'cancel'` to look up active jobs for the article and transition both the scheduled-publish-job and editorial workflow cleanly.
- `src/modules/editorial/persistence.ts`:
  - Mapped `'cancelled'` workflow lifecycle state safely to `'approved'` in `mapLifecycleToContentStatus` for Content collection and `article-family-content` persistence to respect database ENUM constraints.
  - Hardened `cancelScheduledPublication` to look up active scheduled jobs for the article companion when arbitrary idempotency keys are supplied.
- `tests/rc1-07b/verify.ts`:
  - Complete 07B verification script with 39 primary acceptance checks and 7 restart checks.
- `tests/unit/rc1-07b-scheduler-worker.test.ts`:
  - Unit test suite for DST calculations, error log sanitization, and lease timeout logic.

## Operator/API → Actual Persisted State → Observed Output

**39 checks / exit 0** in `trace-verify.json`.
- Tested DST boundary scheduling in America/Chicago:
  - Fall Back Ambiguous Time (2026-11-01 01:30): earlier instant maps to CDT (06:30 UTC), later instant maps to CST (07:30 UTC).
  - Spring Forward Gap (2026-03-08 02:30): advance mode correctly pushes forward to 03:00 CDT; reject mode throws `DSTNonexistentTimeError`.
- Scheduled Article 1 via Calendar Schedule API (`/api/admin/calendar/schedule`) by authorized publisher:
  - Database row created in `scheduled-publish-jobs` with status `queued` pinned to Revision 1.
  - Author edited Article 1 creating Revision 2 (`currentRevisionSequence: 2`).
  - Worker lease locking verified: Worker B attempting execution while Worker A holds active lease was rejected (`409` conflict error indicating leased by `worker-node-alpha`).
  - Stale lease recovery verified: simulated Worker A crash past lease expiration; Worker B reconciled, reclaimed stale lease, and executed publication.
  - Article 1 transitioned to `published` and strictly published pinned Revision 1 (NOT Revision 2).
  - Worker crash mid-publish / retry deduplication: rerunning worker execution on completed job succeeded idempotently without duplicates.
- Scheduled Article 2 across Spring Forward gap: reconcile executed publication exactly once at target time.
- Scheduled and Cancelled Article 3:
  - Scheduled via API, confirmed `queued`.
  - Cancelled via `/api/admin/calendar/schedule` (`action: cancel`).
  - Database status transitioned to `cancelled`; workflow lifecycle returned to `approved`.
  - Worker execution of cancelled job refused publication.
- Effective schedule exposure & error sanitization:
  - Exposes target revision, timezone, worker lease, and status.
  - Sensitive database credentials, passwords, and tokens redacted into `scheme://***REDACTED***@...`.
- Negative security:
  - Unauthenticated requests rejected (`403`).
  - Cross-site / foreign site operators denied scheduling (`403`).
- Schedule health endpoint (`/api/admin/schedule-health`): returned completed job counts and healthy worker status.

## Restart & Persistence Verification

**7 checks / exit 0** in `trace-restart.json`.
- Restarted isolated PostgreSQL container (`rc107b-20261019`).
- Re-authenticated and verified:
  - Completed Job 1 and Job 2 retained state in database.
  - Cancelled Job 3 retained `cancelled` status and approved lifecycle.
  - Published Article 1 retained `published` lifecycle and pinned Revision 1.
  - `/api/admin/schedule-health` returned healthy operator data post-restart.

## Exact Commands and Exit Codes

```powershell
# 1. Reset and migrate isolated database
powershell -ExecutionPolicy Bypass -File tests/rc1-07b/run-isolated.ps1 -Action migrate
# Exit: 0 (123 migrations applied)

# 2. Run unit tests
powershell -ExecutionPolicy Bypass -File tests/rc1-07b/run-isolated.ps1 -Action unit
# Exit: 0 (21/21 tests passed across 2 suites)

# 3. TypeScript check
powershell -ExecutionPolicy Bypass -File tests/rc1-07b/run-isolated.ps1 -Action types
# Exit: 0

# 4. ESLint check
powershell -ExecutionPolicy Bypass -File tests/rc1-07b/run-isolated.ps1 -Action lint
# Exit: 0

# 5. Full acceptance verification
powershell -ExecutionPolicy Bypass -File tests/rc1-07b/run-isolated.ps1 -Action verify
# Exit: 0 (39/39 checks passed)

# 6. Restart check
powershell -ExecutionPolicy Bypass -File tests/rc1-07b/run-isolated.ps1 -Action restart-check
# Exit: 0 (7/7 checks passed)
```

**Total Scoped Checks**: 67 passed / 0 failed / 0 skipped.

## Isolation and Clean Up

- Test execution ran against dedicated PostgreSQL container `rc107b-20261019` on port 5448 with database `rc107b_release_acceptance`.
- Test web server ran on port 38984 with isolated `.next-rc107b` build cache.
- All background web processes and docker containers have been terminated and cleaned up.
- Concurrent subpass 07C artifacts preserved.
- No live external services called, no emails dispatched, no git pushes or tags executed.
- Next subpass unexecuted.
