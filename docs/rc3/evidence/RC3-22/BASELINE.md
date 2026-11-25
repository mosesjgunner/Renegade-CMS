# RC3-22 Baseline — Interop / APIs / Dev Tooling

Base: `a6a94d6e40d2cda09abcd4ed56e443fde9e0ff85` (fresh GitHub main, merge of
PR #148 / RC3-21). Scope: ledger rows #69–75 (Network & Extensibility family).
Every statement below is from a read-only audit of this tree, not from the
RC3-00 ledger text; where the two disagree, this audit governs.

## #69 Open social federation — ledger E2 (local-peer bounded)

What exists and is real:

- The ActivityPub inbox (`src/app/(frontend)/ap/actors/[handle]/inbox/route.ts`)
  verifies RSA HTTP signatures against the peer's published key
  (`verifyInboundActivity`), enforces a 5-minute signature window and body
  digest, dedupes by replay key, and rejects blocked actors/instances at
  verification time (`permitsRemoteSource` in `resolveRemoteActor`).
- Handled activity types: **Follow** (creates an inbound relationship and
  queues an Accept) and **Create/Note with `inReplyTo`** (a reply, written
  onto a discussion only when the RC3-01 site-binding predicates all hold:
  receiving actor's site, that site's canonical origin, open/public/open
  discussion). Outbound Follow/Unfollow and remote-object caching exist in
  `src/modules/network/service.ts`; delivery is a durable queued job
  (`network-delivery` task, HTTP-signed, 3 attempts, block-aware).
- RC3-01's two-site fixture (12 tests) proves the reply write boundary and
  the DEBT-22 retry/concurrency legs at route level.

Gaps found by this audit (all verified in code, not assumed):

1. **Remote-reply provenance is not persisted.** `remoteReply()`
   (`src/modules/social/activitypub.ts`) returns a `federation` object
   (actor, activityId, inReplyTo), but `discussion-posts` has **no
   `federation` field** (checked the collection and every migration), so
   Payload silently drops it on create. The only surviving traces are the
   permalink (a SHA-256 of the activity id) and `paginationAnchor`.
2. **No Delete handling.** The inbox has no Delete branch: a peer cannot
   retract content it previously sent. Combined with gap 1, author-verified
   deletion is impossible today.
3. **Standalone posts materialize nothing.** A Create/Note without
   `inReplyTo` is acknowledged (202) and recorded as an inbound activity,
   but no local object, reference, or post is created. The designed home
   for such references — `cacheRemoteObject` / `remote-objects`
   (`reference.remoteOnly: true`) — exists in the network service and has
   **zero callers** anywhere in `src/` or `tests/`.

Public/remote-instance interop remains **NOT VERIFIED** (no real remote
peer has ever been contacted; all proof is synthetic local peers).

## #70 Renegade-to-Renegade networking — ledger E0

Confirmed at this base: **no Renegade-to-Renegade machinery exists.** The
network module is ActivityPub-only (contracts, experience, key management,
local-peer, service, tasks — all protocol-agnostic plumbing around AP
semantics). There is no install identity for a Renegade peer, no trust
record, no syndication envelope, endpoint, or collection. Nothing was
invented at ledger time and nothing has been added since. This is the row
that must move: the governing plan's slice is one item syndicated between
two test installs, with authenticated, revocable trust.

## #71 Multi-tenancy — ledger E2 (single-install multi-site form)

The boundary machinery is the operator grant model
(`src/modules/operations/operator-grants.ts`): scoped operators resolve to
canonical `member-site-roles` grants; reads/writes are constrained per
site; RC3-01's two-site fixture is the standing tenant-boundary proof for
federated writes. Full shared-runtime multi-tenancy remains 1.5+/2.0
scope, excluded from RC3's gate. RC3-22's obligation is narrow: whatever
#70 adds must be bound to exactly one site per trust record and must not
widen any existing boundary.

## #72 Plugin/module system — ledger E2

`src/modules/extensions/` implements a real lifecycle service
(`lifecycle.ts`, 264 lines): manifest discovery without loading code,
compatibility/dependency/conflict/permission checks before activation,
per-extension health that degrades in isolation, migration failure
handling, and uninstall policies (retain/export/destroy with export and
confirmation requirements). The module registry
(`src/modules/module-registry.ts`) and profiles sit beside it. Standing
unit proof: `extension-lifecycle.test.ts`, `extension-kernel.test.ts`,
`extension-api.test.ts`, `module-registry.test.ts`,
`module-profiles-acceptance.test.ts`. No post-audit evidence was cited in
the ledger; this pass re-runs the focused suites on the final tree.

## #73 Provider adapter architecture — ledger E2

Two adapter families exist. (a) The extension provider-adapter contract
(`extensions/contracts.ts`, `reference-adapters.ts`, SDK
`defineProviderAdapter`) with a connection runtime that classifies
failures (`retryable: code === 'unavailable'` in `connection-runtime.ts`).
(b) RC3-20's commerce registries (`src/modules/commerce/adapters.ts`:
ProductSource / FulfillmentProvider / PaymentRail) — registered through
one mechanism, duplicate registration rejected, per-group shipping,
a deterministic dropship supplier emulator, and a BTCPay Greenfield rail
proven against a contract stub (`tests/unit/rc320-adapters.test.ts`).
This audit found **no contract/health/retry gap exposed by RC3-20** that
is in RC3-22's scope to repair; the pass re-verifies both families'
focused suites on the final tree and records the verdict.

## #74 Headless CMS & API — ledger E2 (REST) / NOT VERIFIED (GraphQL)

Both surfaces are Payload's standard handlers mounted from
`src/app/(payload)/api/`: REST at `[...slug]/route.ts` (REST_GET/POST/
PUT/PATCH/DELETE) and GraphQL at `graphql/route.ts` (GRAPHQL_POST), with
the playground route beside it. Staff authentication on both is the
passkey strategy (`renegade-passkey` session cookie, server-side session
rows) — the same strategy the app's admin routes use. Access is the
collection access layer (e.g. discussion-posts reads are constrained by
`operatorRelatedSiteAccess` to the operator's granted sites).

Audit finding: **no test in this repository has ever executed either
handler** — there is no reference to REST_GET, GRAPHQL_POST, or
`/api/graphql` anywhere under `tests/`. The REST E2 therefore stands on
older, non-repo evidence, and GraphQL's NOT VERIFIED is exact: the route
is mounted and the schema is generated, but nothing has ever run a query
through it. This pass executes both handlers for real, separately:
an authorized-site read succeeds, foreign-site data is denied, and an
unauthenticated caller gets nothing — for REST and for GraphQL
independently. No GraphQL claim will be taken from REST proof.

## #75 Developer & agent SDKs — ledger E1

The developer surface is `src/modules/extensions/sdk.ts`
(`defineExtension`, `defineConfigSchema`, `registerCapabilities`,
`defineProviderAdapter`, `defineExtensionJob`, `defineExtensionMigration`,
a test-environment helper), the extension API (`extensions/api.ts`), and —
since RC3-21 — one mounted read-only agent tool on the production
integrations route with server-side manifest lookup and persisted audit.
Public API/webhook documentation exists (`docs/PUBLIC_API_WEBHOOKS.md`).
E1 stands unless the #74 executions expose a break in the documented
client path; this pass checks that explicitly.

## Build plan for this pass (bounded)

1. **#70 E0 → E1:** new `renegade-peer-links` (trust) and
   `syndicated-items` collections in the network domain; an RSA-signed
   syndication envelope (repo-native primitives: SHA-256 body digest +
   RSA-SHA256, mirroring the federation signing model); a receiver route
   that verifies signature, link state, and site binding before any
   write; a sender service that refuses to send on a non-active link;
   revocation that rejects further deliveries **and** withdraws
   previously received items from the read path. Proof: two Payload
   instances on two databases in one integration fixture, transport
   stubbed only at the HTTP seam (the RC3-01 standard).
2. **#69 demo + bounded gap fixes:** persist the `federation`
   provenance (json field + migration, incl. the Note id); inbox Delete
   handling (author-only, target by persisted Note id; also removes
   cached remote objects); wire standalone posts from followed,
   permitted actors into `cacheRemoteObject`. One integration fixture
   runs the whole sandbox exchange: follow both ways, a post, a reply,
   a block (later inbound refused, prior references hidden), a delete
   (content removed) — labeled a local sandbox demo, nothing more.
3. **#74:** one integration fixture driving the real REST and GraphQL
   handlers with a site-scoped staff session: own-site read succeeds,
   foreign-site read is denied, unauthenticated read is denied — each
   surface judged on its own results.
4. **#71/#72/#73/#75:** confirmation only — focused suites re-run on the
   final tree; #71 additionally gets a negative in the #70 fixture
   (a link bound to site A cannot deliver content onto site B).
