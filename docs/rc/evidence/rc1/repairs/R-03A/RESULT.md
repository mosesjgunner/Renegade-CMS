# R-03A — Content hierarchy and CRUD reconciliation

## STATUS

**R-03A PASS** (2026-11-03, local production processes on this Docker-less host;
the original 2026-10-18 current-checkout record is preserved in
`docs/rc/evidence/rc1/18-pass/03A/` and its NOT READY row history is preserved
in the ledger).

One genuine product defect was reproduced and repaired (site deletion was
impossible for a member-linked owner — see First failure #2). Everything else
in the 03A contract already worked on the union tree and is proven below; the
remaining gaps are harness-era assumptions, documented as such, not product
defects.

## TESTED SOURCE

- Branch `rc1-repair-03a`, created from `rc1-repair-01b` @ `59fdc3e`.
- Base parity: the complete `src/` diff between that base and the corrected
  union `rc1-union` @ `604e940` is exactly one file,
  `src/modules/commerce/tasks.ts` (+14/−1, the 17E stale-lease fix), which is
  outside R-03A scope. All hierarchy/CRUD-scoped source is byte-identical
  between the repair base and the corrected union, so this verification
  carries over to the union unchanged.
- Final code HEAD `eda6881`. Production build `npm run build` exit 0;
  `build-provenance.json` sourceSha `eda6881e34b0b9556e8adacde2f63f47b81bf874`,
  `clean: true`, version `0.1.0`. (An earlier build of the same source
  recorded `clean: false` solely because the previous run's untracked
  evidence outputs were still in this folder; the definitive run below used
  the clean-provenance build.)
- Runtime: production standalone server (`.next/standalone/server.js`) +
  `npm run jobs:worker` as local processes behind a local HTTPS reverse proxy
  (self-signed TLS, trusted-proxy hop), mirroring the R-01B local precedent.
  PostgreSQL **16.15**, disposable database `rc1r03a_main`, **131 migrations**
  via the supported `npm run db:migrate`. Profile Standard,
  `RENEGADE_MODULES=all`, local only (`EMAIL_MODE=disabled`,
  `STORAGE_DRIVER=local`). Test authentication DISABLED
  (`ENABLE_TEST_ROUTES=false`, `LOCAL_E2E_TEST_MODE=false`).
- Harness: `node tests/rc1-r03a/run-local.mjs` — local-process variants of the
  original `tests/rc1-03a/` acceptance (fresh → browser → controls →
  web+worker process restart → re-verify), phases async so the supervisor
  never starves its own proxy (R-01B lesson). The verifier uses the original
  run's operator fixture-session pattern (persisted `admin_sessions` rows via
  the product's own `createPasskeySession`); **no passkey ceremony is claimed
  here** — that is R-01B's proof on this same tree.

## FIRST FAILURE

Two failures were reproduced, in order. Only the second is a product defect.

1. **Fixture bootstrap denied (harness-era assumption, NOT a product
   defect).** First supervisor run: the fresh phase died at its first
   mutation — `POST /api/sites` → 403 "You are not allowed to perform this
   action." The original 03A fixture creates a member-linked `owner` user
   with no grants and REST-creates both sites. Under the operator-grant model
   now on the tree (17A), a member-linked owner is scoped strictly by
   `member-site-roles` grants (`Sites.create` requires
   `resolveOperatorGrantContext(...).isGlobalOwner`); a grant-less linked
   owner is deliberately unauthorized ("Revoking their final grant must not
   turn an empty scope into platform authority"). The product's own setup
   flow never produces that state: installation creates the first site and
   the owner's canonical grant through the local API
   (`src/modules/operations/installation.ts`), and the `Sites` afterChange
   hook grants the creator a role on every site they create, keeping a real
   owner global. The harness was aligned to the product's supported path —
   first site bootstrapped via local API + canonical grant exactly as
   installation does; the second site is still created through the ordinary
   REST path. No product change was made for this failure.

2. **Site deletion deadlock (GENUINE product defect, repaired).** Controls
   phase: after creating a disposable site through ordinary REST, renaming
   it, and removing its bootstrapped publication and operator grants, the
   ordinary `DELETE /api/sites/<id>` returned **403**. Root cause — no valid
   sequence existed for a member-linked owner to delete a site:
   `protectSiteHierarchyDelete` counted **every** collection with a `site`
   relationship as a protected reference, including `member-site-roles`
   (operator grants) and the bootstrap publication; the publication can be
   removed first, but removing the owner's grant on the target site also
   removed the last piece of the grant scope that made the owner global
   (`isAllSites` recomputes over the remaining sites), so the grant-scoped
   delete access then excluded the site — and deleting the site first was
   blocked by the hook naming the grants. Both orders failed; a site created
   through ordinary controls could never be deleted through ordinary
   controls. This broke the accepted 03A contract ("native Site
   create/edit/delete succeeds after explicitly removing bootstrap
   publication and grants").

## CHANGES

Product (minimal, in scope):

- `src/modules/editorial/hierarchy.ts` — `protectSiteHierarchyDelete` no
  longer counts `member-site-roles` as a protected content reference.
  Operator grants are authorization linkage created with the site, not site
  content. All genuine references (publications, sections, categories,
  albums, content, …) still block deletion with the dependent collection
  named.
- `src/collections/Sites.ts` — a second `beforeDelete` hook (after the
  protection hook, inside the same delete transaction) revokes the site's
  operator grants through the Payload API, so each grant's own afterDelete
  hook records its `site-role.revoked` identity audit event. Placement is
  load-bearing: `member_site_roles.site_id` is `ON DELETE CASCADE`, so a
  post-delete cleanup finds no rows and records no audit (the first repair
  attempt, in `afterDelete`, proved exactly that and was replaced).
- `tests/unit/content-hierarchy.test.tsx` — one regression test added:
  operator-grant linkage alone does not block site deletion; a real content
  reference still does.

Harness only (`tests/rc1-r03a/`):

- Local-process variants of the original acceptance (supervisor, verifier,
  public browser journey) for this Docker-less host, including the HTTPS
  proxy topology the union tree's production `APP_URL` validation requires.
- Verifier fixture bootstrap aligned to the supported installation path
  (First failure #1); creation of the second site and all hierarchy levels
  still goes through ordinary REST.
- Controls phase reordered to the supported deletion sequence and extended:
  site delete is first **denied** while the bootstrapped publication remains
  (record verified unchanged), then succeeds after the publication's
  explicit removal; the site's operator grants are asserted gone afterwards
  and at least one `site-role.revoked` audit event is asserted present.
- Browser journey: `--ignore-certificate-errors` added at launch. The
  context's `ignoreHTTPSErrors` alone proved insufficient for the cross-host
  (beta) navigation in this sandbox (`ERR_CERT_AUTHORITY_INVALID` after all
  alpha navigations succeeded against the same self-signed cert); every
  assertion (headings, breadcrumb, body text, 404 status) is unchanged.

No schema changes were made, so no fresh/upgrade migration delta arises from
this repair; the fresh database applied the full 131 migrations cleanly.

## REAL WORKFLOW

All four supervisor phases green on the definitive run (58 checks, 0 failed;
the identical result was also obtained on the immediately preceding build of
the same source):

- **Fresh (38/38)** — installation bootstrap → ordinary REST creates
  Site → Section → Category → Subcategory → Collection → Content across two
  sites; publish via normal PATCH; all six levels refetched after commit;
  rename / category reparent / collection move / title+order edits persist
  after reload and the canonical category URL survives rename and move;
  detach/move/remove succeeds in dependency order without orphans; SQL
  assertion: PostgreSQL retains exact hierarchy foreign keys, published
  content, sort order and title; public HTTP 200 at all six levels with
  scoped labels and no draft/private/foreign names; the same content URL on
  the other site's host returns 404. (`persistence.json`,
  `public-content.html`)
- **Browser (6/6)** — fresh unauthenticated Chromium: Browse → Knowledge →
  Engineering → Database Practice → Field Guides → PostgreSQL Field Guide
  Revised clicks, full breadcrumb text asserted, persisted article body
  visible, breadcrumb backtracking, direct-category listing, private
  collection excluded, empty branch explains its state, foreign-site article
  URL returns 404. (`hierarchy-browser.png`)
- **Controls (6/6)** — supported archive removes revision-backed content
  from its public URL without deleting history; native Site create/edit/
  rename; delete **denied** while the bootstrapped publication remains;
  after the publication's explicit removal the delete succeeds, the site is
  gone (404), its operator grants are revoked and the revocation audit
  events are retained; empty Section edit + cross-site move by the global
  owner + removal persist; foreign-album content patch denied unchanged;
  concurrent category create vs parent Section delete resolves 404/200 —
  never two successes — with a SQL proof of zero orphaned categories and
  supported cleanup/retry.
- **Restart (8/8)** — web and worker processes restarted; a new verifier
  refetched the persisted IDs/relationships/title/order/status and re-ran
  all six public HTTP levels plus the cross-host 404. (`restart-persistence.json`)

## TESTS

- Supervisor acceptance: **58 passed / 0 failed** (38 fresh + 6 browser +
  6 controls + 8 restart), exit 0.
- Focused unit files (the original 03A set of 12): **82 passed / 0 failed**
  — the original 81 plus the 1 new regression test.
- Full unit suite (`npm test`, final tree): **2053 passed / 11 failed
  (2064)**. The R-01B union baseline was 2052/11; the delta is exactly the
  one new regression test. The 11 failures are the identical pre-existing
  set: flow-04-acceptance ×1, payload-domains ×1, rc1-04d-campaign-commerce
  ×1, shop-08-command-center-boundaries ×2 (the 5 named pre-existing), plus
  rc1-05a-media-lifecycle ×3 and med-01-upload-sessions ×3 ("Site scope
  access denied", flagged for R-05C / Pass 18; R-03A evidence does not
  implicate them and they were not touched).
- Production build: `npm run build` exit 0 (provenance above).
- Final-tree typecheck: `npx tsc --noEmit` exit **0** at `eda6881`. This
  also closes the original 03A record's open item — the three rich-editor
  test diagnostics that left the 2026-10-18 typecheck at exit 2 are gone on
  this tree; the full original assertions were re-run here rather than only
  the post-drift subset.

## NEGATIVES + RESTART

- Two-site negative matrix executed in the fresh phase, every denied
  mutation deep-compared against its pre-attempt record (24 denial checks):
  wrong-site parents for category/section/collection, object-ID
  substitution, self/descendant category cycle, publish of an empty-editor
  article, referenced site/section/category/collection and
  revision-backed-content deletions, foreign staff and anonymous mutations —
  all denied with persisted data unchanged.
- Referenced-site deletion denial is additionally proven in the controls
  phase against the site's own bootstrapped publication.
- Restart: web + worker **process** restart executed (8/8 above). Bounded:
  the local variant does not restart the PostgreSQL process itself; the
  2026-10-18 run's PostgreSQL-restart proof stands for the same code path.

## EVIDENCE (this folder)

- `RESULT.md` (this file), `NEXT.md`
- `persistence.json`, `restart-persistence.json` — persisted hierarchy
  snapshots asserted by the fresh and restart phases
- `public-content.html` — rendered public article page from the fresh phase
- `hierarchy-browser.png` — browser journey screenshot (article with full
  hierarchy breadcrumb)

## REMAINING BLOCKERS

None for R-03A. Bounded / unexecuted items, named honestly:

- Ordinary authenticated **admin-form** CRUD and a passkey ceremony are not
  claimed (operator fixture sessions, as in the original 03A run). R-01B
  proves the genuine passkey ceremony on this same tree.
- Production image / Compose proof is unexecuted — Docker cannot run on
  this host (established in 17C). The local-process production build is the
  strongest proof available here.
- Populated upgrade / migration-down rehearsal is unexecuted: this repair
  made no schema change, and the hierarchy migration's `down` still refuses
  to discard populated hierarchy relationships by design.
- Carried, out of scope: the 6 media site-scope unit failures remain for
  R-05C / Pass 18 reconciliation.

## NEXT

R-03A is complete. Do not start another repair automatically; R-03B is next
only on the parent's instruction (see NEXT.md).
