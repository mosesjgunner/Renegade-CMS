# RC3-01 — Federation ownership and retry

**Verdict: the cross-site inbox finding is REPRODUCED on the tagged RC2
tree and FIXED on this branch.** A remote reply delivered to one site's
ActivityPub inbox wrote a discussion post onto another site's
discussion. The repair binds the reply lookup to the receiving actor's
site, its canonical origin, and discussion eligibility, and hardens the
dedupe race. DEBT-22: the RC2 dedupe-release repair is CONFIRMED at
route level; one concurrency wart (racing duplicates answered 401
instead of 202) is fixed here.

## Baseline

- Branch `rc3-01` from fresh-fetched `refs/gh/main` =
  `2d4cb3ddf70db5b5f9570297e6bae0d7ff8774bf` (the `rc2` tag target).
  Tree clean at creation. Nothing pushed; no PR.
- Fixture database: `rc301_release_acceptance` (this pass only),
  migrated fresh from the pinned tree.
- A VM replacement landed mid-pass (uptime reset, Postgres wiped);
  the rig was rebuilt (PostgreSQL 16 reinstall, role + database
  recreated, migrations re-run) and every result below was measured
  after the rebuild on the final tree.

## Fixture design

`tests/integration/federation-inbox-site-binding.integration.test.ts`
(12 tests) drives the real inbox route handler (`POST`) against two
isolated synthetic sites (A and B), each with its own publication
ActivityPub actor, sharing one discussion path; additional discussions
exist on one site only, and locked/closed discussions exist on both.
The remote peer is synthetic: its actor document is served from memory
(the single stub — the outbound actor-document GET in
`src/modules/network/safe-fetch`). Everything else is real: RSA
HTTP-signature verification against the peer key, the dedupe
record/release machinery, discussion resolution, and all Payload
writes, asserted from persisted state. Each site carries its own
canonical origin in the site-settings global — the global's own
validation forbids two sites sharing one canonical origin host — and
replies cite discussions under the owning site's canonical origin,
which is how canonical discussion URLs are actually minted. The
fixture registers its two origins in the shared acceptance database
and restores the global afterwards; it passes both alone and in a
combined run with the neighboring community/federation suites on the
same database.

## Proof on the unfixed tree (baseline `2d4cb3d`)

| Case                                                           | Result on tagged code                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| Happy path (own site, own origin, open discussion)             | Post created on A's discussion, `hidden` / `review` — correct |
| Discussion exists ONLY on site B, reply delivered to A's inbox | **1 post written onto site B's discussion**                   |
| Mirror: discussion only on A, reply to B's inbox               | **1 post written onto site A's discussion**                   |
| Same path on both sites, reply to A's inbox                    | Post landed on **site B's** discussion (wrong tenant)         |
| inReplyTo citing a foreign origin (`unrelated.example`)        | Post written anyway — only the pathname was used              |
| Locked/closed discussion on the receiving site                 | Post written — no eligibility check                           |
| Locked/closed discussion on the other site                     | Post written — cross-site and ineligible                      |
| Networking off                                                 | 404, nothing written — correct                                |
| Peer unreachable (actor fetch fails)                           | 401, nothing written — fails closed                           |

That is 7 failing tests against 5 passing on the tagged code with the
final fixture (log `rc301-proof-unfixed-final.log`, measured by
stashing this pass's fix on the final tree): both cross-site cases,
the same-path case, the foreign-origin case, the locked-discussion
case, the origin-disagreement case, and the concurrent-duplicate
acknowledgement case below. The happy path, both DEBT-22 retry legs,
networking-off, and unreachable-peer cases already passed.

## DEBT-22 verdicts (separate from the ownership verdict)

- **Failure before a side effect** (malformed `inReplyTo` throws after
  the dedupe record is created): the record is released, and the
  corrected retry of the same activity id processes fresh — exactly
  one post. **CONFIRMED** (the RC2 repair works at route level, not
  just at the mechanism level H-05 proved).
- **Failure after a side effect** (Follow: relationship row written,
  then Accept queueing throws because the peer actor has no inbox):
  retry recovers exactly once — one relationship (found by its
  idempotency key), one outbound Accept delivery. **CONFIRMED.**
- **Concurrent duplicates** (5 simultaneous deliveries of one
  activity): exactly one reply is created — post creation is gated
  behind `recordInbound`, and only the winner proceeds. Measured
  exactly-one in every run. Wart: under load, racing losers whose
  dedupe insert collided surfaced a Payload `ValidationError`
  (dedupe_key) that the old catch did not recognize as a duplicate,
  so they were answered **401 instead of 202** (statuses
  `202,202,202,401,401` in the loaded run; all-202 in the isolated
  run). No extra reply is possible through that path — the throw
  happens before any write — but a legitimate duplicate must be
  acknowledged, not rejected. **Fixed in this pass** (below).

## The fix

1. `src/app/(frontend)/ap/actors/[handle]/inbox/route.ts` — the
   Create/Note reply branch now resolves the reply target once and
   attaches only when ALL of these hold: the receiving actor's
   publication has a site; the `inReplyTo` origin equals that site's
   canonical origin (`canonicalOriginsBySite[site] ?? canonicalOrigin`
   via `resolveSiteSettings` — the same resolution the public feeds
   use); and a discussion exists **on that site** with the cited
   path, `status = open`, `visibility = public`,
   `commentsPolicy = open`, `moderationState != removed`. Otherwise
   the delivery is acknowledged (202) and nothing is written — fail
   closed, consistent with the existing unknown-discussion behavior.
2. `src/modules/social/activitypub-runtime.ts` — `recordInbound`'s
   create-error path now re-checks for the winning dedupe record
   before treating the failure as real, so a raced duplicate returns
   `duplicate: true` (route answers 202) regardless of the error's
   message shape. The original `'unique'` string check remains as a
   fallback.

No schema changes, no migrations, no new dependencies. The Follow
branch was already bound to the resolved actor and is unchanged.

## Verification on the fixed tree

- New fixture: **12/12 pass** on the final tree (log
  `rc301-proof-final.log`), including every case that failed on the
  tagged tree and both DEBT-22 legs.
- `npm run format:check` (repo-wide, as CI runs it): **pass**.
- ESLint on the three touched files (`--max-warnings=0`): **pass**.
- `npm run typecheck`: **pass** (exit 0).
- Unit suite (`npm test`, canonical scope `tests/unit`): **343 files /
  2,792 tests, all passed** (exit 0) — identical counts to the RC2
  baseline.
- Focused integration, combined run on the shared acceptance database
  (this fixture + `federation-inbox-retry.integration.test.ts` +
  `community-cross-site-boundaries.integration.test.ts` +
  `comm-00-community-pass.integration.test.ts` +
  `notifications-canonical-read.integration.test.ts`): **5 files /
  33 tests, all passed** (exit 0, log `rc301-focused-integration3.log`).
  An earlier combined attempt exposed that the fixture's first design
  assumed an empty site-settings global; the fixture now registers
  its own per-site canonical origins, which is both the product's
  enforced model and what makes it order-independent.
- Production build: **NOT RUN** — explicitly deferred to the combined
  RC2 maintenance verification, per the pass boundary. The full
  integration suite was not run either; the focused federation /
  tenant / community suites above are the integration proof for this
  file set.

## Ledger verdicts (for the RC3 ledger annotation)

- **#69 (federation):** the inbox write boundary was NOT tenant-safe
  at the tag; it is bound now, with the two-site fixture as proof.
  Public interop remains unverified (no real peer was contacted;
  synthetic fixtures only).
- **#71:** no separate defect found in this pass; the actor-binding
  residual below is recorded against it.
- **DEBT-22:** CLOSED with route-level coverage — dedupe release
  confirmed before and after side effects; the concurrency
  acknowledgement wart found by this pass is fixed in
  `activitypub-runtime.ts`.

## Remaining risks and residuals

- **Actor slug ambiguity (recorded, not fixed here):** publication
  slugs are unique per site, not globally, and `publicationActor`
  resolves by slug alone. Two same-slug publications on different
  sites make the addressed actor ambiguous. After this fix, every
  effect still binds consistently to the _resolved_ actor's site, so
  no cross-site write results; the residual is mis-delivery between
  same-slug actors, an addressing/availability concern. Recommended
  follow-up: scope actor resolution by the host-identified site when
  per-site canonical origins are configured.
- The origin gate compares against the site's configured canonical
  origin. A reply citing the discussion under a non-canonical alias
  host of the same site will be acknowledged without a write (fail
  closed by design).
- Eligibility now requires `commentsPolicy = open` and
  `visibility = public`: federated replies to members-only or
  unlisted discussions are no longer accepted. That is the intended
  policy reading (a remote public reply is a public write), recorded
  here so the behavior change is explicit.
