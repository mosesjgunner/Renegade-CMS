# RC1 06C — PASS within search and redirect scope

Date: 2026-10-18 America/Chicago. Aggregate RC1 remains NOT READY.

## Source and isolation

Base `bbc181a193ff1dccaecfd57c4c754d73fb3e6790` plus the exact **39-path** overlay `53bb6305555870869bab1b72167595aec7aa4792b7dad90fbee048eb873741c7` in [tested-tree.json](tested-tree.json). [containment.json](containment.json) checks every path with zero mismatches. Unchanged executable paths come from the base commit. No commit, reset, clean, push, tag, publication or deployment.

Next.js 16.3.8 development source runtime, `http://localhost:38982`, output `.next-rc106c`; no production application image/build claim. PostgreSQL `postgres:17.6`, image `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`, container `rc106c-20261018`, loopback port 5448, database `rc106c_release_acceptance`. Media: `scratch/rc106c-20261018/media`. Test authentication/routes false; email development. No external provider operation.

Only this named disposable database was reset by the inspected migration verifier. Existing databases, media, secrets, unrelated edits and historical receipts were preserved. After shutdown, only generated 06C type references were removed and initially clean next-env content restored; generated references are excluded from the executable overlay.

[06B-containment.json](06B-containment.json) checks 24/26 previous overlay paths unchanged: Publishing.ts and discovery.ts changed here. Their affected unit cases were rerun. Previous whole-runtime evidence stays at its original source, not relabelled current. The last subsequent application change after the main journey was the independent reconciliation button readiness guard; all four controls checks re-prove it. Final lint/types/units and restart proof follow final application edits. Later verifier edits add stronger 404/restart observations without changing the main journey assertions. No single frozen production-image run is implied.

## Actual changes

Ten application paths changed; all paths/hashes, including inherited dirty source, are in the manifest:

- `src/modules/public/search-projection.ts`: projection writes/deletes share the canonical transaction. Rebuild traverses all pages of registered collections, includes books, propagates source-read failures without first clearing a working index, and sweeps obsolete rows after traversal. Queries require the exact tenant ID, retain PostgreSQL weighted ranking, and validate current canonical discovery policy before pagination. Global noindex/access changes suppress stale projections. End dates include the whole selected day.
- `src/app/(frontend)/search/page.tsx`: strict page/date/repeated-parameter validation and out-of-range 404s; existing query/filter/result UI reused.
- `src/modules/public/redirect-manager.ts` and `src/collections/Publishing.ts`: shared native/manager/import validation for chain directions, loops and unsafe paths; native rejection returns 400. Transaction-bound site locking serializes reverse writes. Repeat editorial renames rewire earlier aliases before creating the new direct redirect, within the canonical transaction.
- `src/proxy.ts`: site-scoped redirect resolution before rendering preserves exact 301/302/307/308 and query policy. API/admin/assets retain routing; authenticated mutation origin protection remains. Legacy resolution errors return a non-indexable safe 404.
- `src/modules/public/discovery.ts`: validate the final substituted redirect path.
- `src/app/(frontend)/api/admin/indexing/search/reconcile/route.ts`: authenticated, authorized-site POST, scoped health, retryable safe 503; GET becomes 405.
- `src/modules/admin/IndexingCenter.tsx` and new `SearchReconcile.tsx`: real POST button/completion/error state, selected authorized site's documents/events/counts/health, client-readiness guard.
- `src/modules/admin/RedirectManager.tsx`: fields/selects/submit disabled through initial client loading, preventing a pre-hydration native GET submission.

No new schema migration/types were necessary. Retained 06B migration/types remain in the overlay. Added four files under `tests/rc1-06c/` and `tests/unit/rc1-06c-search-redirects.test.ts`.

## Operator/UI → persisted state → observed output

[journey-final.log](journey-final.log), [journey-trace.json](journey-trace.json): **42 passed / 0 failed / 0 skipped**. The trace records raw methods, statuses, Location and content-type headers, bytes and assertions.

Fixture bootstrap creates two tenants and canonical owner/staff grants. `createPasskeySession` supplies database-backed fixture operator sessions with test-auth off. This proves supported operator/API and authenticated forms, **not an ordinary WebAuthn ceremony**. Scoped editorial mutations use native authenticated HTTP; an explicit rollback check additionally uses a real Payload transaction. No workflow status SQL manipulation.

Anonymous Chromium submits Search, sees four public matches, follows a result to its published body, and submits the type filter to a real empty result. Weighted title matches precede a body-only hit. HTTP also proves body search, negative author/topic filters, inclusive end date, invalid dates/pages/repeated parameters, unknown-host and foreign-site parameter rejection, and Beta isolation.

Draft/private/members/noindex/entitlement/foreign samples do not enter Alpha results. Raw draft/protected/missing routes return 404 without private body markers. The controls journey separately waits for the protected page's **visible heading** and real 404: [protected-page-visible.png](protected-page-visible.png). The earlier immediate protected-page screenshot was captured before visible rendering and is not visual acceptance.

An `updated` draft edit stays unsearchable until republish. Republish exposes its body; two slug changes repair result links and keep the earliest alias direct. Unpublish and supported trash remove matches and projection rows. Revision-history hard deletion correctly returns 400; trash is the supported deletion-suppression path. History-backed draft hard deletion is also refused.

The real `/admin/redirects` form creates `/old-06c → /articles/retained` with 308; a fresh PostgreSQL collection read confirms target/code. A reverse rule displays `Circular redirect detected.` and returns 400: [redirect-loop.png](redirect-loop.png). Anonymous HTTP observes **308**, `Location: http://localhost:38982/articles/retained?ref=raw`; Chromium follows it to the published body. Beta does not inherit the rule. Separate rules prove exact 301/302/307/308 and query removal.

Both chain directions, external/traversal destinations, native-collection chain bypass, anonymous writes and foreign object-ID mutation are denied without changing the original target. Concurrent reverse POSTs produce exactly one 201 and one 400, with one persisted row. Real transaction rollback preserves both canonical publication and projection. API rebuild preserves eligible results/removal; global noindex suppresses existing projections immediately.

[controls.log](controls.log), [controls-trace.json](controls-trace.json): **4 passed**. The real Indexing Center button performs POST, displays `Search rebuilt: 11 records processed.`, excludes Beta health, and retains the public projection. [indexing-controls.png](indexing-controls.png). Search/filter, redirect error, visible protected 404, reconciliation completion and restarted search screenshots were visually inspected.

## Exact commands and counts

Working directory: this checkout. **W** is the exact prefix:

`powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-06c/run-isolated.ps1`

| Command | Exit | Result |
| --- | ---: | --- |
| `W start-db` | 0 | Only named disposable PostgreSQL; ready on 5448 |
| `W migrate` | 0 | 123 fresh migrations; schema/runtime and migration repeat guards pass; [log](migrations-final.log) |
| `W unit` | 0 | 6 files, **52 passed**, 0 failed/skipped; 12 new cases include >1000-record rebuild and read-failure preservation |
| `W lint` | 0 | Focused application/verifier lint, zero warnings |
| `W types` | 0 | All application source plus scoped verifier/unit types, zero diagnostics |
| `W serve` | running until deliberate stop | Actual separate Next source process |
| `W verify` | 0 | **42 passed**, 0 failed/skipped |
| `W controls` | 0 | **4 passed**, 0 failed/skipped after readiness repair |
| Owned web stop; `docker restart rc106c-20261018`; `W start-db`; `W serve` | 0/readiness | Actual web/PostgreSQL restart |
| `W verify-restart` | 0 | **7 passed**, 0 failed/skipped; [log](restart.log), [HTTP trace](restart-trace.json) |
| `node tests/rc1-06c/manifest.mjs --check` | 0 | 39 paths, zero mismatches |
| `git diff --check` | 0 | No whitespace errors |
| `npm.cmd run typecheck` | **2** | **7 existing 03D diagnostics**, first `tests/rc1-03d/verify-import-and-build.ts:31`; [log](full-types.log) |

Accepted scoped total: **52 + 42 + 4 + 7 = 105 passed, 0 failed, 0 skipped**. Repeated runs are not double-counted. Full typecheck is a separate unresolved failure. No required scoped acceptance check is unexecuted.

Six broader gate groups unexecuted: production build/application image; whole-repository integration/browser/security suite; ordinary WebAuthn; backup/restore; corpus-scale performance; autonomous worker/database-outage recovery. Search projection/rebuild are synchronous and do not require a worker. No aggregate readiness claim.

## Restart, diagnostic attempts and handoff

Web launcher **9452 → 10152**: [before](web-before-restart.json), [after](web-after-restart.json). PostgreSQL start changed from `2026-10-19T01:03:01.246193504Z` to `2026-10-19T01:19:51.696459578Z`: [image/restart receipt](database-restart.txt). Fresh SQL-backed reads plus anonymous HTTP/browser agree after restart: public match retained, trash projection absent, draft state persisted, republished-then-unpublished body absent, private/trash routes 404, redirect target/query/code retained. [restart-search.png](restart-search.png) shows two remaining public matches. [state.json](state.json) binds IDs; [projection.json](projection.json) retains public rows.

Preserved diagnostics, excluded from accepted totals:

- `journey-attempt1.log`: 14 passed then one verifier failure; body saved while status remained published legitimately republishes. Corrected to `updated` workflow.
- `journey-attempt2.log`: 18 passed then one expected-code mismatch; protected deletion returns 400 rather than 403. Denial assertion retained.
- `journey-attempt3.log`: 28 passed then cold admin navigation timeout; actual 200 at 30.2 seconds. Navigation allows cold compilation.
- `journey-attempt4.log`: 28 passed then missing POST; pre-hydration form performed native GET. Product readiness guard repaired, journey rerun.
- `controls-attempt1.log`: one passed then missing completion; pre-hydration button ignored click. Readiness repaired, complete four-check controls rerun. `failure-0.png` retains the diagnostic.
- `restart-initial.log`: six passed, superseded by seven checks adding explicit unpublished-body and raw private/trash probes; not counted twice.

Owned web/browser and disposable PostgreSQL are stopped; database/media retained. Resume `W start-db`, then `W serve`; **migrate resets the schema and must not resume retained state**.

First checkout-wide blocker: seven 03D type errors. Prior 05C portability/current-tree issues and 06B live-DB worker outage remain open at their original boundaries. No next subpass executed.
