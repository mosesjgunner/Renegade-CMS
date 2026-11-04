# R-03C — Publication, public routes, build and visibility regression reconciliation

## STATUS

**R-03C PASS** (2026-11-03, local production processes on this Docker-less
host; the original 2026-10-18 frozen record is preserved in
`docs/rc/evidence/rc1/18-pass/03C/` and its NOT READY row history is
preserved in the ledger).

**Evidence-only repair: zero product changes.** The frozen run's sole
blocker — the full typecheck exiting 2 with seven diagnostics in the
then-concurrent 03D verifier — is closed on the current tree: the 03D work
has since settled and `npm run typecheck` exits 0. Everything else in the
03C contract (publication lifecycle, archives, feeds, search, sitemap,
slug redirects, visibility, cross-site isolation, public bundle boundary)
was re-executed end-to-end against the production build and already
works; the only failures encountered during the runs were two
harness-era alignments, documented below, not product defects.

## TESTED SOURCE

- Branch `rc1-repair-03c`, created from `rc1-repair-03b` @ `12b2086`.
- Base parity: the `src/` diff between the corrected union `rc1-union` @
  `604e940` and this branch's final HEAD is exactly three files —
  `src/collections/Sites.ts` and `src/modules/editorial/hierarchy.ts` (the
  accepted R-03A product fix) and `src/modules/commerce/tasks.ts` (the
  accepted 17E stale-lease fix) — all outside R-03C scope, and this repair
  adds no `src/` change, so the verification carries over to the union
  unchanged.
- Final tree HEAD `c6e3ae5` (harness commits only; no product code).
  Production build `npm run build` exit 0; `build-provenance.json`
  sourceSha `c6e3ae56603aa24c9eebd121b362dadddf72fb94`, `clean: true`,
  version `0.1.0`, lockfileSha256
  `db6f9bbcca7ec4232a72af85e9e13762429bb3f1dbce09fd20f120ce1e3ccc33` (same
  lockfile hash as the R-03B build). Definitive-build note, following the
  R-03B precedent: a first build of an earlier harness commit recorded
  `clean: true` at `5d785d7`; a subsequent build attempt recorded
  `clean: false` solely because the first build had rewritten
  `next-env.d.ts` (its committed content points at a Pass-16 dev dist
  directory). The file was restored, the tree verified clean, and the
  build re-run definitively at `c6e3ae5`.
- Typecheck on the pristine candidate (`12b2086`, before any harness
  work): `npm run typecheck` exit **0** — the frozen gate failure does
  not reproduce on this tree.
- Runtime: production standalone server (`.next/standalone/server.js`) +
  `npm run jobs:worker` as local processes behind a local HTTPS reverse
  proxy (self-signed TLS), mirroring the R-01B/R-03A/R-03B local
  precedent. PostgreSQL **16.15** — reinstalled this session after a VM
  replacement wiped the cluster (azure-only apt recipe from the 17C
  handoff; the stock mirror hangs) — disposable database
  `rc1r03c_main`, **131 migrations** via the supported
  `npm run db:migrate`. Profile Standard, `RENEGADE_MODULES=all`, local
  only. Test authentication DISABLED (`ENABLE_TEST_ROUTES=false`,
  `LOCAL_E2E_TEST_MODE=false`).
- Harness: `node tests/rc1-r03c/run-local.mjs` — local-process variant of
  the frozen `tests/rc1-03c/verify-publication.ts` (same assertion set):
  journey → web+worker process restart **and PostgreSQL cluster restart**
  → restart re-verification. Mutations use the frozen run's operator
  pattern (access-checked Payload Local API as persisted identities,
  `overrideAccess: false`); anonymous HTTP/Chromium prove the output.
  **No passkey ceremony is claimed here** — that is R-01B's proof on this
  same tree.

## FIRST FAILURE

No product defect was reproduced. The frozen blocker (typecheck, above)
is closed. Two failures were encountered during the runs, in order; both
are harness-era alignments, resolved without touching product code:

1. **Fixture bootstrap denied (harness-era assumption).** First journey
   run died at `updateGlobal site-settings` → 403 "You are not allowed to
   perform this action." Identical root cause to the R-03A/R-03B first
   failure: the frozen fixture's member-linked owner has an empty
   operator scope under the operator-grant model now on the tree.
   Alignment (same precedent): the fixture owner receives installation's
   canonical site grants — role `community-manager` on both sites,
   exactly the mapping `src/modules/operations/installation.ts` uses —
   which makes a role-`owner` user global under
   `resolveOperatorGrantContext`. The product's own flows never produce
   the grant-less state.
2. **Browser script-content fetch TLS failure (transport alignment).**
   The journey's per-script content check died with `EPROTO … wrong
   version number` fetching the first downloaded chunk via Playwright's
   `context.request`. The `.test` site hosts exist only inside Chromium's
   `--host-resolver-rules`; the request context resolves them through
   real DNS and the TLS fetch lands on a non-TLS endpoint. Alignment:
   script bytes are fetched through the same local HTTPS proxy the
   browser used — by loopback IP, with the script's own Host header — so
   the check inspects byte-for-byte the response the browser received.
   No assertion was removed or loosened.

## CHANGES

Product: **none.**

Harness only (`tests/rc1-r03c/`, commits `5d785d7` + `c6e3ae5`):

- `run-local.mjs` — supervisor: resets the disposable `rc1r03c_main`
  database, applies migrations, starts web + worker + HTTPS proxy, runs
  journey → web+worker process restart + PostgreSQL cluster restart →
  restart phase, tears everything down; exit 0 only if both phases
  exit 0.
- `verify-publication-local.ts` — the frozen `verify-publication.ts`
  retargeted to the local-process topology (site hosts
  `rc1-03c.test`/`beta.rc1-03c.test`, web port 38761, HTTPS proxy
  origins, evidence under this folder, production **standalone**
  client-reference manifests in place of the frozen run's dev-server
  manifests), with the installation-canonical fixture grants (First
  failure #1) and the proxy script fetch (First failure #2).

No schema changes were made, so no fresh/upgrade migration delta arises
from this repair; the fresh database applied the full 131 migrations
cleanly (the frozen run applied the then-current 120).

## REAL WORKFLOW

Definitive supervisor run exit **0**: **journey 93/93 + restart 19/19 =
112 checks, 0 failed, 0 skipped.** The frozen journey recorded 100
assertions; the assertion sets are identical — the count differs by
exactly the public-script checks (9 consolidated production chunks vs
the dev graph's 16 modules; the remaining 84 checks match one-for-one).

- **Journey (93/93)** — two host-scoped sites (Alpha/Beta) with persisted
  owner, foreign staff and member identities. Access-checked native API
  creates author/tag/category and five records (article, page, draft,
  members-only, to-be-trashed) with Lexical bodies; publishing persists
  status and the companion's actual immutable published-revision
  pointer. Anonymous HTTP returns 200 with the article/page bodies at
  their canonical paths; author, tag and category archives contain the
  published title and exclude draft/members/trashed titles, whose direct
  routes return 404; home, `/articles`, RSS, JSON feed and search exclude
  all three hidden titles; Beta's feed excludes Alpha's article, an
  unknown feed host returns 404, and a foreign search-site substitution
  returns 404. Denied anonymous, member and foreign-site staff updates
  all reject, with the full persisted row deep-compared unchanged.
  Publication navigation is stored pointing at the article; a slug
  rename moves the stored navigation and tag archive to the new
  canonical URL, the old URL returns 308 with the exact new Location,
  and the new URL returns 200 with the body. Anonymous Chromium renders
  the renamed article and follows its author-archive link (screenshot
  retained); all **9** downloaded public scripts and both public routes'
  standalone client-reference manifests
  (`[...path]`, `articles/[slug]`) are free of `@puckeditor`,
  `BuilderShell.tsx` and `VisualEditor.tsx`. Unpublishing removes the
  stored navigation link, persists draft status, and the route plus the
  now-empty author/tag archives return 404 (the archive service itself
  returns null). Trash path: hard deletion of the history-referenced
  record is rejected (`editorial revision history cannot be deleted`);
  the supported trash persists `archived` + `retentionMode: tombstone` +
  `removeFromDiscovery` with history intact; an unreferenced draft is
  genuinely hard-deleted and absent on refetch and HTTP. A colliding
  canonical-path edit is rejected with the original page unchanged. The
  page is renamed (308 → 200), persisted as the homepage selection, and
  anonymous `/` renders its body for Alpha but not for Beta's host.
  Private/trashed scoped feeds return 404, the page's scoped feed
  returns 200, and the sitemap excludes the members-only slug.
  (`journey.json` — checks plus per-request HTTP trace with status,
  Location and byte counts — `state.json`, `public-script-urls.json`,
  `author-archive.png`)
- **Restart (19/19)** — web and worker processes restarted **and the
  PostgreSQL cluster restarted** (`pg_ctlcluster 16 main restart`)
  between phases. Persisted unpublish (draft), members-only visibility
  and tombstone policy re-verified from the database; the renamed page
  and homepage return 200 with the body; both old URLs still 308; the
  unpublished article, hidden records and now-empty archives still 404;
  the article is still absent from feed and search. (`restart.json`)

## TESTS

- Supervisor acceptance: **112 passed / 0 failed** (93 journey + 19
  restart), exit 0.
- Focused unit files (the frozen 03C set of 8): **46 passed / 0 failed**,
  exit 0 — the frozen run's 45 on the same files, plus exactly the R-03A
  regression test that now lives in `content-hierarchy.test.tsx`
  (`content-archives`, `content-publication-references`,
  `article-route-hierarchy`, `discovery-contracts`, `public-navigation`,
  `public-contracts`, `semantic-url`, `content-hierarchy`).
- Scoped ESLint on the frozen 03C file list plus the two harness files:
  exit **0**.
- Production build: `npm run build` exit **0** (provenance above).
- Full unit suite (`npm test`, final tree): **2053 passed / 11 failed
  (2064)** — **identical to the standing R-03A/R-03B baseline; delta
  exactly zero** (no new tests, consistent with an evidence-only
  repair). The 11 failures are the identical pre-existing set:
  flow-04-acceptance ×1, payload-domains ×1, rc1-04d-campaign-commerce
  ×1, shop-08-command-center-boundaries ×2 (the 5 named pre-existing),
  plus rc1-05a-media-lifecycle ×3 and med-01-upload-sessions ×3 (the 6
  media site-scope failures flagged for R-05C / Pass 18; R-03C evidence
  does not implicate them and they were not touched).
- Final-tree typecheck: `npx tsc --noEmit` exit **0** (also exit 0 on the
  pristine candidate and with the harness present). This closes the
  frozen 03C record's only blocker on this tree.

## NEGATIVES + RESTART

- Denied/negative cases executed (journey): anonymous, member and
  foreign-site staff publication changes (all rejected, persisted row
  byte-identical afterwards); draft/members-only/trashed direct routes
  (404); hidden titles absent from home, article archive, RSS, JSON
  feed, search, sitemap and author/tag/category archives; unknown-host
  feed (404); foreign search-site substitution (404); Beta host renders
  neither Alpha's homepage selection nor its feed content; hard deletion
  of a history-referenced record (rejected); duplicate canonical-path
  edit (rejected, original unchanged).
- Restart: web + worker **process** restart **and PostgreSQL cluster**
  restart both executed (19/19 above) — the local variant is not bounded
  to processes here, and matches the frozen run's web+DB restart shape.

## EVIDENCE (this folder)

- `RESULT.md` (this file), `NEXT.md`
- `journey.json` — 93 checks + per-request HTTP trace (path, host,
  status, Location, bytes)
- `restart.json` — 19 post-restart checks + HTTP trace
- `state.json` — fixture record IDs shared between the phases
- `public-script-urls.json` — the 9 production script URLs the anonymous
  browser downloaded
- `author-archive.png` — anonymous Chromium on the author archive

## REMAINING BLOCKERS

None for R-03C. Bounded / unexecuted items, named honestly — none of
these is relabeled as passed:

- Mutations were exercised through the supported operator path
  (access-checked Payload Local API as persisted identities) — the same
  acceptance shape as the frozen run. A full authenticated admin-browser
  click of the Trash control remains unexecuted (it was unexecuted in
  the frozen run as well), and no passkey ceremony is claimed; R-01B
  proves the genuine passkey ceremony on this same tree.
- Production image / Compose proof is unexecuted — Docker cannot run on
  this host (established in 17C). The local-process production build is
  the strongest proof available here.
- No browser **video** file was produced; browser evidence is the trace
  + HTTP log + screenshot, as listed.
- No schema change was made, so there is no migration delta beyond the
  fresh 131 migrations.
- Carried, out of scope: the 6 media site-scope unit failures remain for
  R-05C / Pass 18 reconciliation.

## NEXT

R-03C is complete. Do not start another repair automatically; R-05C is
next only on the parent's instruction (see NEXT.md).
