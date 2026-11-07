# Pass 18B — Harbor Continuation Result

## Verdict

**Result: PASS** (2026-11-07) — all gates green on the final tree,
including the full integration suite at **306 passed / 0 failed**. The
single blocker recorded in the 2026-11-06 round below was resolved by
Matthew's product decision of 2026-11-07 plus the layered teardown
completion documented in the resolution addendum immediately following
this section. The original NOT READY analysis is preserved below,
unchanged, as the record of how the blocker presented before the
decision.

## Resolution addendum — 2026-11-07

### The decision and the guard change

Matthew chose candidate resolution 1 from the blocker analysis below:
**exempt the system's own execution events in the site-deletion
guard**. `protectSiteHierarchyDelete` in
`src/modules/editorial/hierarchy.ts` (the 2026-11-06 text below cites
`src/modules/publishing/hierarchy.ts`; the guard lives in the
editorial module — path corrected here) no longer counts
`execution-events` among the collections that block site deletion,
following the existing `member-site-roles` precedent in the same
guard: system linkage created with the site must not make the site
undeletable. The events themselves are never deleted — the collection
stays append-only. A regression test in
`tests/unit/content-hierarchy.test.tsx` covers the exemption (unit
suite 2,083 = the 2,082 baseline + this test).

### Layers found beneath the guard (each verified, in discovery order)

Exempting the guard was necessary but not sufficient; the rollback
journey then failed at three further layers of the same family —
things the migration's own lifecycle creates that rollback never
removed. All fixes follow the sanctioned P2 pattern: rollback clears
what its own lifecycle created; no hierarchy guard was weakened beyond
the single decided exemption.

1. **Publications teardown.** The Sites afterChange hook auto-creates
   a `publications` row for every new site; rollback deleted the site
   without removing it and died at "The site still contains
   publications." The store gained `deleteSitePublications(siteId)`
   (Payload and in-memory implementations, mirroring P2's
   `clearContentRollbackReferences` pattern), called by
   `rollbackLegacyMigration` before `deleteSite`. Verified beforehand
   that publications carry no state the migration did not create.
2. **Media-blobs teardown.** `uploadMedia` creates deduplicated
   physical-byte records (`media-blobs`, keyed site+checksum) that
   rollback likewise never removed. The store gained
   `deleteSiteMediaBlobs(siteId)`; the Payload implementation deletes
   a site blob only when no media-asset (`originalBlob`) and no
   media-variant (`blob`) still references it — the same rule the
   product's own lifecycle cleanup uses.
3. **Execution-events foreign key (schema).** Even with the guard
   exempted, `execution_events.site_id` was `ON DELETE RESTRICT` +
   `NOT NULL` — the schema outlier among site foreign keys — so
   Postgres still refused the delete. Migration
   `20261107_120000_rc1_execution_events_site_detach` completes the
   decision at the schema layer: column nullable, FK now
   `ON DELETE SET NULL`, down migration reverses both. A deleted
   site's audit events survive, detached from the site, still
   carrying their required `tenantId`. Migration count is now 132.
   *Flagged for the reviewer: this layer goes beyond the originally
   diagnosed guard fix; it is the schema completion of the same
   decision, and no event is ever deleted by it.*
4. **Rollback teardown authority.** With the site finally deletable,
   a further full-suite-only failure surfaced: rollback's entity
   deletes run under the importing actor's personal access, and
   global collections such as `authors` require all-sites authority
   (`operatorAllSitesAccess`), which a site-scoped operator can
   never hold in a multi-site install — so a scoped operator who
   legitimately imported a site could never roll it back (reproduced
   with a probe: every site-scoped delete succeeded; the `authors`
   delete was Forbidden; in small-suite databases the same actor
   happened to hold grants on every site, which masked it).
   Classification: PRODUCT. `PayloadLegacyMigrationStore.deleteEntity`
   now deletes with `overrideAccess`, with the rationale recorded in
   the code: every caller removes only manifest-recorded,
   migration-created records; rollback invocation itself remains
   gated at the operator surface (staff role plus
   `canMigrateLegacySite` for the run's site); the store's other
   teardown paths already used `overrideAccess`; collection hooks
   (including the authors beforeDelete reference guard) still run.

### (B) disc-00 / med-03 fresh-DB failures — root causes

The parent round's full run showed 12 further failures (disc-00 9,
med-03 1, pre-05 1, pre-06 1). Bisected with fresh-DB replays,
subset runs, and resolver probes:

- **disc-00 — FIXTURE (suite isolation), two ambient-state hazards in
  the shared suite database.** (i) Host scope: route handlers resolve
  host→site through the shared `site-settings` global;
  commerce-runtime legitimately rewrites that global for its own
  scenario (`canonicalOriginsBySite[its site] = 'http://localhost'`)
  and `seed()` does not restore it, after which host `localhost:3000`
  resolved to the wrong site (probe-verified: resolved site ≠ the
  seeded site; on a clean DB the product's host routing works as
  designed). (ii) Discovery default scope: when
  `resolveDiscoveryDocument` / `getAllIndexableDiscoveryDocuments`
  are called without an explicit site — as this suite calls them,
  modelling a crawler — the product resolves the default site from
  the **newest active public publication**; a preceding suite's
  publication (e.g. a migration site's auto-created one) can be
  newer than the seeded `main`, scoping every lookup to the wrong
  site. Fix, fixture level, no assertion touched: beforeAll pins the
  seeded site's canonical origin for the test host (dropping foreign
  localhost entries, which the host matcher would otherwise treat as
  ambiguous) and creates a fresh active public publication on the
  seeded site so the default scope lands there deterministically;
  afterAll restores the pinned settings fields and deletes the scope
  publication, leaving shared state exactly as found — necessary
  because the pin's localhost origin otherwise trips the settings
  global's host-uniqueness validation for later suites' demo setup
  in reordered runs (observed and fixed during this close-out).
- **med-03 — ENVIRONMENT-PROTOCOL.** Its fixture is deterministic
  (site by slug, member by email; the media route takes its site
  from the asset, not host resolution) and it passed on every
  fresh-DB protocol tried (solo, pairs, after commerce, and both
  final full runs). Its single earlier failure came from a database
  carrying aborted-run residue — not a product or fixture defect.
  The canonical protocol stands: fresh DB → migrate → full suite.
- **pre-05 / pre-06 residuals** were the (A) rollback layers above,
  plus the documented subset fragility (same class as rc03 cases
  1/2): in shared-DB subsets, pre-05's actor-based delete met
  pre-06's previously incomplete rollback corpse; with rollback
  complete, both pass solo, in pairs, in a deliberately hostile
  12-file ordering (45/45), and in the final full run.

### Final gates (this addendum's tree)

| Gate | Result |
| --- | --- |
| `npm run format:check` | exit 0 |
| `npm run lint` (`--max-warnings=0`) | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` (unit) | 282 files, **2,083 passed / 0 failed** |
| fresh DB + `npm run db:migrate` (132 migrations), then `npm run test:integration` | **306 passed / 0 failed (306)**, exit 0 |
| `npm run build` | exit 0; `git diff -- tsconfig.json` empty |

Test database: PostgreSQL **16.15** (Ubuntu 16.15-0ubuntu0.24.04.1).
Packaged-image note (honest scope, unchanged): the Docker/Compose
production proof for this tree runs through the 17C CI workflow after
merge — one `workflow_dispatch` by Matthew, which doubles as the
packaged proof for the final tree. No local Docker claim is made.

Provenance: 18B was started Matthew-side on 2026-11-05 (see the original
`../RESULT.md`, preserved untouched). This continuation was executed by
Harbor on 2026-11-06 at Matthew's instruction ("keep working till it
done"), on branch `rc1-18b-finish`, local commits on top of the exact
base below. Nothing here is pushed; delivery is a separate step.

- **Exact base SHA:** `7e8abe4` (GitHub main at the start of this round)
- **Final tree:** the commits listed under Changed paths
- **Test database:** PostgreSQL **16.15** (Ubuntu 16.15-0ubuntu0.24.04.1),
  local disposable databases. No PostgreSQL 17 claim is made.

## First blocker (the only red gate) — RESOLVED 2026-11-07, see addendum above

`npm run test:integration` → **304 passed / 2 failed (306)**. Both
failures are the same final step:

- `tests/integration/pre-05-legacy-migration.integration.test.ts` —
  "executes end-to-end migration into isolated site, verifies database
  records, activates, and cleanly rolls back"
- `tests/integration/pre-06-presentation-pass-gate.integration.test.ts`
  case 3 — the same rollback journey

After this round's P2 fix, rollback now deletes **every entity it
created** (content, article-family rows, revision records, layouts,
redirects, media, tags, categories, authors — verified zero remaining in
both suites). The last step, deleting the migration site itself, throws
`HierarchyError` from `protectSiteHierarchyDelete`
(`src/modules/publishing/hierarchy.ts`, ~line 261): **"The site still
contains execution-events"** — 5 `discovery.indexing.changed` outbox
events (state `ready`) emitted by the content afterChange
discovery-indexing path while the migration created content.

Why this is a decision, not a fix-round repair:

- `execution-events` is deliberately append-only: its access control is
  `delete: () => false` — "remains the operator audit trail"
  (`src/collections/platform/Execution.ts`). No product code anywhere
  deletes execution events.
- The site-deletion guard already exempts one system collection
  (`member-site-roles`) with the rationale that system linkage created
  with the site should not make site deletion impossible — a precedent
  pointing one way; the audit-trail rationale points the other.
- Candidate resolutions, for the product owner to choose:
  1. Exempt system outbox collections (or specifically
     `discovery.indexing.changed` events) in
     `protectSiteHierarchyDelete`, per the `member-site-roles`
     precedent.
  2. Have legacy rollback retire its own site's pending outbox events
     as part of teardown (requires a sanctioned deletion path for
     execution events in that one context).
  3. Accept site retention after rollback (change the suites'
     expectation) — contradicts the subpasses' "rolls back cleanly"
     contract as written.

Until one is chosen, the 18B ledger row stays NOT READY.

## Gates on the final tree (2026-11-06 round — superseded by the addendum's final gates)

| Gate | Result |
| --- | --- |
| `npm run format:check` | exit 0 |
| `npm run lint` (`--max-warnings=0`) | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` (unit) | 282 files, **2,082 passed / 0 failed** |
| fresh DB + `npm run db:migrate`, then `npm run test:integration` | **304 passed / 2 failed (306)**, exit 1 — the 2 failures are the blocker above |
| `npm run build` | exit 0; tsconfig.json sha256 identical before/after the build (`251119e4…`), `git diff -- tsconfig.json` empty |

Packaged-image note (honest scope): the Docker/Compose production proof
for this tree runs through the 17C CI workflow after merge (one
`workflow_dispatch` by Matthew). Docker cannot run on Harbor's VM, so
no local packaged-image claim is made here; `npm run build` above is
the local build gate.

## Per-fix summary

### P1 — social provider truth unified (product) — FIXED

`socialProviderFor` consulted the worker's `ADAPTER_REGISTRY` first,
where `XAdapter` hardcodes `mode: 'live'`, contradicting the declared
runtime roster (`x` = manual-handoff, Bluesky the sole live network) and
failing rc03 case 4 section D. `src/modules/social/provider-runtime.ts`
now consults the declared roster (`socialProviderAdapters`) first as
the single source of truth; the registry remains as fallback only for
networks the roster does not declare (mastodon, discord, telegram,
pinterest). Delivery semantics already treated publish-less providers
as manual-handoff, so behavior now matches the declared truth end to
end. The unit contract test (`tests/unit/social-contracts.test.ts`)
had enshrined the divergent registry truth for activitypub (expected
`live` + an auth-failure publish); it now asserts the unified truth
plus a regression loop over the seven roster manual-handoff networks.
No assertion was weakened — the contradictory expectation was replaced
by the roster's own, and coverage was added.

### P2 — legacy rollback reference clearing (product) — SANCTIONED PART FIXED, remainder blocked

Root cause had two layers beneath the triage's finding:

1. Rollback deleted content rows while the article-family companion
   rows its own afterChange lifecycle hook (`ensureEditorialCompanion`)
   created still referenced them; `protectHierarchyDelete` correctly
   refused. Fixed: `rollbackLegacyMigration` now calls the new store
   method `clearContentRollbackReferences(contentIds)` before the
   delete loop (both the Payload and in-memory stores implement it;
   the hierarchy guard itself is untouched). The Payload implementation
   deletes each family's revision records first — Payload's delete
   nullifies `revision_records.article_id`, which is `NOT NULL`, so a
   family with revisions cannot be deleted at all otherwise. Revision
   records are append-only for API callers (`create/update/delete:
   () => false`); the delete uses `overrideAccess` from the product's
   own lifecycle path, the same way the product creates them
   internally. API-facing rules are unchanged.
2. With all entity deletions completing, the final site delete hits
   the execution-events blocker described above — a product decision,
   left failing per instructions.

### P3 — profiles avatar usage honored in publicMedia recheck (product) — FIXED

The live-usage recheck in `src/modules/media/workflow.ts` only honored
`usedBy.relationTo` ∈ {content, social-network-variants}, dropping the
profiles avatar usage comm-00 case 3b exercises. It now has a dedicated
profiles branch: the profile must exist, pass `canRenderPublic`
(visibility gate), and still reference the media via `avatar` or
`cover`. Profiles carry no site field and members are not site-scoped;
tenancy is enforced by the usage row's own site, already matched to
the media in the reference query. comm-00 solo: 11/11.

### F1 — shop settlement fixture (fixture) — FIXED (34/34 solo)

Three layers, all built through the product's own shapes: the payment
intent now carries a `financialEvents` succeeded event in exactly the
shape the verified webhook path appends (matching the settlement
matcher in fulfillment-mapping: kind/resultingState `succeeded`, no
refunded/disputed/cancelled events); order lines are frozen through
the product's own `freezeFulfillmentLines` with the initiate route's
shipping mapping; the sample product is created with its
`merchantConnection`, without which the freeze's
product/site/merchant/variant check can never match. The fulfillment
guard and the injected storage fault now behave exactly as the case
intends. No evidence was invented — every record is one the product's
own code paths produce.

### F2 — rc03 case 3 fixture (fixture) — FIXED (cases 3+4 pass; cases 1/2 pass in full-suite context)

Three layers: the product is created as `state: 'draft'` and approved
via `payload.update` with the catalog-workflow context the admin
catalog route uses (direct creation in `approved` correctly trips the
Commerce beforeValidate hook); the article pin now targets the
editorial article-family record (`articleBundle.article.id`), the
record production artifact-scope resolves; the media/distribution/
newsletter pins now create real site-owned records that are
deliberately not release-ready (media still processing/private/rights
pending; draft social draft; unreviewed newsletter), so execution
produces the expected 1 succeeded / 4 failed steps from real product
rejections instead of invented pin targets.

### F3 — comm-00 comment target selection (fixture) — FIXED

beforeAll now selects a published, publicly renderable content target
deterministically (`status` in [published, updated], `publishedAt`
absent-or-past, `sort: 'createdAt'`), mirroring the community
service's own `discussionTarget`/`canRenderPublic` semantics, instead
of an unordered `limit: 1` that landed on archived content. Cases 4
and 10 pass.

### F4 — flow-06 saga fixture (fixture) — FIXED

The mock fixture now models production shapes: pinned targets are an
`article-family-content` document (whose content carries the site), a
`page-layouts` document, and a `media-assets` document, all owned by
the release's site, per `artifact-scope`'s resolution rules. The file
passes end to end.

### T1 — tsconfig build stability (tree) — FIXED AND PROVEN

`tsconfig.json` include again lists `.next/types/**/*.ts` and
`.next/dev/types/**/*.ts` alongside the existing `.next-typecheck`
entries. Proof: `npm run build` exit 0 with tsconfig.json sha256
identical before/after and `git diff -- tsconfig.json` empty — the
build no longer rewrites the file in the builder stage (the root cause
of the 17C CI byte-identity failure, run 42121759686). The build did
rewrite `next-env.d.ts` import paths (outside the compared set); a
subsequent `npm run typecheck` exits 0 and regenerates it back, tree
clean.

### Additional finding — disc-00 order sensitivity (fixture, F3 class)

The first full run on this tree failed disc-00's four crawler outputs.
Bisected and root-caused: disc-00 picked its publication with the same
unordered first-active-public `limit: 1` pattern as F3; when
commerce-runtime's demo seed runs earlier in the suite order, its
`renegadeparty` publication predates the seeded `main` one, so the
article landed on a site the feed/sitemap routes do not serve. Not a
product regression and not one of the original 10 failures — the
verify round's suite order masked it. Fixed the same way as F3:
select the seeded `main` publication by slug. The triggering pair
(commerce-runtime → disc-00) passes 12/12, and disc-00 passes in the
final full run. No assertion changed.

## Changed paths (11 files, 6 commits on `rc1-18b-finish`; plus the 2026-11-07 close-out commits below)

Close-out commits (2026-11-07, on top of `d85062e`):

- `4594cc8` fix(editorial): `src/modules/editorial/hierarchy.ts`,
  `tests/unit/content-hierarchy.test.tsx` — execution-events guard
  exemption per Matthew's decision
- `00d1d6e` fix(portability):
  `src/modules/portability/legacy-migration/store.ts`,
  `src/modules/portability/legacy-migration/pipeline.ts` —
  publications + media-blobs teardown; rollback teardown authority
- `eddf001` fix(db):
  `src/migrations/20261107_120000_rc1_execution_events_site_detach.ts`,
  `src/migrations/index.ts` — execution-events site detach
- `5f24c0f` test(disc):
  `tests/integration/disc-00-crawler-smoke.integration.test.ts` —
  deterministic scope pin + scope publication + afterAll restore

- `27db3e9` fix(social): `src/modules/social/provider-runtime.ts`,
  `tests/unit/social-contracts.test.ts`
- `471327e` fix(media): `src/modules/media/workflow.ts`
- `9023373` fix(portability):
  `src/modules/portability/legacy-migration/pipeline.ts`,
  `src/modules/portability/legacy-migration/store.ts`
- `f848b74` test(rc1) fixtures F1–F4:
  `tests/integration/shared-contract-commerce-shop.integration.test.ts`,
  `tests/integration/rc03-core-orchestration.integration.test.ts`,
  `tests/integration/comm-00-community-pass.integration.test.ts`,
  `tests/integration/flow-06-workflow-pass-gate.integration.test.ts`
- `607f4cf` fix(build): `tsconfig.json`
- `7cc11bf` test(disc):
  `tests/integration/disc-00-crawler-smoke.integration.test.ts`

Baseline for comparison (verified on `7e8abe4` before this round):
typecheck exit 0; unit 2,082/0; integration 296 passed / 10 failed.
This round fixed 8 of the 10 baseline failures outright; the remaining
2 (pre-05, pre-06 case 3) are reduced to the single execution-events
site-delete blocker above.

## Known subset-run caveat

rc03 cases 1/2 fail when rc03 runs alone or in small subsets: the
suite picks its author/editor as the first two `users` rows and falls
back to the same user twice on a sparsely seeded database, tripping a
self-approval permission error. They pass in the full-suite context
(the baseline full run and this round's final full run). This is a
pre-existing subset fragility, recorded here so nobody chases it in
solo runs.
