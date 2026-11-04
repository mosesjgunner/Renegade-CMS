# R-03D — Supported WordPress import/export and an ordinary finished site

## STATUS

**R-03D PASS** (2026-11-03, local production processes on this
Docker-less host; the frozen 2026-10-20 record is preserved in
`docs/rc/evidence/rc1/18-pass/03D/`).

The frozen run never got past the installer (1 check, then a disabled
Continue button), so 03D had no completion evidence and — uniquely —
no row in the ledger at all. Re-executed on this tree, the installer
completes, the authored site-build journey passes, and the supported
WXR import **did** reproduce genuine product defects against the real
Payload store (the in-memory store used by the unit suite cannot see
them): the import failed with three errors and its own verification
then failed on a fourth. All four are repaired in product code (see
CHANGES); the definitive run is fully green.

## TESTED SOURCE

- Branch `rc1-repair-03d`, created from `rc1-repair-05c` @ `3b103fd`.
- Base parity: the `src/` diff between the corrected union
  `rc1-union` @ `604e940` and this branch's base is exactly the six
  accepted files (R-03A: `Sites.ts`, `editorial/hierarchy.ts`; 17E:
  `commerce/tasks.ts`; R-05C: `portability/site-export.ts`,
  `portability/workflow.ts`, `scripts/portability.ts`). The
  legacy-migration scoped diff was empty before this repair began.
- Tested tree: production build of `04ce281` — `npm run build`
  exit 0, `build-provenance.json` sourceSha
  `04ce2813d7ad9f91025706090e64e5362526728c`, `clean: true`, version
  `0.1.0`, lockfileSha256
  `db6f9bbcca7ec4232a72af85e9e13762429bb3f1dbce09fd20f120ce1e3ccc33`
  (same lockfile hash as the R-03B/R-03C/R-05C builds). The two
  product-fix commits under test are `a5e74ae` and `8fc9184`.
- Runtime: production standalone server (`.next/standalone/server.js`)
  + `npm run jobs:worker` as local processes behind a local HTTPS
  proxy (`https://rc1-03d.test:38782`), disposable PostgreSQL database
  `rc1r03d_main`, PostgreSQL **16.15**, **131 migrations** via
  `npm run db:migrate`. Profile Standard, `RENEGADE_MODULES=all`,
  local only. Test authentication DISABLED
  (`ENABLE_TEST_ROUTES=false`, `LOCAL_E2E_TEST_MODE=false`).
- Harness: `node tests/rc1-r03d/run-local.mjs` — local-process variant
  of the frozen `tests/rc1-03d/` verifiers (same assertion sets):
  journey -> negatives -> web+worker process restart AND PostgreSQL
  cluster restart -> restart re-verification. The WXR fixture is the
  repo's own locally generated
  `tests/fixtures/legacy-migration/wordpress-fixture.xml` (3 posts,
  3 pages, 2 authors, 3 categories, 3 tags, 1 menu, 1 media item);
  nothing was fetched from a real site. The journey performs the real
  installer WebAuthn ceremony (CDP virtual authenticator), as the
  frozen run intended — no test login API or forged session.

## FIRST FAILURE

In reproduction order:

1. **The frozen installer blocker does not reproduce on the
   production build.** The frozen run stalled on a disabled Continue
   button after 1 check. Locally, following the R-01B local-spec
   sequence, setup completes with a real passkey ceremony (journey
   PASS 2). Two harness-era alignments were needed, neither a product
   change: (a) API calls fetch through the local HTTPS proxy by
   loopback IP with the context's session cookie (the R-03C precedent —
   Playwright's request context resolves `.test` hosts through real
   DNS and died with EPROTO); (b) the installer starter step selects
   the frozen run's intended `blank-minimal` + starter content off —
   with the R-01B defaults (publication-community + starter content)
   the installer provisions its own home page at `/` and the authored
   home creation correctly fails with "The path / is already used by
   a page layout" (reproduced, run 2).
2. **The supported import failed against the real store — three
   errors, stage `failed`, HTTP 422** (run 4, all other journey
   checks green to that point):
   - `MEDIA_STORE_FAILED` — "Failed to persist media asset
     tribune-hero.png: Site scope access denied."
     `PayloadLegacyMigrationStore.createSite` created the new
     isolated site with `overrideAccess: true` and **no request
     user**, so the canonical Sites afterChange creator grant never
     fired; the media permission layer (which resolves the actor's
     scope through `member-site-roles`) then denied the owner-actor's
     media upload into the site the migration itself had just
     created. Every other store method uses `overrideAccess`, which
     is why only media failed.
   - `HEADER_GLOBAL_FAILED` — "publisher.hero is not allowed in
     header." `reconstructPresentation` built the header global from
     a `publisher.hero` block; the canonical presentation registry
     allows only `publisher.cta`, `publisher.rich-content` and
     `publisher.pattern` in the header slot.
   - `PATTERN_CREATION_FAILED` — "link must be selected from this
     site's link chooser." The CTA pattern carried a plain
     `{label, href}` link; layout validation requires link props to
     be chooser references (`{siteId, id, label}`), which cannot
     exist at reconstruction time (the target site does not exist
     yet, including in dry-run).
3. **The migration's own verification then failed** (run 6, after the
   three fixes above): verify recomputed `contentCountsMatch: false`
   and flipped the run back to `failed`. Root cause, isolated with a
   direct Payload probe: imported content is created with the legacy
   URL plan's canonical path (the legacy home page maps to `/`), but
   `PayloadLegacyMigrationStore.createContent` did not set
   `pathOverride`, and on create the editorial path derivation
   receives an empty-object `originalDoc`, so its deliberate-path
   preservation (`data.canonicalPath && !original`) never fires and
   the path is recomputed from the slug (`/home`). Verification
   looks the record up at the planned path `/`, finds nothing, and
   fails. (The operator journey avoids this by passing
   `pathOverride: true` explicitly, as the frozen script does for
   its authored home page.)

## CHANGES

Product (commits `a5e74ae`, `8fc9184`), all inside the legacy
migration boundary; no schema changes, no migration delta:

- `src/modules/portability/legacy-migration/store.ts`:
  (a) `createSite` passes the actor as the Payload `user`, so the
  canonical creator grant fires for migration-created sites exactly
  as for UI/API site creation; (b) `createContent` sets
  `pathOverride: true`, since the migration's canonical path is
  deliberate (derived from the legacy URL plan).
- `src/modules/portability/legacy-migration/presentation.ts`:
  the header global is built with `publisher.rich-content` (an
  allowed header component, as the footer global already used)
  carrying the site title/description, and the CTA pattern no longer
  carries an unrepresentable plain link prop.

Tests (in `a5e74ae`): one assertion in
`tests/unit/pre-05-legacy-migration.test.ts` updated — it asserted
the header block component is `publisher.hero`, i.e. it encoded the
defective behavior; it now expects `publisher.rich-content`. No
other assertion changed.

Harness only (`tests/rc1-r03d/`, commits `59963ed`, `9ef2d2d`,
`7dbe278`, `5770181`, `04ce281`): `run-local.mjs` supervisor,
`verify-local.ts` (frozen journey, retargeted; ONE check added — an
operator-side category hierarchy pair on the authored site, matching
the prompt's "create hierarchy" element, which the frozen journey
only exercised through the imported taxonomy),
`verify-negatives-local.ts` (frozen negatives, retargeted),
`verify-restart-local.ts`. Harness-era fixes: loopback-proxy API
transport, the blank-starter installer selection, and a tsx `__name`
shim for the staff WebAuthn `page.evaluate`.

Reconciliation with R-05C: the portable-archive restore boundary
repaired in R-05C (`src/modules/portability/*`,
`src/scripts/portability.ts`) is untouched by this repair and not
re-litigated; the export exercised here is the migration export
endpoint (`/api/migration/export`), a different surface.

## REAL WORKFLOW

Definitive supervisor run exit **0** — all three phases green:
**journey 20/20**, **negatives 15/15**, **restart 5/5** (40 checks).

- **Site-build journey** — fresh DB -> real installer (virtual
  WebAuthn) creates the owner + `03D Operator Dispatch` site ->
  authored home page (canonical `/`), About page and article created
  through the native API, article published by PATCH, publication
  navigation set -> operator category hierarchy pair persisted with
  stable parent reference -> anonymous HTTP shows the authored page
  and navigation, and anonymous Chromium renders the navigation
  target (`public-site.png`).
- **Import** — malformed WXR rejected 422 through the supported
  inspect endpoint -> preflight dry-run plans without creating a
  site -> execute into a new isolated site (`03D Imported Tribune`):
  stage `imported`, errors [], exact imported content count (6 =
  3 posts + 3 pages per `parseWxr`), author relationships persisted,
  taxonomy hierarchy persisted (investigative -> news parent),
  exactly 1 media asset with a real persisted blob -> supported
  export contains the original media bytes (base64-equal to the
  fixture PNG), mapped authors and revision history, and excludes
  operator-site content -> rerun skips duplicates (content and media
  counts unchanged) -> explicit `rejectDuplicates` rerun returns 422
  with `DUPLICATE_ITEM_REJECTED` -> server verification passes every
  acceptance check -> activation persists (report stage
  `activated`).
- **Restart** — after a web+worker process restart AND a PostgreSQL
  cluster restart (`pg_ctlcluster 16 main restart`): exact canonical
  content IDs retained, imported count retained, migration report
  retained at `activated`, exported media bytes unchanged, public
  output retains the authored page and navigation.

## TESTS

- Supervisor acceptance: **20 journey + 15 negatives + 5 restart
  checks, 0 failed**, three phases exit 0.
- Focused unit files (the frozen 03D set): `portability-contracts`
  (4), `portability-workflow` (5), `rc1-03d-portability` (10),
  `pre-05-legacy-migration` (14) — **33 passed / 0 failed**, exit 0
  (the frozen run recorded 30; the delta is tests added since, in
  the R-05C repair line).
- Full unit suite (`npm test`, final tree): **2059 passed / 5 failed
  (2064)** — identical to the standing R-05C baseline; the 5 are the
  named pre-existing set (flow-04-acceptance x1, payload-domains x1,
  rc1-04d-campaign-commerce x1, shop-08-command-center-boundaries
  x2). No media test regressed.
- Production build: `npm run build` exit **0** (provenance above).
- Final-tree typecheck: `npx tsc --noEmit` exit **0**.
- Scoped ESLint on the two product files, the harness verifiers and
  the updated unit file: exit **0**.

## NEGATIVES + RESTART

- Anonymous denied (403) migration export, migration report and
  migration execute; denied state unchanged.
- Invited staff for the operator site (real virtual-WebAuthn
  enrollment + passkey login) denied (403) on the imported site's
  export, report, verify, activate, rollback and execute, and on
  new-site creation; the same staff **can** export their authorized
  site, and that export contains no foreign content.
- Cross-origin execute denied (403) for the authenticated owner.
- After all denials, the persisted migration report is byte-identical
  and the imported content count is unchanged (15/15, see above).
- Malformed WXR and unsafe inputs: malformed XML rejected 422 at
  inspect with no half-created records (dry-run check confirms the
  site count is unchanged); duplicate handling proven both ways
  (skip and explicit reject).
- Restart: web + worker **process** restart **and PostgreSQL
  cluster** restart executed between phases; all 5 restart checks
  green.

## REMAINING BLOCKERS

None for R-03D. Bounded / unexecuted items, named honestly — none is
relabeled as passed:

- The authored-site half of the journey uses the installer's real
  session over the supported HTTP/native API (the frozen run's own
  pattern); no separate admin-UI click-through of the content editor
  is claimed — R-03B proves the editor on this tree line.
- Production image / Compose proof is unexecuted — Docker cannot run
  on this host (established in 17C). The local-process production
  build is the strongest proof available here.
- Unsupported WordPress content is quarantined, not imported
  (Contact Form 7 shortcode, comments, the portfolio post type) —
  that is the importer's documented boundary, exercised by the
  fixture and recorded in the import report's quarantine; no
  plugin/theme compatibility beyond the supported WXR mapping is
  claimed.
- The CTA pattern and header global no longer carry a first
  navigation link (see CHANGES): a valid chooser reference cannot be
  minted at reconstruction time. An operator can add one through the
  builder's link chooser after import.
- Run history: run 1 stopped on the proxy transport (EPROTO, 2
  checks green); run 2 on the starter home-path collision (2
  checks); run 3 on a harness checkbox strict-mode error (1 check);
  run 4 reproduced the import failure (8 checks, 422 with the three
  errors); run 5 (post presentation/media fix) reached 18 checks and
  reproduced the verification failure; run 6 (post pathOverride fix)
  was journey-green but stopped in negatives on the tsx `__name`
  harness artifact (3 negative checks); run 7 is the definitive run
  reported here. Intermediate artifacts are retained under
  `scratch/rc1r03d/`.

## NEXT

R-03D is complete. Do not start another repair automatically;
R-08-SOCIAL is next only on the parent's instruction (see NEXT.md).
