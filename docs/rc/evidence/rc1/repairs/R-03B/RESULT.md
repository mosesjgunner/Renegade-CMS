# R-03B — Editor / drafts / previews / revisions / locks reconciliation

## STATUS

**R-03B PASS** (2026-11-03, local production processes on this Docker-less
host; the original 2026-10-20 frozen record is preserved in
`docs/rc/evidence/rc1/18-pass/03B/` and its NOT READY row history is
preserved in the ledger).

**Evidence-only repair: zero product changes.** Both blockers that kept the
frozen run NOT READY are closed on the current tree without any product
edit — the strict preview no-store gate passes against the **production**
runtime (the frozen failure was a Next.js development-runtime artifact),
and the production build now succeeds (the frozen `node:crypto` client
blocker is gone on this tree). Everything else in the 03B contract —
authoring, autosave, revisions, restore, locking, preview isolation — was
re-executed end-to-end and already works; the only failures encountered
during the runs were harness-era assumptions, documented below, not
product defects.

## TESTED SOURCE

- Branch `rc1-repair-03b`, created from `rc1-repair-03a` @ `0c2d7b9` (the
  R-03A evidence tip; its code HEAD was `eda6881`).
- Base parity: the `src/` diff between the corrected union `rc1-union` @
  `604e940` and the repair base is exactly three files —
  `src/collections/Sites.ts` and `src/modules/editorial/hierarchy.ts` (the
  accepted R-03A product fix) and `src/modules/commerce/tasks.ts` (the
  accepted 17E stale-lease fix) — all outside R-03B scope. No other
  R-03B-scoped source differs from the union, so this verification carries
  over to the union unchanged.
- Final tree HEAD `257b7c6` (harness commit only; no product code).
  Production build `npm run build` exit 0; `build-provenance.json`
  sourceSha `257b7c67c6e79079c7597f92b00017a8ae565767`, `clean: true`,
  version `0.1.0`, lockfileSha256
  `db6f9bbcca7ec4232a72af85e9e13762429bb3f1dbce09fd20f120ce1e3ccc33`. (An
  earlier build of the same source recorded `clean: false` solely because
  untracked evidence outputs were still in this folder and `next-env.d.ts`
  had been rewritten by `next dev`; the evidence was moved aside,
  `next-env.d.ts` restored, the tree verified clean, and the build re-run
  definitively.)
- Runtime: production standalone server (`.next/standalone/server.js`) +
  `npm run jobs:worker` as local processes behind a local HTTPS reverse
  proxy (self-signed TLS), mirroring the R-01B/R-03A local precedent.
  PostgreSQL **16.15**, disposable database `rc1r03b_main`, **131
  migrations** via the supported `npm run db:migrate`. Profile Standard,
  local only. Test authentication DISABLED (`ENABLE_TEST_ROUTES=false`,
  `LOCAL_E2E_TEST_MODE=false`).
- Harness: `node tests/rc1-r03b/run-local.mjs` — local-process variants of
  the frozen `tests/rc1-03b/` acceptance (`verify-editor-local.ts`,
  `verify-privacy-local.ts`): journey → privacy → web+worker process
  restart → restart re-verification, every phase async so the supervisor
  never starves its own proxy (R-01B lesson). The verifiers use the
  original run's operator fixture-session pattern (persisted
  `admin_sessions` rows via the product's own `createPasskeySession`);
  **no passkey ceremony is claimed here** — that is R-01B's proof on this
  same tree.

## FIRST FAILURE

No product defect was reproduced. Three failures were encountered during
the runs, in order; all three are harness-era alignments, resolved without
touching product code:

1. **Fixture bootstrap denied (harness-era assumption).** First journey
   run: `POST /api/globals/site-settings` → 403 "You are not allowed to
   perform this action." The frozen fixture creates a member-linked
   `owner` user with no grants. Under the operator-grant model now on the
   tree, `SiteSettings` update access (`operatorAllSitesAccess`) requires
   a global owner; a grant-less linked owner is deliberately unauthorized.
   The product's own flows never produce that state. Alignment (same
   precedent as R-03A): the fixture owner receives installation's
   canonical site grants — role `community-manager` on both sites, exactly
   the mapping `src/modules/operations/installation.ts` uses — which makes
   a role-`owner` user global under `resolveOperatorGrantContext`.
2. **Preview same-origin rejection (transport alignment).** Journey died
   at `POST /api/admin/content/preview` → 403 "Same-origin request
   required." The preview route requires the `origin` header to equal the
   request origin as seen via the `host` header; direct web-port calls
   sent the public origin against a loopback host and failed the check.
   Alignment: both verifiers' API calls now go through the local HTTPS
   proxy, so the route sees the real public origin — the same topology
   the product's own browser flow uses. No access rule changed.
3. **Privacy-phase preview mint 404 (phase-ordering alignment).** Privacy
   died at its staff preview mint → 404 "Content preview is unavailable."
   The completed journey had already revoked the author's grant while
   proving that exact revocation behavior end-to-end, so the author could
   no longer mint. (The frozen journey died at its dev cache gate before
   reaching the revocation step — the only reason the frozen privacy phase
   found the grant still present.) Alignment: the local privacy phase
   re-issues the author's `contributor` grant through the local API — the
   same grant an owner creates through supported controls — before its
   mint/revoke/deny sequence, so the sequence runs against a live grant
   exactly as written.

The frozen run's two recorded blockers, re-examined on this tree:

- **Strict preview no-store gate (frozen: 3 cache failures in dev).**
  `src/proxy.ts` already sets `Cache-Control: private, no-store` on
  `/preview/article/*` and the preview-mint route returns the same header.
  The frozen failure was the Next.js **development** runtime overriding
  cache headers. The local proof runs the production standalone server,
  where the gate passes: privacy phase cache failures **0**.
- **Production build blocked by `node:crypto` in a Social client
  component (frozen).** `npm run build` exits 0 on the current tree
  (next 16.4.1 era) with clean provenance. No build change was needed.

## CHANGES

Product: **none.**

Harness only (`tests/rc1-r03b/`, commit `257b7c6`):

- `run-local.mjs` — supervisor: resets the disposable `rc1r03b_main`
  database, applies migrations, starts web + worker + HTTPS proxy, runs
  journey → privacy → web+worker process restart → restart phases, tears
  everything down; exit 0 only if journey, privacy and restart all exit 0.
- `verify-editor-local.ts` — journey + restart phases of the frozen
  `verify-current.ts`, retargeted to the local-process topology (HTTPS
  proxy transport, `.test` host mapping, raw multipart media upload with
  explicit Host header, console/pageerror events recorded non-gating to
  `console-events.json`), with the installation-canonical fixture grants
  (First failure #1).
- `verify-privacy-local.ts` — the frozen `verify-privacy.ts` retargeted
  the same way, with the grant re-issue alignment (First failure #3) and
  its own output filenames so it does not collide with the journey's.

No schema changes were made, so no fresh/upgrade migration delta arises
from this repair; the fresh database applied the full 131 migrations
cleanly.

## REAL WORKFLOW

All three supervisor phases green on the definitive run
(**51/51 checks**: journey 29 + privacy 12 + restart 10; privacy cache
failures 0 — the frozen run's 3 are gone):

- **Journey (29/29)** — native API creates and reloads two articles and
  one page with headings, formatting, links, supported block/media embeds
  and ordered author metadata; the ordinary native editor loads the real
  Lexical body, inline media and callout controls; browser Lexical typing
  autosaves to real canonical content and creates a canonical saved
  revision; reload retains the browser-authored draft and original blocks;
  a failed autosave (injected HTTP 503) keeps the editor text while
  persisted state is unchanged, and ordinary **Retry draft save** persists
  the retained text; simultaneous native editor sessions show
  document-lock feedback to the second editor; native save and restore
  both honor another editor's lock (409/423) with no partial revisions; a
  restore storage failure rolls back body, companion record and appended
  revision; the ordinary History UI restores the original body and appends
  a new revision; supported API edits persist article and page without
  losing media/blocks, and supported API restores recover the exact
  originals and append history. Saved unpublished previews are authorized
  and no-index/no-store for all three records; draft/private records are
  excluded from anonymous public URLs; previews honor author display order
  and render combined formatting, real link fields and the original media
  bytes. (`journey-trace.json`, `persistence.json`, `state.json`,
  `editor-fields.json`, `editor-loaded.png`, `lock-conflict.png`,
  `revision-restore.png`, `unpublished-preview.png`)
- **Privacy (12/12)** — authorized unpublished article/page previews
  render the original blocks with noindex; rendered inline media bytes,
  combined marks and actual Lexical links verified; author names render in
  explicit display order; anonymous, foreign creator/site, ungranted,
  tampered and expired preview URLs all denied; denied edits/restores/
  previews and foreign revision substitution preserve full content and
  history; revoking a creator grant denies its previously issued preview;
  draft/private paths and titles absent from the public sitemap and feed;
  no private draft text appears in public feeds/search.
  (`privacy-trace.json`, `privacy-state.json`, `privacy-persistence.json`,
  `unpublished-preview-privacy.png`)
- **Restart (10/10)** — web and worker processes restarted; exact
  persisted body/authors/status re-verified for all three records;
  draft/private records still not public; append-only restored revision
  history retained; the original saved preview remains authorized and
  no-indexed and renders the actual original media bytes; the native
  Lexical editor reopens the restored draft.
  (`restart-trace.json`, `unpublished-preview-restart.png`,
  `editor-restart.png`)

Persistence snapshot: the three records are article/draft, article/draft,
page/draft; the first record's history is 4 revisions with reasons (newest
first) `restored`, `edited`, `edited`, `created` — version changes without
data loss, matching the frozen run's persisted 4/3/3 revision shape.

Console events were recorded, not just the rendered UI: 4 events in
`console-events.json` — the expected injected 503, and
`ERR_SSL_PROTOCOL_ERROR` entries from the sandbox's self-signed-TLS
topology. Browser assertions still passed; these are recorded verbatim and
are **not** claimed as zero console errors.

## TESTS

- Supervisor acceptance: **51 passed / 0 failed** (29 journey + 12 privacy
  + 10 restart), exit 0; privacy cache failures **0**.
- Focused unit files (the original 03B set of 9): **58 passed / 0
  failed**, exit 0 — the same 58 count as the frozen run, now on the
  current tree (`rich-editor-draft-preview`,
  `rc1-03b-current`, `rc02-content-preview`, `rc02-published-revision`,
  `rc08d-lock-projection`, `editorial-workflow`,
  `flow-01-cmos-workflow`, `flow-00-workflow-contract`,
  `editorial-workflow-permissions`).
- Scoped ESLint on the 03B source/harness files: exit **0**.
- Production build: `npm run build` exit **0** (provenance above).
- Full unit suite (`npm test`, final tree): **2053 passed / 11 failed
  (2064)** — **identical to the R-03A baseline; delta exactly zero** (no
  new tests, consistent with an evidence-only repair). The 11 failures are
  the identical pre-existing set: flow-04-acceptance ×1, payload-domains
  ×1, rc1-04d-campaign-commerce ×1, shop-08-command-center-boundaries ×2
  (the 5 named pre-existing), plus rc1-05a-media-lifecycle ×3 and
  med-01-upload-sessions ×3 (the 6 media site-scope failures flagged for
  R-05C / Pass 18; R-03B evidence does not implicate them and they were not
  touched).
- Final-tree typecheck: `npx tsc --noEmit` exit **0**. This closes the
  original 03B record's open type item on this tree (frozen run: exit 1,
  7 diagnostics in `tests/rc1-03d/verify-import-and-build.ts`).

## NEGATIVES + RESTART

- Denied/negative cases executed (journey + privacy phases): anonymous
  draft URL (404); foreign-site, foreign-creator, ungranted, tampered and
  expired preview tokens (all denied); insufficient edit role;
  unauthorized edits/restores/preview-minting and foreign revision
  substitution — all denied with full content/history deep-compared
  unchanged; lock conflict on simultaneous editing (second editor sees
  lock feedback; native save/restore under another's lock return 409/423
  with no partial revisions); interrupted autosave (injected 503) retains
  editor text with persisted state unchanged, recovered via Retry;
  grant revocation immediately invalidates an existing preview; draft
  text absent from public feeds/search/sitemap.
- Restart: web + worker **process** restart executed (10/10 above).
  Bounded: the local variant does not restart the PostgreSQL process
  itself; the 2026-10-20 run's web+PostgreSQL restart proof stands for
  the same code path.

## EVIDENCE (this folder)

- `RESULT.md` (this file), `NEXT.md`
- `journey-trace.json`, `privacy-trace.json`, `restart-trace.json` —
  per-phase check traces (29 / 12 / 10, all succeeded)
- `persistence.json`, `privacy-persistence.json`, `state.json`,
  `privacy-state.json`, `editor-fields.json` — persisted-state assertions
- `console-events.json` — browser console/pageerror events, recorded
  verbatim (non-gating)
- `editor-loaded.png`, `lock-conflict.png`, `revision-restore.png`,
  `unpublished-preview.png`, `unpublished-preview-privacy.png`,
  `unpublished-preview-restart.png`, `editor-restart.png`,
  `editor-loaded.txt` — browser screenshots/text from the journey,
  privacy and restart phases

## REMAINING BLOCKERS

None for R-03B. Bounded / unexecuted items, named honestly — none of these
is relabeled as passed:

- Ordinary authenticated admin-form authoring and a genuine **passkey
  ceremony** are not claimed (operator fixture sessions via the product's
  own `createPasskeySession`, as in the original 03B run). R-01B proves
  the genuine passkey ceremony on this same tree.
- Production image / Compose proof is unexecuted — Docker cannot run on
  this host (established in 17C). The local-process production build is
  the strongest proof available here.
- The local restart covers web + worker **processes** only, not a
  PostgreSQL process restart (see above).
- No browser **video** file was produced; browser evidence is traces +
  screenshots + console events, as listed.
- No schema change was made, so there is no migration delta beyond the
  fresh 131 migrations.
- Carried, out of scope: the 6 media site-scope unit failures remain for
  R-05C / Pass 18 reconciliation.

## NEXT

R-03B is complete. Do not start another repair automatically; R-03C is
next only on the parent's instruction (see NEXT.md).
