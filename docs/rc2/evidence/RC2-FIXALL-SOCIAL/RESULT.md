# RC2-FIXALL-SOCIAL — DEBT-17 + DEBT-25 (pre-RC3 fix queue)

**Verdict: PASS.** Both social debts from the pre-RC3 decision sheet are
closed under the owner's "fix everything" direction (Nov 16, 2026):
RC2-DEBT-17 as option IN-A (release-scoped approval exception) and
RC2-DEBT-25 as IN (reconcile may settle bounded-out failures via a
read-only provider lookup). Two adjacent defects the proof runs exposed
are fixed in the same pass and named below — neither was in the original
register rows. No Red-gate defects were found or introduced.

## Candidate identity

- Base: GitHub main `be4abf5` (PR #86 merge, RC2-DEBT-01). Branch
  `rc2-fixall-social`. Verification ran against production standalone
  builds of the repaired tree (build stamp reports the base SHA with
  "clean source: false" — the uncommitted repairs, as expected).

## DEBT-17 — release-scoped approval (IN-A)

The deadlock: draft approval refused (400) while a draft's source
article was unpublished, but the release that publishes the article
requires the draft approved before execution — a source-linked draft
could never be distributed by its own article's release.

Fix (`src/app/(frontend)/api/admin/social/drafts/route.ts`): when the
source content is unpublished, the approve action now searches the
draft's site for an active release (draft / in-review / approved /
scheduled) whose artifacts pin **both** a distribution item for this
draft **and** an article item whose pinned revision resolves to the
draft's source content (article artifacts pin the
`article-family-content` companion id; the helper resolves the
companion's `content` field, and also accepts direct id equality). On a
match, approval proceeds and the response carries
`releaseScopedApproval: { releaseId, pinnedRevisionId }`. Otherwise the
400 stands, with a message naming the exception ("…unless the draft is
pinned into a release that publishes it"). The execution-time published
check in `executeReleaseDistribution` is unchanged.

Proof: the D-04 journey now builds the real source-linked shape
(`sourceContentId` set at draft creation; approval happens after the
release pins exist — the F1 workaround is removed from the harness).
Both release arcs assert approve = 200 with the matching release id in
`releaseScopedApproval`, and both releases complete distribution.

### Adjacent trap found by D-04: approval invalidated the release pin

First D-04 run on the repaired tree failed both distribution items with
"Pinned artifact has changed; create a new approved release." Cause:
the pin fingerprint (`src/modules/releases/artifact-scope.ts`) included
each variant's `approvalHash`. That hash is a deterministic function of
network / text / linkUrl / attachments — every one of which is
fingerprinted directly — so it added no content protection, but its
null → value transition at approval made the pinned state differ at
execution. The stamp is no longer fingerprinted; a post-approval content
edit still changes the fingerprint through the content fields
themselves. After the fix, D-04 runs clean (below).

## DEBT-25 — bounded-out failures settle by reconcile (IN)

Three pieces, in the order the proof runs forced them:

1. **The live adapter had no reconcile.** The roster `blueskyAdapter` in
   `src/modules/social/provider-runtime.ts` — the adapter the executor
   actually uses — implemented no `reconcile` (only the unused class
   adapter in `adapters/bluesky.ts` had one), so no uncertain item could
   ever settle automatically. It now derives the deterministic record
   key (`sha256(idempotencyKey)`, first 32 hex chars) and reads the
   record back: found + text match → published with remote id/url;
   missing or mismatched → `unknown` (quarantined); errors → `unknown`.
   It never sends.
2. **Executor + operator sweep.** `canReconcileBoundedFailure` (failed
   with attemptCount ≥ `MAX_PROVIDER_ATTEMPTS` = 3) gates a recovery
   path in `executeSocialQueueItem` that only reconcile mode may take
   and that spends no attempt. The worker route's reconcile sweep admits
   bounded-out failures alongside `unknown` items.
3. **The automatic sweep never saw terminal items.** `recoverSocialOutbox`
   (run every jobs-worker cycle) picked up failed items only when a
   `nextAttemptAt` was due — bounded-out items are terminal and have
   none — and ran everything as retry. It now also selects bounded-out
   failures and runs them in reconcile mode. H-05's lost-response stage
   caught this: with only (1) and (2) in place, the stage's item stayed
   failed for the full 240 s poll.

Proof: new integration test
(`tests/integration/social-bounded-reconcile.integration.test.ts`)
against the AT-protocol fixture — a bounded-out item with its record
pre-committed at the provider settles **published with attemptCount
still 3 and exactly one fixture create**; with no record it goes
**unknown with zero creates**. The H-05 journey's final stage (provider
"repair" that lands the post but loses the response) now recovers to
published exactly once via the sweep.

## Verification

- Unit: full suite green — **291 files / 2,139 tests** — including a
  new gate test for `canReconcileBoundedFailure` (bounded =
  reconcile-eligible, never retry-eligible).
- Integration: `social-bounded-reconcile` 2/2;
  `social-release-distribution-key` pass.
- Journeys on the final production build: D-04 **10/10** (both
  release-scoped approvals, both releases complete, distribution posts
  exactly once per arc); H-05 **7/7** — including the lost-response
  stage, which passes for the first time (it was kept as a deliberate
  failure through H-05 and I-01 as the DEBT-25 marker): the item spends
  its 3 attempts, the post lands at the provider with its response lost,
  and the automatic sweep settles it published with exactly 1 create.
- Typecheck clean on touched files; prettier applied to every shipped
  file.
