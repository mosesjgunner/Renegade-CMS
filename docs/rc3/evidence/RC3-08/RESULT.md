# RC3-08 — WordPress Move, Design and First Publish: Result

**Branch:** `rc3-08` (local only; delivery is a separate step)
**Base:** `577fa38` (GitHub main, RC2.1 head)
**Area ledger rows:** #81 Import & migration (owning pass 08), #8 Theme engine (owning pass 08)

## Scope

Walk the full WordPress-move journey on a representative WordPress
export — posts, pages, common blocks, media, authors, redirects, and
one unsupported plugin block — through dry-run → review → apply →
preview/publish, using the WXR importer, conversion-apply, layout
snapshots and theme compatibility; then a fresh starter site with a
newly published page. The fixture is
`tests/fixtures/legacy-migration/wordpress-rc308.xml` ("Harbor Light
Studio"): 2 authors, hierarchical categories, 2 tags, 2 posts (one
published with a dated permalink, featured image and Yoast meta; one
draft with a `[gallery]` shortcode), 2 Gutenberg pages (heading,
paragraph, image, list, columns, quote, separator, and one
`acme/event-calendar` plugin block), 2 attachments (one bundled, one
remote-only), a 3-item nav menu, and 1 comment.

Most of the machinery already existed (PRE-05 pipeline, S2-12 block
conversion, S2-13 conversion-apply, S2-09 theme compatibility). This
pass audited it against the journey, fixed the four defects below,
and proved the whole journey end to end on real Postgres
(`tests/integration/rc3-08-wordpress-move.integration.test.ts`,
8 legs) plus pipeline-level tests
(`tests/unit/rc3-08-wordpress-move.test.ts`, 5 tests).

## Defects found and fixed (all journey-blocking)

1. **Page images quarantined despite being acquired in the same run.**
   `executeLegacyMigration` planned the presentation (page block
   conversion) before acquiring media, so every `core/image` region
   on a migrated page landed in quarantine as "not acquired at
   conversion time" even when the file was bundled and acquired
   moments later. Acquisition now settles first and the presentation
   is rebuilt with the acquired-media map for the target site — the
   same order the conversion-apply path already used. Regions whose
   media was not acquired stay quarantined with their reason.
   (`pipeline.ts`, `presentation.ts`)
2. **One unbundled remote attachment made verification fail and
   blocked activation.** `verifyLegacyMigration` compared the
   recorded media checksums against the total source attachment
   count. An export referencing a remote file the operator did not
   bundle — with downloads explicitly disallowed and the skip warned
   and accounted — could never verify. Checksums now verify the
   acquired set (every recorded checksum must resolve to a stored
   asset); unacquired media is accounted by the acquisition warnings
   in the same report. (`pipeline.ts`)
3. **Re-import duplicated every template and pattern.** Template and
   pattern plan ids carried a random suffix and double as the layout
   path identities the pipeline uses for find-existing, so a second
   import of the same export minted fresh identities and duplicated
   them (a duplicate-rejected run duplicated them too, before
   failing). The structural ids are now stable roles (`tpl-post`,
   `tpl-page`, `tpl-archive`, `pat-cta`). (`presentation.ts`)
4. **Any imported page/post with an in-body image failed creation.**
   `legacyBodyToLexical` emitted Lexical `upload` nodes for acquired
   images, but `media-assets` is not a Payload upload collection
   (the media workflow owns its files), so upload nodes to it can
   never pass body validation ("upload node failed to validate") and
   the content create was rejected outright. Bodies now carry
   acquired images as `relationship` nodes — the body editor's
   enabled inline-reference type for media-assets.
   (`body.ts`; the rc1-03d expectation that pinned the upload node
   was updated to the corrected contract.)

No security/privacy/tenant defect was found in this pass.

## Per-leg verdicts

Evidence levels use the release-plan ladder. All legs were proven
against real PostgreSQL via the Payload store unless noted.

| Leg                                    | Verdict                     | Proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inspect + plan accounting              | **E2**                      | Inspect summary exact (2 posts, 2 pages, 2 authors, 2 categories, 2 tags, 1 menu, 2 media, 3 unsupported). Every page region carries exactly one outcome (converted / approximated / omitted / quarantined / dropped-empty; `unaccounted` = 0 on both pages). URL plan: `/` and `/about` compatible-direct; both dated post URLs needs-redirect (308) to `/articles/<slug>`; no loops or collisions.                                                                                                                                                             |
| Dry-run / review                       | **E2**                      | Stage `dry-run`; reconciliation plans 4 content, 2 authors, 2 categories, 2 tags, 2 redirects, 2 page layouts; acceptance checklist all true. Plan-stage conversion honestly reports the page image as quarantined-pending-acquisition; the settled outcome is what execute records.                                                                                                                                                                                                                                                                             |
| Execute / apply                        | **E2**                      | Stage `imported`; created 4 content, 2 authors, 2 categories, 2 tags, 1 media, 2 redirects. The unbundled remote file is skipped with a `REMOTE_MEDIA_DOWNLOAD_DISALLOWED` warning, not dropped. Quarantine persisted with exactly the plugin block (`acme/event-calendar`), the comment, and the `[gallery]` shortcode — and, after fix 1, no `core/image` record. The Home layout's image block references the acquired media id. Redirect records exist with the planned targets and 308 codes.                                                               |
| Verify + activate (publish)            | **E2**                      | Verify stage `verified` with all acceptance checks true (after fix 2). Activate publishes every layout; the Home layout's published presentation snapshot is readable via `readPublishedPresentation`. Public rendering of the published site in a real browser was not exercised — see open items.                                                                                                                                                                                                                                                              |
| Restart persistence                    | **E2**                      | A fresh process (`tests/helpers/rc3-08-restart-probe.ts`) reads the committed rows directly: post published with Yoast SEO title, featured-media reference = acquired asset id, author relation = Ana Harbor's record, media checksum = the bundled PNG's sha256, Home body carries the hero as a media relationship node, draft post still draft. The probe reads storage directly rather than booting a second Payload instance (a parallel boot can block on the jobs concurrency lock); the app's own read paths are exercised in-process by the other legs. |
| Editor edit + re-import                | **E2**                      | After a title/body edit, re-import into the same site creates 0 content, 0 media and 0 layouts (after fix 3) and the edit is byte-intact. With `rejectDuplicates`, the run fails with `DUPLICATE_ITEM_REJECTED` and the edit still stands.                                                                                                                                                                                                                                                                                                                       |
| Conversion re-apply (review path)      | **E2**                      | `applyWordpressConversion` on the About source: plugin block quarantined in the region report, coverage `unaccounted` = 0, exactly the bundled media created. After an operator edit + a source edit to the same region, re-apply surfaces a `local-edit-source-changed` conflict and does not overwrite; a `keep-local` resolution clears the conflict and the operator text survives.                                                                                                                                                                          |
| Theme switch / incompatible / rollback | **E2 at the service layer** | On the migrated site: compatibility preflight for `renegade-party` reports 0 blockers; draft → activate → rollback through `changeTheme` lands active back on the previous theme. A published layout using the canonical `publisher.editorial` component at an unrenderable version makes the preflight report a blocker naming that component. Proven through the same service functions the admin themes route calls; the route/UI itself was not driven in a browser — see open items.                                                                        |
| Fresh starter site + publish a page    | **E2**                      | New site → starter plan reports empty with additions → `publication-community` installs successfully → a new page created as draft and published through the normal content write path reads back `published` at `/visit`.                                                                                                                                                                                                                                                                                                                                       |
| Migration rollback                     | **E2**                      | After the journey, `rollbackLegacyMigration` returns `rolled-back`; the site is gone and no content remains for it.                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## Gauntlet (CI order, final tree, database `rc308_release_acceptance`)

- Migrations fresh: PASS
- Seed: PASS
- format:check (repo-wide): PASS
- lint: PASS
- typecheck: PASS
- Unit: PASS — 347 files / 2,818 tests
- Integration: PASS — 568 passed / 6 skipped / 0 failed (574 tests,
  98 files). One in-suite failure was an artifact of this pass's own
  env file (the upgrade-acceptance test requires a database named
  `*_upgrade_acceptance`; re-run against a correctly named database
  passed).
- Production build: PASS. Three attempts at the standing recipe
  (RAYON 4, 4 GB heap) were OOM-killed at the Turbopack compile peak
  on this 6.1 GB-capped VM (one attempt also crossed a VM
  replacement); the same source built clean with RAYON 2 and a 3 GB
  heap. A rig memory constraint, not a code failure — the log
  signature (silent death at "Creating an optimized production
  build…") matched the known pattern each time.
- Smoke: PASS — "Next.js public/admin routes and Payload PostgreSQL
  persistence are operational."

Code + tests: commit `045315c` on `rc3-08`. This evidence file is
committed on top.

## Open items / honest gaps

- **No real-browser leg.** The Puck editor surface, the admin themes
  UI, and public rendering of the migrated site were not driven in a
  browser in this environment. Theme changes are proven through the
  exact service layer the admin route calls (draft/activate/rollback
  - compatibility preflight); layout publication is proven through
    the store and snapshot reads. Browser proof remains the gap
    between this E2 and an E3 claim for the _operated_ journey.
- **In-body post images in bare `<p><img>` form** are not carried
  into the article body by the bounded body converter (only
  figure-form images become media relationship nodes). The assets
  themselves are imported and accounted (featured image, layouts);
  the bare-paragraph form is a named converter bound, not a silent
  asset loss.
- **Conversion-apply media accounting** surfaces acquisition errors
  but not warnings: a skipped remote file is visible in the apply
  result only as absence from the created/reused id lists (the
  pipeline report carries the explicit warning). Noted, not fixed —
  outside the journey-blocking set.
- The draft post's legacy URL also receives a redirect record
  (to its still-draft article path), matching the existing
  pipeline behavior for planned URLs; noted for a future pass.
