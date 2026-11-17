# RC2-FIXALL-DEBT20 — Result (Nov 16, 2026)

Pre-RC3 fix-everything queue, item 2 of 4 (after the closure audit,
before DEBT-21 and DEBT-23). Owner direction: "Fix everything"
(Nov 16, 2026). Harbor's sub-call, stated for the owner's veto in the
delivery message: the v1 comment surface FOLDS into the live Payload
discussions store; the orphaned comm-04 SQL forum engine RETIRES.

**Verdict: PASS.** One comment store remains. Every moderation
target type now maps to a store a live path writes, and the v1
comment surface is provisioned by the same production function the
live comment path uses — the "no HTTP provisioning" finding that
E-02/E-03 had to work around is closed.

## What the fold means, concretely

- A v1 `thread_id` is a discussion id. The v1 routes, the
  Idempotency-Key requirement, the 60-second replay window, the
  5-per-60s rate limit, the depth-5 cap, the sanction gate,
  submission triage, the `comment.created.v1` outbox payload, and
  the 15-minute edit window all survive — re-pointed at
  `discussions` / `discussion-posts`.
- Idempotency rides a new column, `discussion-posts.clientMutationId`
  (migration `20261116_150000`), so a replay is a store lookup, not a
  second table. If the outbox write fails, the created post is
  removed again — the pair commits or neither does.
- Comment bodies fold into the live store's plain-text model: input
  is sanitized and mention-linked exactly as before, then reduced to
  text (mention anchors collapse back to `@handle`). The v1
  body_html model dies with the HTML store.
- Edit history moves to the community audit log
  (`comment.edited.v1`, previous body preserved) — the folded
  equivalent of `comment_revisions`.
- Reactions toggle in the live `community_reactions` table
  (target_type `post`); the v1 code vocabulary is stored as the
  reaction key. The disposable `comment_reaction_counters`
  projection and its rebuild function retire — counts aggregate
  from raw rows, as the live path already did.
- Lifecycle: closed = discussion `commentsPolicy`, frozen =
  `locked`/`archived`. The v1 premoderation toggle has no live-store
  equivalent; setting it now answers 422
  `UNSUPPORTED_LIFECYCLE_CONTROL` instead of being silently dropped.
- Moderation: `forum_post`/`forum_topic` targets are removed (their
  store had no live writer); the `comment` target resolves, locks,
  quarantines, removes and reinstates against discussion
  posts/discussions. Live comments continue to be reported as
  `post`/`discussion`/`member_profile` — no live path ever created
  `comment` cases.
- Member data export reads comments/revisions/reactions/
  subscriptions from the live store (revisions from the audit log);
  the retired forum stores' export sections are empty by
  construction and kept only for shape stability.
- Thread subscriptions survive keyed by discussion id; migration
  `20261116_160000` re-points their foreign key from the retired
  `comment_threads` table at `discussions(id)`, keeping
  ON DELETE CASCADE. (Integration caught this: subscribing to any
  live discussion failed with an FK violation. Unit mocks could not
  see it; real Postgres could.)
- `comment-identity.ts` is deleted. Its only production consumer was
  the composer; thread provisioning is
  `getOrCreateAttachedDiscussion`, the function the product itself
  uses.
- `executeDbQuery` moved to a leaf module (`db-query.ts`) so the
  folded lifecycle/composer layering stays acyclic; the composer
  re-exports it for its existing importers.

## comm-04 retire

Deleted: `forum-browsing.ts`, `forum-topic-operations.ts`,
`ForumTopicBrowser.tsx` (orphaned — no page renders it; the live
forum pages use `browseDiscussions`/`ForumThreadView` over
`/api/community`), the v1 topics routes (list/get/read-state), the
v1 spaces access route, and the comm-04c/04d suites.
`forum-space-access.ts` survives exactly one more pass as
`inbox-notifications`' only remaining dependency and retires with
DEBT-21; the inbox module's own forum deliverability branches
retire with it. Its comment reads were folded in this pass.

The orphaned SQL tables are NOT dropped (H-04 precedent — code
removal, not destructive drops): `comment_threads`, `comments`,
`comment_revisions`, `comment_reactions`,
`comment_reaction_counters`, `forum_topics`, `forum_posts`,
`forum_spaces`, `space_memberships`, `forum_topic_redirects`,
`forum_drafts`. Dropping them is named for 1.6 / the I-03 exit
report.

## Proof

- Typecheck: clean (repo script, typegen + tsc).
- Unit suite: 288 files / 2,115 tests, exit 0 (final gate run on the
  delivery tree). The retired suites' contracts are re-pinned
  against the folded implementation in
  `tests/unit/comm-03-folded-comments.test.ts` (36 tests);
  comm-03c keeps its migration-history pin.
- Migrations: fresh chain (136 migrations, incl. both new ones) and
  upgrade rehearsal both pass.
- Integration (real Postgres): rc08b 13/13 — including the digest
  projection over folded comments and a 501-comment member export —
  and thread-subscriptions-identity 2/2.
- Production build: exit 0.
- Journeys on the production build: E-02 **14/14 API + 3/3 browser**
  (identical to the pre-change baseline; stage 9's v1 rate guard now
  exercises the folded composer over HTTP, provisioned through the
  live attached-discussion function), E-03 **11/11 API + 4/4
  browser**.

## Findings recorded, not hidden

1. **DEBT-13 leftover on main.** The closure audit's DEBT-13 fix
   (bulk suppression load) changed the segment evaluator's query
   shape but not the rc1-09b/rc1-09d mocks, which still keyed on the
   old per-subscriber lookup — both tests failed on main `a93abdc`
   (suppressed subscriber stayed eligible, 3 recipients instead of
   2). The production change is correct; the mocks now answer both
   shapes. Fixed in this pass rather than passed on.
2. **E-03 projector stage vs rig residue.** The first E-03 run on
   the folded build failed one stage: the projector drains the
   outbox oldest-first with a hard 500-event cap, and this rig's
   outbox held 544 events of accumulated test residue, so the
   stage's new events never got projected. On a clean outbox the
   journey is 11/11 + 4/4. The cap behavior is worth the DEBT-21
   pass's attention — a production backlog over the cap would
   starve new events the same way. (DEBT-21 retires the projector;
   the canonical store already carries the traffic.)
3. **Fixture triage.** Routing rc08b's fixture comments through the
   guarded entry point triaged rapid near-identical posts into
   review — the product working as designed. The fixtures now write
   at the persistence level (the folded equivalent of the retired
   `persistCommentWithOutbox`), which is what they always meant to
   do.
4. The five modules-internal import cycles recorded by the closure
   audit are unchanged in shape except that the community cluster
   loses the deleted modules' edges; the cycle guard stays green
   across the collections boundary.
