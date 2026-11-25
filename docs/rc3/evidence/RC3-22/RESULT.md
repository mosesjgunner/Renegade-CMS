# RC3-22 Result — Interop, APIs, Dev Tooling

Pass: RC3-22 (Wave 3). Branch base: `a6a94d6` (main after the RC3-21
merge, PR #148). Rows owned: #69–75. Before-state per row:
`docs/rc3/evidence/RC3-22/BASELINE.md` (written from a fresh audit of the
current code before any change).

## Verdicts

### #70 Renegade-to-Renegade networking — E0 → E1 (MOVED)

Built the `renegade-link/1` slice and proved it with a two-install
fixture (`tests/integration/rc322-renegade-link.integration.test.ts`,
6 tests, all passing):

- Two isolated Payload instances in one process, separate databases
  (`rc322_release_acceptance` for the receiving install,
  `rc322_peer_acceptance` created and migrated by the fixture for the
  sending install). The only stub is at the HTTP seam: install A's real
  signed request is handed to install B's real receiver route handler —
  the RC3-01 standard for two-party proofs.
- A signed `post` item syndicates onto **exactly the site the peer link
  is bound to**; a second site on the receiving install receives
  nothing (the #71 boundary, proven from the cross-install side).
- Re-delivery of the same item updates in place (one stored row, new
  title) — the dedupe key makes syndication idempotent.
- A delivery signed with the wrong key is rejected 401; a delivery
  claiming an unregistered origin is rejected 401. Rejections are
  written to the network audit log.
- Sender withdraw flips the item to `withdrawn`; receiver revocation
  withdraws everything the link delivered and refuses further
  deliveries; a link revoked on the sender side refuses to send at all.

Trust model: staff register a peer link out of band (peer origin, one
site, the peer's RSA public key); envelopes are RSA-SHA256 signed with
a ±5-minute window. No central directory, no phone-home, no required
SaaS. Collections `renegade-peer-links` and `syndicated-items` are
staff-only.

Level honesty: **E1, not higher.** The transport leg between the two
installs is stubbed at the HTTP seam (both installs share a process),
and the slice syndicates one item kind (a post) — no editorial
workflow, no multi-item sync, no live cross-host delivery is claimed.
Those are RC4 material.

### #69 Open social federation — E2 (local-peer bounded), demo delivered

The governing plan's hard gate asked for a real narrow sandbox demo or
an open failure. The demo is built and green
(`tests/integration/rc322-federation-demo.integration.test.ts`,
7 tests), labeled exactly what it is: **a local sandbox demo with two
synthetic peers; public/remote interop stays NOT VERIFIED.**

- A standalone post from a peer with no follow relationship is
  acknowledged (202) and **not retained**.
- Follow works in both directions: inbound Follow creates the active
  relationship and queues an Accept; the local install follows the peer
  through the real network service (outbound relationship, pending).
- A followed peer's standalone posts are cached as remote-object
  references; its reply lands on the local discussion with federation
  provenance persisted.
- A Delete from a non-author changes nothing; the author's Delete
  retracts its reply (marked removed) and its cached post.
- Blocking the peer hides its remaining cached references and rejects
  further deliveries (401).

Three bounded gaps found by the audit were closed in this pass:

1. **Provenance was silently dropped.** The inbox built a `federation`
   provenance object for remote replies, but `discussion-posts` had no
   such field, so it vanished on create. The field now exists (json,
   same migration as #70) and is populated, including the Note id.
2. **No Delete handling existed** (the type was accepted by the parser
   and then ignored), so a peer could never retract its own content.
   The inbox now handles Delete, matching the target by the persisted
   Note id **and** the verified author — nobody else's content can be
   retracted.
3. **Standalone posts materialized nothing** (`cacheRemoteObject` had
   zero callers). Posts from followed peers are now cached as
   remote-object references — the designed, non-editable home for
   remote content. The follow relationship is the authorization: an
   unfollowed peer's post is not retained.

Residual, named plainly: inbound `Undo` (e.g. unfollow) is still
accepted-and-unhandled, as are `Like`/`Announce`; outbound delivery to
real remote servers, WebFinger discovery against real hosts, and any
public-instance interop remain **NOT VERIFIED**.

### #74 Headless CMS & API — REST E2 confirmed; GraphQL NOT VERIFIED → E2

Judged separately, as required — GraphQL's level rests only on GraphQL
executions. Before this pass, no test in the repository had ever
executed either generated handler. `tests/integration/
rc322-headless-api.integration.test.ts` (5 tests) drives the real
`REST_GET` and `GRAPHQL_POST` route handlers with a real passkey staff
session whose operator grant covers one site, probing the `sites`
collection (whose read access is the grant boundary itself):

- REST: own site reads 200 with its data; the foreign site is denied
  (404; the list excludes it); an unauthenticated caller gets nothing.
- GraphQL: the schema is introspected live (the `Sites` query exists);
  the same grant-scoped session receives its own site only; an
  unauthenticated GraphQL caller receives no tenant data.

Both are local executed proofs against the authorization boundary. No
public, versioned API contract is claimed (that question was already
deferred to the 1.0 RC by RC3-00 and stays deferred).

### #71 Multi-tenancy — E2 CONFIRMED (single-install multi-site form)

No code change. The pass's obligation was to prove #70's trust
machinery does not blur this boundary: every peer link binds exactly
one site, and the two-install fixture proves an item cannot land on an
unbound site of the receiving install. Full shared-runtime
multi-tenancy remains 1.5+/2.0 scope, excluded from RC3's gate.

### #72 Plugin/module system — E2 CONFIRMED

No code change. The lifecycle service, module registry/profiles, and
extension kernel/API were re-verified against current code and their
focused suites re-ran green on this tree (see gauntlet notes). The
registration-expectation rule was exercised by this pass: adding the
two #70 collections required updating the literal registry list in
`tests/unit/payload-domains.test.ts` in the same change (the
module-registry accounting derives its expectations and needed none).

### #73 Provider adapter architecture — E2 CONFIRMED

No code change. Both adapter families re-audited: the extension
ProviderAdapter with the connection runtime (health states, bounded
retry on `unavailable`), and the RC3-20 commerce registries (contract
validation, capability advertisement, RC-canonical errors). No
in-scope contract, health, or retry gap was found; the adapter suites
re-ran green.

### #75 Developer & agent SDKs — E1 CONFIRMED

No code change. The SDK surface, the RC3-21 mounted agent tool, and
the public API/webhook doc were re-checked; #74's first executed proof
of the surfaces beneath them exposed no break.

## What was built (delta)

- `src/modules/network/renegade-link.ts` — the renegade-link/1 service
  (envelope parse/validate, RSA-SHA256 sign/verify, receive/withdraw,
  revoke, send) with every rejection audited.
- `src/app/(frontend)/api/network/renegade/syndicate/route.ts` — the
  receiver endpoint (bounded body, fail-closed).
- `src/collections/Network.ts` — `renegade-peer-links` and
  `syndicated-items` collections (staff-only), registered in the
  network payload domain and the module registry's network slug list.
- `src/migrations/20261125_060000_rc322_renegade_link.ts` — both
  tables, their locked-document relation columns, and the
  `discussion_posts.federation` column; registered in
  `src/migrations/index.ts` (179 migrations total, +1).
- `src/collections/Community.ts` — the `federation` provenance field on
  discussion-posts; `src/modules/social/activitypub.ts` — `remoteReply`
  carries the Note id; the inbox route — provenance pass-through,
  followed-peer post caching, and the Delete branch.
- `src/payload-types.ts` — regenerated, then hand-reconciled so the
  shipped diff is purely additive (87 insertions, 0 deletions): a fresh
  regeneration re-types two pre-existing Creator Studio json fields
  (`chunkManifest`, `creatorDetails`) from their committed
  `Record<string, unknown>` form to the generic JSON union and refreshes
  two field descriptions; those four hunks were restored to the
  committed text because the re-typing breaks
  `creator-studio/submissions.ts` typechecking — a pre-existing
  inconsistency between the committed types and a fresh regeneration,
  recorded here rather than silently shipped or silently fixed.
- Tests: `tests/unit/rc322-renegade-link.test.ts` (8),
  `tests/integration/rc322-renegade-link.integration.test.ts` (6),
  `tests/integration/rc322-federation-demo.integration.test.ts` (7),
  `tests/integration/rc322-headless-api.integration.test.ts` (5);
  `tests/unit/payload-domains.test.ts` expectation list updated.
- Ledger: `docs/rc3/RC3-90-AREA-LEDGER.md` + `.csv` rows #69–75;
  `docs/rc3/evidence/RC3-22/BASELINE.md`.

## Gauntlet (CI order, this tree)

Full logs in `~/workspace/rc3-wave3-logs/` (`rc322-gauntlet-*`).

- Fresh migrations: **PASS** — all 179 migrations apply from empty
  (178 on main + 1 new).
- Seed: **PASS**.
- Upgrade migrations: **PASS** — rehearsal from
  `20260914_110000_med_05_video_workflow` to current.
- Format check: **PASS** — repo-wide pinned prettier. (The ledger's
  level column re-padded because #74's level text shortened; verified
  mechanically that content changes are confined to rows #69–75.)
- Lint: **PASS** — eslint, zero warnings.
- Typecheck: **PASS** — zero errors.
- Unit: **2,983 passed, 0 failed** (RC3-21 baseline 2,975 → **+8**,
  exactly this pass's new unit tests). One mid-gauntlet failure was
  the registration-expectation list in `payload-domains.test.ts`,
  updated in this same change per the registration-expectation rule;
  the final full run on the finished tree is clean.
- Integration: **717 passed, 10 skipped, 0 failed** (RC3-21 baseline
  698 passed / 11 skipped → **+19 passed**; the visible skip sets are
  identical — the one-test skip delta is an environment-gated test
  executing under the CI-faithful environment, which omits
  `UPGRADE_MIGRATION_DATABASE_URL`). The +19 is this pass's 18 new
  integration tests (6 + 7 + 5) plus that one. The RC3-01 federation
  site-binding suite passes unchanged against the extended inbox.
- Focused confirmations along the way: the seven confirm-only suites
  for #71/#72/#73 (extension lifecycle/kernel/API, module registry,
  module profiles, RC3-20 adapters, ActivityPub) — 57/57 green.

## Blocked / not verified, named plainly

- Public/remote federation interop: NOT VERIFIED (no real remote
  server was contacted; the demo is local peers only).
- #70 live transport between separate hosts: not exercised (HTTP seam
  stubbed between the two installs, per the RC3-01 standard); the
  sender's real delivery path is the same `safeFetch` discipline the
  federation stack uses, with non-local peers required to be HTTPS.
- Inbound `Undo`/`Like`/`Announce` handling: not built (accepted,
  unhandled — pre-existing posture, unchanged by this pass).
- Production build + smoke: **RIG-BLOCKED locally** — the single solo
  attempt was OOM-killed at "Creating an optimized production build"
  on this shared 6 GB box (log `rc322-gauntlet-09-build.log`), the
  known local-rig limit; not retried, per the pass discipline. GitHub
  CI is the build arbiter for this delivery.
