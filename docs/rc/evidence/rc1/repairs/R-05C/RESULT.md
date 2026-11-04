# R-05C — miniPaint export, edited media and complete restore reconciliation

## STATUS

**R-05C PASS** (2026-11-03, local production processes on this Docker-less
host, in **two** isolated environments; the original 2026-10-18 frozen
record is preserved in `docs/rc/evidence/rc1/18-pass/05C/` and its
NOT READY row history is preserved in the ledger).

Both halves of the frozen failure are closed. The export half no longer
reproduces (the site-query defect was already repaired on this tree).
The restore half **did** reproduce as a genuine product defect — the
supported import could not restore the exported archive into a fresh
installation — and is repaired in product code (commit `3ad57a3`, see
CHANGES). The six media site-scope unit failures flagged for this
repair are also closed (fixture alignment, no assertion changed), and
the full suite improves by exactly those six.

## TESTED SOURCE

- Branch `rc1-repair-05c`, created from `rc1-repair-03c` @ `3e4e2c0`.
- Base parity: the `src/` diff between the corrected union `rc1-union` @
  `604e940` and this branch is exactly the three accepted files
  (`Sites.ts`, `hierarchy.ts` — R-03A; `commerce/tasks.ts` — 17E) plus
  this repair's three portability files; the media/miniPaint/upload
  scoped diff against the union was empty before this repair began, so
  the verification carries over to the union apart from the repair
  itself.
- Tested tree: harness commit `f33929b` for the pre-repair runs; the
  definitive acceptance ran on the production build of the repair tree
  `3ad57a3`: `npm run build` exit 0, `build-provenance.json` sourceSha
  `3ad57a3c0955ba9c57a5ee556f64ac8e8bf6e8ed`, `clean: true`, version
  `0.1.0`, lockfileSha256
  `db6f9bbcca7ec4232a72af85e9e13762429bb3f1dbce09fd20f120ce1e3ccc33`
  (same lockfile hash as the R-03B/R-03C builds).
- Runtime: production standalone server (`.next/standalone/server.js`) +
  `npm run jobs:worker` as local processes behind local HTTPS proxies,
  in two isolated environments — env A (disposable PostgreSQL database
  `rc1r05c_main`, media dir `scratch/rc1r05c/media`) and env B
  (`rc1r05c_restore`, `scratch/rc1r05c/media-restore`) — PostgreSQL
  **16.15**, **131 migrations** each via `npm run db:migrate`. Profile
  Standard, `RENEGADE_MODULES=all`, local only. Test authentication
  DISABLED (`ENABLE_TEST_ROUTES=false`, `LOCAL_E2E_TEST_MODE=false`).
- Harness: `node tests/rc1-r05c/run-local.mjs` — local-process variant
  of the frozen `tests/rc1-05c/verify.ts` + `portability.ts` (same
  assertion set): journey -> supported export -> fresh target site +
  supported import -> restore integrity/refetch -> web+worker process
  restart AND PostgreSQL cluster restart -> restart re-verification +
  post-restart refetch. Mutations use the frozen run's operator pattern
  (persisted fixture operator sessions); anonymous HTTP proves public
  output. **No passkey ceremony is claimed here** — that is R-01B's
  proof on this same tree line.

## FIRST FAILURE

Four findings, in the order reproduced:

1. **The frozen export blocker does not reproduce.** The 2026-10-18 run
   died in the supported exporter with `QueryError: The following path
   cannot be queried: site` at `src/scripts/portability.ts:72`. On this
   tree `exportPortableSite` (`src/modules/portability/site-export.ts`)
   only applies a site filter to collections that declare the field
   (related-path collections are mapped explicitly; the rest are
   omitted and named in the archive's transfer notes). The export
   completes: 11 records, archive written.
2. **The 6 media site-scope unit failures reproduced — as fixture
   drift, not a product defect.** `rc1-05a-media-lifecycle` x3 and
   `med-01-upload-sessions` x3 all died with `Site scope access
   denied.` The fixtures modelled superseded grant systems: the 05a
   harness seeded the legacy `operator-site-grants` collection (which
   no longer exists anywhere in `src/`) and the med-01 mocks served
   only `team-memberships`. The media permission layer resolves a
   member-linked owner's site scope through canonical
   `member-site-roles` grants — the model the rest of the product uses,
   and a grant-less member-linked owner is deliberately denied (the
   R-03A finding). Fixtures now seed the canonical grant the
   installation flow produces; every assertion is unchanged and all 6
   pass.
3. **The restore defect reproduced — a genuine product defect.** With
   the pre-repair code, the supported import into the fresh env B
   reported `created 1` (only the publication) and failed rows for the
   content, its article family, its revision and **all five media
   assets**. Root causes, proven from the PostgreSQL error
   (`media_assets_owner_id_members_id_fk` first) and the FK map:
   (a) the export never carried owner members — `owner` points at
   `members`, which have no site field and were never reached by the
   site scan; (b) the import wrote source ids verbatim for collections
   the archive does not carry (`originalBlob` -> `media-blobs`,
   revision `createdBy` -> `users`), which can never resolve in the
   target installation; (c) the single deferred retry could strand
   cross-order chains (content precedes media-assets in the portable
   order yet references them via `heroMedia`; the family and revisions
   follow the content; replacement chains sit inside one collection).
4. **Harness-era alignments (not product defects).** The frozen
   bad-format negative expected 400; the current product contract
   deliberately refuses undecodable media with **415** (`inspectMedia`
   failures in `workflow.ts`, both upload and replacement paths) — the
   refusal property is unchanged and the expectation was aligned. The
   fixture owner receives installation's canonical `community-manager`
   member-site-roles grant (the R-03A/R-03B/R-03C precedent). The
   verifier processes could hang on exit after all evidence was
   written (in-process jobs/browser handles on this host); harness
   phases now exit explicitly with their recorded outcome.

## CHANGES

Product (commit `3ad57a3`):

- `src/modules/portability/site-export.ts`: owner members are pulled
  into the archive by reference, exactly as authors already were
  (member records are self-contained and portable by design); the
  transfer note no longer lists `members` as omitted when they were
  pulled.
- `src/scripts/portability.ts`: the import store severs relationship /
  upload values whose target collection is absent from the manifest
  instead of writing unresolvable source ids (covers `originalBlob`,
  revision `createdBy`, and any other non-carried reference).
- `src/modules/portability/workflow.ts`: deferred retries repeat in
  dependency order until a full pass makes no progress (bounded at 8
  passes), so cross-order reference chains resolve; unresolvable rows
  are still reported as failed with their last error.

Tests (commit `f9bd50e`): canonical `member-site-roles` grant fixtures
in `tests/unit/med-01-upload-sessions.test.ts` and
`tests/unit/rc1-05a-media-lifecycle.test.ts`. No assertion changed.

Harness only (`tests/rc1-r05c/`, commits `11eb8c0`, `9ed7416`,
`f33929b`): `run-local.mjs` supervisor (two environments, cluster
restart), `verify-local.ts` (the frozen journey/restart, retargeted),
`portability-local.ts` (frozen driver pattern against the supported
CLI), `verify-restore-local.ts` (restore integrity + anonymous
refetch). No schema changes; no migration delta (fresh databases
applied the full 131 migrations).

## REAL WORKFLOW

Definitive supervisor run exit **0** — all six phases green:
**journey 42/42** (the frozen run's exact count), **export** (11
records), **import** (created 8 / updated 2 / mediaReconciled 5 /
relationshipRepairs 8 / failedRows []), **refetch 11/11**,
**restart 8/8** (the frozen run's exact count) and **refetch-restart
11/11** after a web+worker process restart **and a PostgreSQL cluster
restart** (`pg_ctlcluster 16 main restart`).

- **Journey (env A, 42/42)** — upload PNG through the Media Library API
  -> governance metadata persisted -> actual vendored miniPaint iframe
  opened from the media library -> layer rotated 15 degrees through its
  visible native control -> Save version (bytes change, source bytes
  preserved, rights/consent inherited) -> reopen -> Save As new-asset
  (distinct canonical asset + provenance version row; a permission
  failure mid-save keeps the editor open and the retry succeeds) ->
  cancel flow (Keep editing / Discard edits; persisted copy unchanged)
  -> corrupt-source guard (save disabled, no blank canvas saved) ->
  negatives (below) -> variant jobs: each saved asset queues exactly
  one canonical job; all **20** derivatives of the edited asset ready
  and publicly decodable at their persisted dimensions -> article
  published with the original as hero media -> public original URL
  resolves the **edited** bytes -> anonymous Chromium renders the
  article image at 390px and 1440px. (`journey.json`, `state.json`,
  `network.json`, `editor.png`, `bad-source.png`, `article-390.png`,
  `article-1440.png`, `editor-controls.json`, `browser-trace.zip`)
- **Export/import** — the supported CLI
  (`src/scripts/portability.ts`) wrote the encrypted archive from
  env A (11 records: site, publication, owner member, content, article
  family, revision, five media assets) and restored it into env B's
  fresh target site with `--apply`: every record landed, all five
  media assets reconciled, eight relationship repairs applied (the
  family's deferred revision pointers), zero failed rows.
- **Refetch (env B, 11/11, repeated 11/11 after restart)** — imported
  originals/edits/copy exist under **new ids** with checksums equal to
  the source records; the edited bytes in env B storage are
  byte-identical to env A's edited bytes (sha256 compared); the
  replacement reference points at the imported edited asset (remapped,
  not the source id); all three assets are scoped to the target site;
  the imported article is published with its hero reference remapped
  to the imported original; anonymous fetch of the article renders
  with the edited photograph context and anonymous `/media/<original>`
  returns exactly the edited bytes. (`restore.json`,
  `restore-restart.json`, `restore-target.json`)

## TESTS

- Supervisor acceptance: **42 journey + 8 restart + 11 refetch + 11
  post-restart refetch checks, 0 failed**, six phases exit 0.
- Media unit family (the frozen 05C 9-file set + `med-01`): **69
  passed / 0 failed**, exit 0 — including the 6 repaired site-scope
  tests.
- Portability unit files (`portability-contracts`,
  `portability-workflow`, `rc1-03d-portability`): **19 passed / 0
  failed**, exit 0.
- Full unit suite (`npm test`, final tree): **2059 passed / 5 failed
  (2064)** — the standing baseline was 2053 passed / 11 failed; the
  delta is exactly the 6 repaired media site-scope failures, now
  passing. The remaining 5 are the identical named pre-existing set:
  flow-04-acceptance x1, payload-domains x1,
  rc1-04d-campaign-commerce x1, shop-08-command-center-boundaries x2
  (untouched, not implicated by this evidence).
- Production build: `npm run build` exit **0** (provenance above).
- Final-tree typecheck: `npx tsc --noEmit` exit **0** (also exit 0 on
  the candidate, with the harness, and after the product fix).
- Scoped ESLint on the three product files plus the harness and the
  two repaired unit files: exit **0**.

## NEGATIVES + RESTART

- Denied/negative cases executed (journey): anonymous replacement
  (403), foreign-site staff replacement (403), forged site id (403),
  undecodable bytes (415, see First failure #4), stale editor save
  (409), concurrent replacement (exactly one 201 + one 409), denied
  saves create no assets (count unchanged), editor cancellation leaves
  the persisted copy byte-identical, corrupt source bytes cannot save
  a blank canvas, permission-failure save keeps the editor open and
  the authenticated retry succeeds.
- Restart: web + worker **process** restart **and PostgreSQL cluster**
  restart executed between phases; all three asset identities, disk
  hashes, anonymous article output and replacement delivery
  re-verified in env A (8/8), and the complete env B refetch repeated
  green (11/11).

## ENABLED MEDIA STUDIO DISPOSITION

Unchanged from the frozen 05C record; no new journeys were run for
Studio extras in this repair and none of their gates are closed by
this evidence: Books/albums and governed covers (historical 05B
receipts only), Podcasts/audio (historical proof retained;
normalization still unavailable without a byte-producing adapter),
Native video/captions (historical local proof only), Graphics
(preview only; governed generation/save unavailable), AI editor
extensions (generic registry boundary, no provider outcome claimed).
miniPaint itself — the subject of this repair — is fully exercised
above.

## REMAINING BLOCKERS

None for R-05C. Bounded / unexecuted items, named honestly — none of
these is relabeled as passed:

- Mutations were exercised through the frozen run's operator pattern
  (persisted fixture operator sessions plus the real miniPaint browser
  UI); no passkey ceremony is claimed — R-01B proves the genuine
  ceremony on this tree line.
- Production image / Compose proof is unexecuted — Docker cannot run
  on this host (established in 17C). The local-process production
  build in two isolated environments is the strongest proof available
  here.
- Restored assets carry **0 derivative variant rows**: derivative
  variants are not part of the portable archive by design (the export
  transfer note states derivatives must be regenerated) and the
  import enqueues no regeneration. Original-byte public delivery in
  the restored environment is proven; automatic derivative
  regeneration after import is a product gap to disposition in a
  later pass, not part of the frozen 05C exit criteria (which the
  frozen run itself scoped to edited images surviving with correct
  references).
- No browser **video** file was produced; browser evidence is the
  trace zip + screenshots + network log, as listed.
- Run history: run 1 stopped at the frozen 400 expectation (13 checks
  green before it); run 2 completed the journey 42/42 but its
  verifier hung on exit and the run was salvaged into scratch; run 3
  reproduced the restore defect (import failed rows) that the product
  fix then closed; run 4 is the definitive run reported here.
  Intermediate artifacts are retained under `scratch/rc1r05c/`.

## NEXT

R-05C is complete. Do not start another repair automatically; R-03D is
next only on the parent's instruction (see NEXT.md).
