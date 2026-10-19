# RC1 05C — miniPaint and media acceptance

**05C: NOT READY. RC1: NOT READY.** 2026-10-18, America/Chicago.

Handoff refresh: another concurrent run has advanced checkout HEAD to `bbc181a193ff1dccaecfd57c4c754d73fb3e6790` (`feat(discovery): execute RC1 subpass 06A metadata, schema and indexing controls`) and committed shared files while this receipt was being finalized. That newer checkout is not accepted by this 05C evidence. This run made no commits and executed no later subpass; all tested source identities below retain their historical base/window.

The editor, copy, variant generation and public-version delivery received actual implementation repairs and runtime proof. The mandatory export/restore chain remains blocked: the supported exporter throws `QueryError: The following path cannot be queried: site` at `src/scripts/portability.ts:72`. It applies the same site filter to portable collections including global `members`/`profiles`, which do not have that field. No archive was produced. Import and restored-reference checks were not executed. Do not remove identity collections or export all global identities to conceal this tenant-boundary defect.

## Source and containment

Base commit: `bb3c0347d6c648e71f0bf7eac646df70fd1b5714`. No commit/tag/push/publication/deployment.

- The 42-check browser/operator journey began at overlay `ebb461435fad2f011ea66c4d3bed8724b54d0181fb4df5f357b78cdf8e658412`, recorded in `journey-start-tree.json`. Concurrent 05A edits changed both media API routes, its verification script and root tsconfig during the broader execution window. `source-containment.json` records that failed containment. These 42 observed passes and eight restart observations **do not close current-tree acceptance**.
- The final 66-unit/10-operator-check window began at overlay `094801e91870d9f0ebe0654b7068f71936e7bcb0403715052ce6f0ec9464890a`. Final snapshot `d111a6cdf603341c7d288a4de69e6b49ae076cfffc7e9f48018a3caaee3a5989` contains 253 changed/untracked source/config/test paths: `tested-tree.json`.
- All 15 owned implementation/test paths are unchanged throughout that final window: `scoped-containment.json`. The full-window comparison additionally finds a concurrent `src/modules/media/upload-sessions.ts` change: `final-check-containment.json`. Its filesystem modification time was 19:29:26 UTC, after the final unit run (19:28:44 UTC, 4.47 seconds) and operator assertions. The final checkout is not a frozen accepted candidate; affected tests and the complete browser gate require rerun after stabilization.
- `predecessor-containment.json` retains exact hashes for 21 of 05B's 24 scoped paths. Workflow, root tsconfig and next-env differ; this subpass also changes the variant dependency. Historical 05B evidence is preserved, not promoted to a current-checkout PASS.

Read root AGENTS.md, installed Next.js Route Handlers guidance, RC1 scope/matrix, cumulative ledger and 05B RESULT/NEXT. Preexisting/concurrent changes were preserved.

## Implementation

- `src/modules/media/image-editor/ImageEditorModal.tsx`: route Save As through canonical replacement in `new-asset` mode, retaining source rights/privacy/consent and a version relationship. Disable both save controls and guard the save handler unless source loading succeeded; a decode error cannot save an empty canvas.
- `src/modules/media/image-editor/contracts.ts`: enforce the explicit supported image MIME allowlist instead of accepting arbitrary `image/*` types.
- `src/modules/media/workflow.ts`: authorize replacement before reading the protected source; remove the second variant enqueue because canonical upload already owns it. Authorize public version URLs through bounded, same-site, live public ancestors while retaining private/expired/foreign/orphan/cycle denials. Existing usage, hierarchy, governance and lifecycle edits in this shared file remain intact.
- `src/modules/media/variants.ts`: reuse the committed site/checksum blob winner when concurrent copies generate identical bytes. Surface incomplete generation to the durable job instead of silently completing it. Missing outputs cannot mark an asset ready; valid previous outputs remain available while retry is pending.
- `src/app/(frontend)/api/media/[id]/route.ts`: reconcile a concurrent response-envelope defect with the service's actual return value. Return the canonical replacement plus its persisted same-site version, preserving concurrent error-status handling.
- Focused regressions: `tests/unit/rc1-05c-editor.test.ts`, `rc1-05c-variants.test.ts`, `rc1-05c-public-versions.test.ts`, and two unsupported-MIME assertions in `med-ext-01-minipaint.test.tsx`. Guarded drivers are under `tests/rc1-05c/`.

No schema/type generation was needed: canonical collections already contain the required relationships and metadata. Next added this disposable dist directory to the preexisting generated root configuration.

## Executed operator/UI path and persisted output

`LOCAL_E2E_TEST_MODE=false`, test routes disabled. Canonical fixture operator sessions use the ordinary authentication strategy. This is operator/API and authenticated UI proof, **not a passkey enrollment/login ceremony**.

Upload PNG through HTTP → persist credit/rights/consent → open actual vendored miniPaint iframe from the media library → rotate its layer 15 degrees using its visible native control → Save version → reopen → Save As → return to library. Save As returns a distinct canonical asset and version without rewiring its source. Original and edit are both 1200×800 PNG:

| Identity | Asset ID | Original bytes SHA-256 | Bytes |
| --- | --- | --- | ---: |
| Upload | `1f6d6a75-3c94-4d40-a3c5-7e2976cd84e4` | `12b8dce8e2af64c94488fb24606cebcd2649d169f7bd5153e06c38867b738bc1` | 14,269 |
| Edit | `138a8911-d92e-41ac-a83a-c9d61bfdd6f3` | `14193fce1c6da159410ff278d584e1f68c273d224c3a71bd8b85fbedcab8ddde` | 37,437 |
| Copy | `8f6d41ea-bfc0-4991-99d4-162be0657da7` | same edit hash; canonical physical dedup | 37,437 |

The original storage bytes remain unchanged. Canonical queued Sharp work produces all 20 approved derivatives; each public response decodes at its persisted dimensions. Publish article through `/api/content`; its original media URL resolves to the edit and the actual article image decodes in anonymous Chromium at 390px and 1440px. `state.json` records media rows and article identity; `journey.json` records 42 assertions. Screenshots: `editor.png`, `bad-source.png`, `article-390.png`, `article-1440.png`. `browser-trace.zip` records the editor context. `journey-http.log` preserves public and API network observations; the initial driver's restart invocation replaced its small `network.json`, so that file alone is not the journey network receipt. The driver now writes restart network data separately.

An actual web-process and PostgreSQL-container stop/restart preserves all three asset identities, disk hashes, anonymous article output and replacement delivery: eight assertions in `restart.json`.

After the concurrent response-envelope repair, a separate real PUT → persisted replacement/version → authenticated bytes → real queued worker → 20 canonical variants path passes ten checks. Anonymous orphan-variant delivery and mutation remain denied, with no extra media record created; the original published image remains byte-identical to the saved edit. `response-contract.json`, `response-final.log`, `restart-and-response-http.log` bind this final operator proof to the 15 contained owned paths. This does not substitute for the missing final complete browser replay.

## Negatives, retry and limitations

Exercised: anonymous and foreign-site staff replacement, forged site ID, invalid file bytes, stale editor 409, two simultaneous replacements (one 201/one 409), no extra assets after denied saves, permission-failure UI kept open followed by successful retry, keep-editing/discard cancellation, decode-error save disabled, private/expired/foreign/orphan/cyclic public ancestry, worker dedup race, failed generation and last-known-good preservation. All are real HTTP/UI or focused service assertions, as identified in their receipts.

Earlier exploratory runs reproduce the missing-variant and public-version 404 defects and driver errors (obsolete selector, exact-label lookup, empty article body). `variant-failure.json`, `public-version-failure.json` and their logs are retained; exploratory/changing-source runs are not counted as final acceptance. One exploratory process was stopped when its source changed. Admin server rendering was slow in the populated disposable fixture (approximately 51 seconds per initial render); no performance acceptance is claimed.

## Enabled Media Studio disposition

All modules, including Media Studio, remained enabled. No required module was removed.

| Extra | 05C disposition |
| --- | --- |
| Books, albums and governed covers | No new complete journey in 05C. Historical 05B book-cover output is bounded to that receipt; album acceptance is not inferred. |
| Podcasts/audio | No new podcast journey in 05C. Historical WAV/enclosure proof is retained. Normalization remains explicitly unavailable without a byte-producing adapter; PCM measurements are estimates. |
| Native video/captions | No heavy-job rerun in 05C. Historical local FFmpeg/HLS/poster/caption proof is retained only for its recorded source. No new provider/production outcome claim. |
| Graphics | Current shipping screen explicitly states preview only; governed generation/save are unavailable. No generated/saved graphic is claimed. |
| AI editor extensions | Generic registry boundary, no manufactured provider action or outcome. |

These dispositions do not waive required enabled-module/local acceptance or close their current-checkout gates. No external provider was used.

## Commands, exits and counts

Commands ran from the current checkout. The guarded wrapper hardcodes only the disposable database/media paths. The fresh migration script's DROP SCHEMA default was inspected before running it against newly created isolated databases.

| Command | Exit | Observed counts / boundary |
| --- | ---: | --- |
| `powershell -ExecutionPolicy Bypass -File tests/rc1-05c/run-isolated.ps1 start-db` | 0 | Own PostgreSQL container created |
| Same wrapper `migrate` | 0 | 120 fresh migrations, idempotent second migration pass |
| Same wrapper `restore-migrate` | 0 | Separate newly created restore DB, 120 migrations; no import |
| Same wrapper `verify` (`journey-complete.log`) | 0 | 42 passed / 0 failed / 0 skipped; source drift prevents current-tree acceptance |
| Own server stop; `docker restart rc105c-20261018`; wrapper `serve`, `restart-check` | 0 | 8 passed / 0 failed / 0 skipped; historical window as above |
| Same wrapper `response` (`response-final.log`) | 0 | 10 passed / 0 failed / 0 skipped; 15 owned paths contained |
| Same wrapper `export` (`export-final.log`) | 1 | 0 successful exports / 1 reproducible failure / 0 skips |
| Focused Vitest command below | 0 | 9 files, 66 passed / 0 failed / 0 skipped, recorded start overlay |
| `npx.cmd tsc --noEmit -p tests/rc1-05c/tsconfig.json` | 0 | Current all-src + 05C harness/regression scope, zero diagnostics |
| Focused ESLint below | 0 | Zero errors/warnings; `quality-exits.json` |
| Focused owned-file Prettier check | 0 | `format-owned.log` |
| Earlier `npm.cmd run typecheck` | 1 | Seven independent 03D diagnostics, first `tests/rc1-03d/verify-import-and-build.ts:31`; not a full-tree rerun after concurrent edits |

The earlier broader formatting check also reports inherited formatting in shared `workflow.ts`; `format.log` / `format-attribution.json` preserve that observation. No unrelated wholesale formatting was performed. Successful standalone drivers finished after owned server/DB shutdown; assertions and artifacts were written before shutdown.

```powershell
npx.cmd vitest run tests/unit/rc1-05c-public-versions.test.ts tests/unit/rc1-05c-variants.test.ts tests/unit/med-03-variant-engine.test.ts tests/unit/med-ext-01-minipaint.test.tsx tests/unit/med-00-media-contract.test.ts tests/unit/rc1-05a-media-lifecycle.test.ts tests/unit/rc1-05c-editor.test.ts tests/unit/rc1-05b-private-media.test.ts tests/unit/phase-a-media.test.ts

npx.cmd eslint 'src/app/(frontend)/api/media/[id]/route.ts' src/modules/media/image-editor/ImageEditorModal.tsx src/modules/media/image-editor/contracts.ts src/modules/media/workflow.ts src/modules/media/variants.ts tests/unit/med-ext-01-minipaint.test.tsx tests/unit/rc1-05c-editor.test.ts tests/unit/rc1-05c-variants.test.ts tests/unit/rc1-05c-public-versions.test.ts tests/rc1-05c/verify.ts tests/rc1-05c/portability.ts tests/rc1-05c/verify-response.ts --max-warnings=0
```

Four required proof groups remain unexecuted/unclosed: successful archive import; restored article/media HTTP reference and byte equality; complete browser replay on stabilized final source; affected unit-family replay after the concurrent upload-session change. Enabled Studio extras have the separate incomplete dispositions above. Production application image/build, real passkey ceremony and remote provider outcomes were not executed or claimed.

Only own `rc105c-20261018`, loopback 5445/38970, `rc105c_release_acceptance`, `rc105c_restore_release_acceptance`, and `scratch/rc105c-20261018/` were used. PostgreSQL image `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`; Node 24.19.0, Next 16.3.8, Sharp 0.35.5; development app runtime, **no production app image accepted**. Own web and DB are stopped; media, both DBs and evidence are retained. No existing environment or secret was overwritten. No next subpass executed.
