# RC2-FIXALL-DEBT21 — Result (Nov 17, 2026)

Pre-RC3 fix-everything queue, item 3 of 4 (after DEBT-20, before
DEBT-23). Owner direction: "Fix everything" (Nov 16, 2026). Harbor's
sub-call, stated for the owner's veto in the DEBT-20 delivery message:
the inbox notification projector RETIRES; the canonical notifications
collection carries all traffic.

**Verdict: PASS.** One notification store remains. The projector, its
store, its counter table and its repair utility are gone; every reader
now reads the canonical `notifications` collection, and every writer
was already canonical (`dispatchCommunityNotification`).

## What retired, and where each reader went

- `src/modules/community/inbox-notifications.ts` — deleted (projector,
  candidate resolver, inbox list/mark-read, deliverability and
  space-access helpers, cursor codec, snippet stripper).
- `src/modules/community/forum-space-access.ts` — deleted with it; its
  last consumer was the inbox module (it survived DEBT-20 for exactly
  this dependency).
- The v1 notifications surface (list, mark-one-read, mark-all-read)
  now reads the canonical store through two new service functions,
  `listMemberNotificationsPage` and `markMemberNotificationsRead`,
  built on the same visible set as `getMemberNotifications` — same
  policy gate, in-app channel filter, site scoping and block/mute
  filtering. The v1 response envelope and row shape are preserved
  ({notifications, nextCursor, unreadCount}; rows carry id, kind,
  targetType, targetId, snapshot, readAt, createdAt).
- The community notifications route drops the `inboxNotifications`
  compatibility field and the PATCH route's legacy mark-read call;
  the canonical list and count H-03 established are unchanged.
- Email digests: `deliverableCommunitySources` loses its inbox branch.
  Its canonical branch now also admits `comment.reply`, `thread.reply`
  and `comment.created` notifications, each re-checked at send time
  exactly as the retired branch checked them: the target post must
  still be published and moderation-clear on the site. Message kinds
  keep their conversation-membership re-check; follows are unchanged.
- The admin audience command-center's in-app statistic counts the
  canonical store (site-scoped through the activity event).
- `rebuildNotificationCounters` and its ops route
  (`/ops/rebuild-notification-counters`) retire with the counter
  table they repaired — nothing reads `member_notification_counters`
  anymore; unread counts are computed from the canonical store.
- The `inbox_notifications` and `member_notification_counters` tables
  are NOT dropped (H-04 precedent): orphaned, named for the 1.6
  schema-cleanup pass / I-03, like the comm-04 tables before them.

## Parity work the retire required

- A v1 comment reply previously notified its parent author only
  through the projector. The folded v1 composer now dispatches the
  canonical `comment.reply` notification itself — the same
  notification the community composer path has always sent — so the
  v1 surface keeps its behavior on the one remaining store.
  Best-effort by design: a notification failure never fails the
  comment (the outbox pair remains the atomic unit).
- Named gap, unchanged from production reality: thread subscribers
  receive no notifications. They never did in production — the
  projector that resolved subscribers was never wired to a caller.
  Wiring subscriber dispatch is new behavior, not consolidation; it
  is a candidate for RC3, recorded here rather than silently dropped
  or silently added.

## Findings closed on the way

- The DEBT-20 / E-03 finding about the projector's 500-event drain
  cap starving the inbox on a residue-heavy outbox dies with the
  projector: there is no drain anymore.
- The digest's deliverability policy (target still published/clear,
  membership re-check for conversations) survives the retire — it
  moved, it was not dropped with the module that housed it.

## Tests: deleted, re-pinned, replaced

- Deleted with their subjects: unit comm-04a (forum space access),
  unit comm-06b (inbox notifications), E-03's project-inbox spec
  (the acceptance that names its own removal).
- Re-pinned: comm-06c (digest sources are canonical notifications),
  comm-06d (counter-repair test removed with its subject; the hint
  tests remain), rc1-10c (block suppression now proven at the
  canonical dispatcher; the snippet contract now proven at the
  composer — a DM notification payload is a fixed placeholder, the
  message body never enters it), rc1-10d (deliverability proven at
  the digest source filter), the canonical-read integration test
  (the inbox shadowing setup is kept as regression bait: rows in the
  retired tables now have zero effect and no compatibility field is
  returned).
- Replaced: cross-site journey 5 (projector idempotency) is now the
  canonical guarantee on the live path — a replayed v1 comment
  submission creates exactly one post and exactly one notification;
  journey 2C proves block suppression at the dispatcher; journey 3's
  snippet block proves the bounded-excerpt payload contract through
  the real producer. E-03 stage 5 now proves a v1 reply notifies the
  parent author through the canonical store alone, and that no inbox
  field exists in the response.

## Proof

- Baselines first: E-03 on the pre-change build, 11/11 API + 4/4
  browser — unchanged after the pass: E-03 11/11 + 4/4 on the new
  build, with stage 5 showing `comment.reply=1 inboxField=false`;
  E-02 unchanged at 14/14 + 3/3.
- The full verify:release gauntlet was run locally stage by stage
  before delivery: fresh migrations ✓, fixture seed ✓, upgrade
  migrations ✓, format check ✓ (tracked tree), lint ✓, typecheck ✓,
  unit ✓, integration ✓, production build ✓ (exit 0), smoke ✓ PASS.
- Unit: 286 files / 2,095 tests, exit 0 (288 / 2,115 before; the two
  deleted suites account for the difference).
- Integration: full suite 65 files / 366 tests, exit 0 — including
  the re-pinned cross-site journeys (7/7), the canonical-read test
  (2/2) and the rc08b digest test (10/10 in its file).
- No new migrations in this pass.
