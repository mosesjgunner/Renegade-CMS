# GUI-01B (pack) — Authenticated baseline and screenshot harness

**Result: PASS** (baseline established; two findings handed to GUI-01C)

## What was captured

Eight authenticated screenshots of the current operator UI, taken with a
fixture owner session against a disposable database — no production accounts
or data involved. Full index with routes, viewports, themes, file hashes and
DOM probes: `captures.json` in this directory.

| Capture                   | Route                                                 | Viewport | Theme |
| ------------------------- | ----------------------------------------------------- | -------- | ----- |
| admin-home-desktop        | /admin                                                | 1440×950 | light |
| content-list-desktop      | /admin/collections/content                            | 1440×950 | light |
| create-article-desktop    | /admin/collections/content/create?contentType=article | 1440×950 | light |
| edit-article-desktop      | /admin/collections/content/<fixture article>          | 1440×950 | light |
| create-article-mobile-375 | create (article)                                      | 375×800  | light |
| create-article-tablet-768 | create (article)                                      | 768×1000 | light |
| edit-article-dark         | edit (fixture article)                                | 1440×950 | dark  |
| media-library-desktop     | /admin/media-library                                  | 1440×950 | light |

## Baseline facts the captures establish

- Authenticated admin screens are no longer NOT VERIFIED: dashboard, content
  list, editor create/edit, and media library were all rendered and inspected
  in this run.
- The editor captures show the **pre-GUI-04A tabbed layout** (Writing /
  Presentation / Media / Publish / SEO / Advanced), because the capture build
  was made from main `aa92a5e`, which predates the PR #31 merge (`8b68f1c`).
  These are therefore the pack's before-state for the editor; the after-state
  is the GUI-04A evidence in `docs/beta/evidence/GUI-01B/`. A post-merge
  recapture of the editor set is a small follow-up (see below).
- Editor probes (desktop create/edit): headline field top ≈ 777px, headline
  font 13px, Lexical canvas mounted (1 editable root, ≈49px initial height),
  no sidebar, no collapsibles, zero horizontal overflow at 1440 / 768 / 375.
- Dashboard (custom view) renders task-first content: setup progress, recent
  drafts (the fixture article appears), scheduled, recently published, needs
  attention.
- Dark theme capture confirms `data-theme="dark"` on the edit view.

## Findings for the GUI-01C defect register

1. **Media Command Center shows a raw error banner**: "The collection with
   slug media-jobs can't be found. Find Operation." — visible in
   `media-library-desktop.png` on a fresh install where the media-jobs
   collection is not registered. User-facing internal error text; severity
   for 01C to rank.
2. **Media library styling is inconsistent with the rest of the admin**
   (raw unstyled controls below the header) — corroborates audit UX-06/07
   (operations dominate, styling varies by subsystem).

## Method (why this run is trustworthy where earlier attempts were not)

- Served from a **production build** (`npm run build`, standalone output),
  not `next dev` — dev servers repeatedly died ~60s into authenticated runs
  in this environment during GUI-04A closeout.
- Capture runner is plain Node (`tests/beta-gui01b-v2/capture.mjs`,
  playwright-core, string-form `page.evaluate` only — tsx-transformed
  evaluate closures hang). Hard 20-minute watchdog; per-page settle polling.
- Fixtures/session: `tests/beta-gui01b-v2/seed-session.mts` creates the
  fixture site, owner, seeded article and a passkey session in the disposable
  database `gui01b_capture_release_acceptance` (name satisfies the
  integration runner guard). The session token file never enters the repo.
- Config note: the app is production-hardened — with `NODE_ENV=production`
  it refuses loopback HTTP `APP_URL`, non-HTTPS origins, placeholder or
  short secrets, and relative `MEDIA_DIR`. The sanctioned local path is
  `LOCAL_E2E_TEST_MODE=true`. A fresh 64-hex fixture secret was generated
  for this run because the shared test secret trips the production
  strength/placeholder checks; the fixture user email must use a routable
  domain (`.test` is rejected by email validation; `.example.com` works).

## Commands / tests

- `npm run db:migrate` on the disposable DB: 132 migrations, clean.
- `npm run build`: exit 0; build provenance records source `aa92a5e`.
- Capture run: 8/8 CAPTURED, exit 0. No unit/integration suites were re-run:
  this prompt changes no product code (docs + test-harness files only), and
  the baseline source is main itself, whose gates are already green.

## Data / authorization guarantees

- All captures used one fixture owner session on a disposable database.
  No production account, no live data, no auth bypass: the session is the
  product's own passkey session mechanism, created through Payload's local
  API with overrideAccess inside the fixture script, the same pattern as
  the 14A/GUI-04A harnesses.

## Blocked / unverified

- Post-merge (8b68f1c) editor recapture: not done in this run (the build
  predates the merge by one commit). Small follow-up; the machinery now
  exists and a recapture is a rebuild + rerun.
- SEO preview, scheduling dialog, revision history, media picker modal:
  named in the audit's GUI-01B task list; not in this capture set. They
  remain NOT VERIFIED visually and are candidates for the 01C register's
  coverage gaps or a 01B-R1 top-up.
- The remaining ~100 native collection screens from the audit's Appendix A
  register were not captured; the baseline covers the core operator
  surfaces only.

## Changed files

- `tests/beta-gui01b-v2/capture.mjs` — capture runner (new).
- `tests/beta-gui01b-v2/seed-session.mts` — fixture seeder (new).
- `docs/beta/evidence/GUI-01B-pack/` — 8 PNGs, `captures.json`,
  `captures-raw.json`, this RESULT.
- `docs/beta/gui-overhaul/progress.md` — GUI-01B row updated.

**Exact next prompt: GUI-01C.**
