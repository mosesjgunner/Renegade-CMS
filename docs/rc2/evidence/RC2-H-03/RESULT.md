# RC2-H-03 — Architecture cleanup batch 1: route/ownership seams

**Verdict: PASS.** Two seams selected from A-03's register under the pack cap, each with a measured problem, a stated preservation contract, and old/new-path proof. Candidates passed over are recorded with reasons. Base: main `e296f0b` (after PR #70). The CI-format repair (PR #71) touches none of these files.

## Selection (from the A-03 seam register + debt register)

**Selected 1 — RC2-DEBT-21, the notification read shadow (seam: community notifications).**
Measured problem: `GET /api/community/notifications` read two stores — the canonical `notifications` collection (written by `dispatchCommunityNotification`, many production callers, proven in E-03) and the SQL `inbox_notifications` table, whose only writer is `projectPendingInboxEvents`, which has **no production caller**. The route served the inbox list as the primary `notifications` field **whenever the table held any rows**, and switched `unreadCount` to the inbox table's own counter; `PATCH` summed both stores' counters. Any future wiring of the projector (it is the documented COMM-06A worker adapter) or a manual backfill would therefore hide members' real notifications and double-count unread — a duplicated read path with a live shadowing hazard, invisible today only because the table is empty in production.

**Selected 2 — media-usage writers (A-03 seam 2 FRICTION).**
Measured problem: `media-usages` rows were written by three independent callers hand-rolling the same mechanics — `src/modules/media/workflow.ts` (find-by-usageKey, then update-or-create), `src/modules/graphics/service.ts` and `src/modules/community/profile-service.ts` (bare creates). A repeat write from the latter two would duplicate the row (or collide), and the upsert semantics existed in exactly one of the three copies — the register's "rule written twice, copies drift" pattern in miniature.

**Passed over, with reasons:**

- **RC2-DEBT-01 profile/space triple store (P1)** — the largest seam, but its consolidation touches audience segmentation, comment scoping, and forum access at once; it is not a behavior-preserving slice that fits batch 1 alongside another seam. Needs its own design pass (the H-02 brief already assigns the merge design to this territory; the member writing-path gap stays RC3 scope regardless).
- **RC2-DEBT-20 stranded discussion stores** — the store-status decision belongs with the profile/space work; the dead forum writer's deletion is H-04's sweep (zero-reference proof standard), not this batch.
- **Route-ownership collisions (five admin URLs, GUI pack map)** — not re-measured at this HEAD; the pack requires a measured cost at selection time.
- **Seam 11 webhook duality** — reads as complementary (delivery engine vs connection-API types), no demonstrated duplication cost.

## Seam 1 — canonical notification read (DEBT-21, hazard closed)

Preservation contract: routes unchanged (`GET`/`PATCH /api/community/notifications`; the v1 inbox routes untouched); response fields unchanged (`notifications`, `inboxNotifications`, `canonicalNotifications`, `unreadCount`); permissions unchanged (member session + site scope as before). With an empty inbox table — production reality — responses are identical to before in every field.

Change (`src/app/(frontend)/api/community/notifications/route.ts`): the canonical collection is now the single primary read — `notifications` always carries the canonical projection and `unreadCount` always the canonical unread count. The inbox rows remain available in their own `inboxNotifications` field. `PATCH` still marks the legacy inbox table read (the v1 surface depends on it) but its counter no longer feeds the response, ending the double count.

Proof — `tests/integration/notifications-canonical-read.integration.test.ts` (new, real DB + fixture world + the route handler in-process): a canonical notification and an inbox row (plus an inbox counter claiming 7 unread) exist for the same member. Fixed code: primary list = the canonical notification (not the inbox row), `unreadCount` = 1, inbox row still present in its field; mark-all-read reports 0 and the follow-up read shows the canonical item read. **2/2 pass on the fixed route; 2/2 fail on the pre-fix route** (git stash: the inbox row shadows the list and the count reads 7). E-03's canonical-notification journey is the behavior contract this preserves.

Remaining DEBT-21 scope (rewritten in the register): wire the projector as a worker task and retire the canonical collection read, or remove the projector + inbox tables — an RC3 community decision. The shadowing hazard itself is closed by this PR.

## Seam 2 — one media-usage write seam

Preservation contract: `media-usages` row fields, usageKey schemes, purposes, and lifecycle values are exactly as each caller produced them; callers keep field ownership. The only behavior delta: a repeat write from the graphics/profile paths now updates the existing row instead of creating a duplicate — the upsert semantic the workflow path already had.

Change: new `src/modules/media/usage.ts` — `recordMediaUsage(payload, data)`, the single find-by-usageKey → update-or-create path. Adopted by `media/workflow.ts` (its inline upsert removed), `graphics/service.ts`, and `community/profile-service.ts`. Production diff: 40 insertions / 55 deletions across the four source files, plus the 37-line seam module — the three hand-rolled copies collapse into one.

Proof — `tests/unit/media-usage.test.ts` (new, 3/3): create-on-new-key, update-on-existing-key, and the lookup contract (usageKey equality, limit 1, depth 0, access override). Affected unit suites re-run green: comm-06b inbox, comm-06c digests/outbox, comm-02 profile projection, media-publishing-workflows, calendar-graphics-contracts (29/30 on a first pass under VM-install CPU contention; the one timeout — a comm-06c digest test — passes 4/4 on re-run on a quiet box and touches no changed code).

## Gates

- Typecheck: clean (0 errors).
- Prettier: all touched files formatted (the H-02 lesson applied — every shipped file checked, including tests).
- Integration: the new test 2/2 pass / 2/2 fail-on-old (logs retained with the run).
- Not run: the full integration suite and a production build — the changes are confined to one route's read composition and one write seam behind existing callers; CI on this PR runs the full pipeline and is the deciding gate.

## Accounting

- Duplication removed: one shadow read path (route-level either/or + dual counters) and two of three hand-rolled usage writers.
- Files: 4 source files modified, 1 seam module added, 2 test files added, RESULT + register/status updates.
- No routes, import contracts, permissions, or historical IDs changed. No migrations.
