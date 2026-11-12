# RC2-E-03 — Notifications, messaging and collaboration state: RESULT

**Verdict: PASS** — API journey 11/11 stages, browser proof 4/4 stages.
The canonical notification path is proven end to end (event → right
recipient → mark read → preference gate → restart persistence), direct
messaging is proven through its request gate with idempotent sends,
and staff review comments are proven against canonical content ids.
One structural finding filed (RC2-DEBT-21): the outbox→inbox
notification projection is fully built but has **no production
caller**, and the read path would let it shadow the working store if
it were ever switched on as-is.

## Assignment

A canonical notification from a reply/moderation event shown to the
right recipient; mark read; restart/idempotency. One permitted
direct/group messaging path only if already implemented (denial +
retention semantics), else record E0/E1 for RC3. Review
comments/revision collaboration must reference canonical content IDs.
Realtime/offline failure must not corrupt saves. Do not build CRDT or
encryption.

## Environment

Production build (code identical to main `469245e` for the E family;
E-03 changed no production code) against the RC2 two-site world (Site
A `a.rc2-a04.test`, Site B `b.rc2-a04.test`). Six clean public members
signed in through the production magic-link path; staff sessions used
only for operator setup and the review-comment stage.

## Test boundary (stated plainly)

- Sign-in tokens minted via the production `issueMagicLink` from a
  spec (raw tokens are not observable over HTTP in the production
  profile; inherited from E-01) and completed over real HTTP.
- The v1 comment thread is provisioned through the production
  `getOrCreateCommentThread` from a spec (no HTTP route creates one —
  RC2-DEBT-20), and the inbox projector is run through its own
  production module from a spec, because measuring that nothing runs
  it in production is the point of the stage.
- The browser stages drive the real `/notifications` page with the
  browser member's session cookies set into the context (the sign-in
  ceremony itself was browser-proven in E-01).

## What was proven (11/11 API + 4/4 browser)

1. **Right recipient.** A forum reply dispatches a `thread.reply`
   notification to the thread author only — the replier and an
   uninvolved member hold none. Dispatch is synchronous in the
   canonical store (`dispatchCommunityNotification` →
   activity-events + notifications rows).
2. **Mark read.** PATCH with a notification id persists the read
   state and drops the unread count by exactly one (2→1).
3. **Ownership.** A foreign member PATCHing the author's notification
   id is a no-op; the target stays unread.
4. **Preference gate.** Setting the in-app preference for
   `thread.reply` to `off` suppresses new dispatches (count flat
   across a further reply); restoring `immediate` re-enables the
   channel.
5. **The projection seam (measured).** The v1 comment path writes
   `comment.created.v1` outbox events; the merged notifications GET
   nevertheless returns an empty inbox list because
   `projectPendingInboxEvents` has no caller in any route, job, or
   worker (grep-verified; only a test and this journey's spec call
   it). Run explicitly, the projector delivers: a reply event whose
   parent points at the author's comment lands in the author's inbox
   (processed 32 events, delivered 1 — the rest were moderation and
   pending-review targets that correctly fail the deliverability
   re-check), and the GET then serves it.
6. **DM request gate (designed semantics, verified in code and
   live).** A stranger's direct conversation starts
   `pending_request`. The recipient _can read_ the requester's
   messages before accepting (that is how they decide) and _is_
   notified of the first message, but replying before accepting is
   refused 403 ("Accept the request before replying"). Accept (200)
   unblocks replies; the requester then receives
   `direct_message.received`.
7. **Idempotent sends.** Re-sending with the same idempotency key
   returns 200 with `duplicate: true` and stores nothing new
   (message count flat).
8. **Decline is terminal.** After a decline, the requester's sends
   fail 403 ("This message request was declined").
9. **Review comments on canonical ids.** A staff review comment
   created against the article's canonical content id (201) carries
   that exact id in its record, lists back for Site A staff, and is
   invisible to Site B staff.
10. **Restart persistence.** After a full server restart, the same
    notifications return with the same read state and unread count
    (proven with live canonical rows in run 1 and re-verified in the
    final run).
11. **Cross-site isolation.** Site B shows none of Site A's
    notifications; Site A's conversation read against Site B's host
    is refused (404).

Browser (4/4): the `/notifications` page renders the reply
notification and offers Mark all read; clicking it issues the PATCH,
which the route's canonical-origin gate refuses in this sandbox
topology (403, measured — the page is served from
`http://<host>:39071` while the site's canonical origin is the seeded
https origin; `samePublicOrigin` compares the two — the same
origin-split family as RC2-DEBT-14); the identical mark-all request
carrying the canonical Origin succeeds (200) and the reloaded page
shows the cleared state.

## Findings

**F1 = RC2-DEBT-21 (P2) — the inbox projection is unwired, and its
read path shadows the working store.** `inbox_notifications` +
`member_notification_counters` + the projector
(`projectInboxEvent` / `projectPendingInboxEvents`, self-described as
a "worker adapter" designed for at-least-once replay) form a complete
second notification system fed by the outbox — but no worker, route,
or job invokes it, so in production the inbox is always empty and the
canonical store carries all traffic. Worse, the community GET picks
the inbox list _whenever it is non-empty_ instead of merging: in
journey run 2, after a single projected row landed for the author,
the author's primary list and unread count switched to the inbox
store and their canonical thread-reply/DM notifications disappeared
from the primary fields (they remain under `canonicalNotifications`).
Enabling the projector without fixing the read merge would visibly
regress members' inboxes. Also observed: `comment_thread_subscriptions`
— one of the projector's candidate sources — holds zero rows in this
world; subscription-driven delivery has no exercised writer in the
journeys.

**Not verified (named, not claimed):** the realtime notification
stream (`/api/v1/notifications/stream`, SSE) is mounted but was not
driven — E1. Group conversations exist in the composer and routes
but were not exercised — E1. Email-channel notification delivery was
not re-proven here (the audience email path is D-03's proof).

## E-levels after E-03

- Canonical notifications (reply / DM / follow dispatch, mark read,
  per-type in-app preference gate, ownership): **E2 proven**.
- Inbox projection from the outbox: **E1** — complete machinery,
  journey-projected once by hand, no production trigger
  (RC2-DEBT-21).
- Direct messaging with the request gate: **E2 proven**. Group
  messaging: **E1** (implemented, unexercised).
- Staff review comments / revision collaboration on canonical ids:
  **E2 proven**.
- Realtime stream: **E1** (mounted, unexercised).

Community & Member Systems family: **E2 proven across identity
(E-01), moderation (E-02), and notifications/messaging (E-03)** —
the E family is complete, with RC2-DEBT-19 (P1) and RC2-DEBT-21 (P2)
carried openly into RC3.
