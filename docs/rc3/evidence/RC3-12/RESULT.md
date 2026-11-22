# RC3-12 — Creator career catalog and portability (non-podcast slice)

**Verdict: DONE at E2 per leg** on branch `rc3-12`, based on `82b5c6c`
(GitHub main, verified unmoved at pass start). Local commits only;
nothing pushed.

Scope was set by the owner's option A decision (Nov 21, 2026): build
the non-podcast parts of RC3-12/13/14 now; podcast-dependent slices
close when RC3-10/11 land with the podcaster build.

## What was built

A creator's body of work now imports through a stage-first catalog
pipeline (`src/modules/creator-catalog/`), instead of only the shop's
product catalog and the site-bundle portability flow that existed
before:

- **Versioned manifest + staging verdicts** (`contracts.ts`): a
  catalog manifest (format v1) is classified by a pure function —
  every item lands **ready / review / blocked** with actionable
  reasons. Malformed items, checksum mismatches and missing consent
  block; duplicate titles and unverified rights go to review; roster
  records are refused by design (see below). Items carry durable keys
  (series/item source ids), provenance, consent/rights status and a
  content checksum.
- **Stage first, apply second** (`service.ts`): staging persists the
  manifest + verdicts on an import run and writes NOTHING to the
  catalog tables; re-staging the same manifest replays the same run.
  Apply writes only `ready` items, keyed by durable key + checksum —
  a partial apply (`maxItems`) reports `partially-applied` with a
  remaining count, resumes without duplicates, and a re-apply is a
  no-op (5 skipped). Staging/applying send **no notifications** (the
  service has no notification path; the integration test also counts
  notification rows before/after).
- **Listing policy ≠ access policy**: series and items each carry
  `listing_policy` (listed/unlisted) and `access_policy`
  (free/member). The public listing and the **search projection
  filter on both before entries, facet counts or transcript snippets
  are produced** — a member-only work does not leak anonymously, not
  even as a facet count or a query hit.
- **Export and restore the same graph**: `exportCatalogManifest`
  emits a v1 manifest whose source ids are the durable keys; staging
  and applying it on a second site reproduces the identical durable
  keys, titles and checksums, with site isolation intact.
- **Authority**: staging/apply/export require the site's
  owner/admin tier (`community-manager` standing in
  `member_site_roles`, the same tier `community/groups.ts` treats as
  site staff). A plain member is refused; an owner of another site
  has no standing.

Migration `20261121_190000_rc312_creator_catalog` adds
`creator_catalog_series`, `creator_catalog_items`,
`creator_catalog_import_runs`.

## Per-leg levels (all E2 — real Postgres, two-site rc2 world)

| Leg                                                              | Level | Proof                                                                                                                  |
| ---------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| Manifest staging verdicts (ready/review/blocked, reasons)        | E2    | `rc312-creator-catalog.integration.test.ts` staging test + 6 unit tests in `tests/unit/rc3-12-creator-catalog.test.ts` |
| Stage-first (nothing written, no notifications)                  | E2    | item count 0 after staging; notification row counts unchanged                                                          |
| Apply + partial resume without duplicates                        | E2    | maxItems=2 → partially-applied (remaining 3) → resume creates 3 → re-apply skips 5                                     |
| Listing vs access policy; search filtered before facets/snippets | E2    | anonymous listing/search show only free+listed; member and unlisted works absent incl. facets and title query          |
| Export → restore on a second site                                | E2    | identical durable keys on site B; site B listing isolated                                                              |
| Staff authority / cross-site refusal                             | E2    | member → `CATALOG_STAFF_REQUIRED`; other site's owner → `CATALOG_NO_STANDING`                                          |

No E3 claimed: there is no browser/UI leg — the catalog admin pages
are future work; the service layer is the contract, as with RC3-15B.

## Deferred to RC3-10/11 (option A, by design)

- **Podcast episode/season cataloguing**: episode kinds, transcripts
  attached to episodes, and feed references/GUID stability ride the
  podcast passes. The manifest classifier names this: a
  `podcast-episode` kind is blocked with the reason that podcast
  kinds ride RC3-10/11 — refused loudly, never silently mapped.
- **Browsable series/season/episode pages**: the listing projection
  is proven at the service layer; rendered pages ride the podcast
  and presentation work.
- **Member roster import**: refused by design in this slice — it
  requires the approved, separately audited grant workflow named in
  the brief, and creates no billing or newsletter consent.
- **Entitlement resolution for `access_policy='member'`**: the
  viewer seam takes `entitled` as an input; wiring it to real
  membership entitlements is RC3-13's surface.

## Gauntlet (CI order, final tree)

Baselines on pristine `82b5c6c` (adopted from the recorded baseline
run and re-verified): unit 348 files / 2,822 tests; integration
98 files / 576 tests (570 pass + 6 skip).

Final: migrations fresh ✓ · seed ✓ · format:check ✓ · lint ✓ ·
typecheck ✓ · unit **349 files / 2,828 tests, all pass** ·
integration **99 files / 575 pass + 6 skip, 0 fail** · build ✓ ·
smoke ✓ (`PASS: Next.js public/admin routes and Payload PostgreSQL
persistence are operational`).

Environment notes, for the record: a VM replacement killed the first
gauntlet mid-integration; Postgres was reinstalled and the databases
recreated before the re-run. The build OOM-died twice
(`/proc/vmstat` oom_kill 1 → 2; silent stop at the compile/TypeScript
phase) and passed clean on attempt 3 from a clean `.next` at
RAYON 1 / 2.5 GB heap — environment, not code: no source changed
between attempts. One typecheck error (TS2367 in the classifier's
closure-mutated state) was found by the first gauntlet and fixed by
returning state from the verdict helpers; the full gauntlet above is
the post-fix tree.
