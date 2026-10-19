# RC1 06B ? PASS within discovery scope

Date: 2026-10-18 America/Chicago. Aggregate RC1 remains NOT READY.

## Source and isolation

Tested base `bbc181a193ff1dccaecfd57c4c754d73fb3e6790` plus the exact **26-path** overlay `7ed535853d515357784682dfdc7585f2292f8b55f5e7fc3a09e774502ed1f316` in [tested-tree.json](tested-tree.json). Final [containment.json](containment.json) checks every overlay path. Unchanged executable paths come from the base commit. No commit, push, tag, publication or deployment was performed.

Runtime: Next.js 16.3.8 development source on `http://localhost:38981`, isolated output `.next-rc106b`. No production application image/build claim. PostgreSQL `postgres:17.6`, image/digest `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`, container `rc106b-20261018`, loopback port 5447, database `rc106b_release_acceptance`. Configured media path `scratch/rc106b-20261018/media`; existing media was untouched. Only this disposable database was reset by the reviewed fresh-migration verifier. Test authentication and test routes were false; email mode was development. Other environments and the three preexisting documentation edits were preserved.

`next-env.d.ts` and `tsconfig.json` were incidentally changed by Next, excluded from the executable overlay, and restored byte-for-byte to their initially clean HEAD versions after stopping the runtime. The previous 06A receipt is unchanged at its recorded source boundary; this pass does not relabel its full historical browser receipt as current.

## Implementation

Exact changed paths and hashes are in the manifest. Changes cover:

- Canonical article discovery is reused for article cards and author/tag archive projections. Public counts are filtered before pagination. Named navigation, real next/previous links, strict page validation and out-of-range 404s cover articles, author/tag, hierarchy and topic archives; Browse passes its page parameter through.
- Dynamic sitemap XML requires cache revalidation, keeps deterministic validators and rejects malformed partition numbers. Canonical request-time reads reflect publish, unpublish, trash and slug changes without an asynchronous projection dependency.
- Robots uses the request site's canonical origin and denies crawling for unknown hosts, non-live/noindex sites and bootstrap/database failure.
- RSS 2.0 uses the newest public modification for its build date. JSON Feed 1.1 items include required `content_text` and omit absent dates. Scoped RSS has its required channel description and RSS media type; invented image enclosure facts were removed. Subscription links are visible in the article archive.
- `Content.publicModifiedAt` is derived by a canonical collection hook, persisted through registered forward migration `20261018_062000_rc1_public_modified`, and represented in regenerated Payload types. Publication, live metadata and slug changes advance it; draft-only body edits preserve it and cannot supply a forged public timestamp. Legacy rows fall back to existing published revision/content dates; no historical timestamps were invented.
- Events ICS returns 404 when Events is not registered. Core sitemap/feeds work without optional modules; enabling Events exposes ICS. Events acceptance remains in enabled Events scope.

## Operator ? persistence ? observed output

[final-journey.log](final-journey.log) and [journey-trace.json](journey-trace.json): **79 passed / 0 failed / 0 skipped**.

Fixture bootstrap creates two isolated tenants, canonical owner/staff grants and database-backed operator sessions. All scoped content, taxonomy and settings mutations then use native authenticated HTTP REST. No content/workflow status is changed through direct SQL. This proves supported operator API behavior, not an ordinary passkey ceremony or admin-form completion.

Created 13 public articles and draft, members, private, unlisted, noindex, entitlement-restricted and foreign-site samples. Fresh persistence reads prove canonical path, publication status and public modification time. Anonymous public routes, XML parsed with Chromium DOMParser, JSON parsing, sitemap entries, both site feeds and article archives agree. XML includes a literal special-character title, safely escaped. Chromium follows actual pagination from 12 cards to the remaining card and checks tag/category navigation. [archive.png](archive.png) was visually inspected.

An unpublished body edit persists while the previous published body and date remain public. Republishing exposes the new body and advances its date. Live SEO metadata and slug changes advance persisted public dates; the new canonical appears in all projections, the old route returns 308 and its URL disappears from discovery. Unpublication persists draft status and removes access/discovery. History-backed hard delete is denied; supported trash persists archived/tombstone/removal policy and removes the public route and projections. [initial.json](initial.json), [renamed.json](renamed.json), [final.json](final.json) and [state.json](state.json) retain compact output/persistence expectations.

Negatives: native anonymous/foreign-site writes return 403 with persisted title unchanged; unknown-host feeds return 404; Beta sees only Beta content and its own robots sitemap; unknown-host robots denies crawling. Invalid/beyond-end archive pages, missing sitemap partitions and unpublished scoped feeds return 404. Unchanged feed ETag returns 304; unpublication invalidates the prior sitemap ETag. Noindex disables feeds, denies robots and empties the sitemap index; restoring index mode works.

## Accepted commands and results

Working directory is this checkout. `W` below is the exact prefix `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-06b/run-isolated.ps1` (process-only execution policy).

| Command | Exit | Result |
| --- | ---: | --- |
| `W start-db` | 0 | Only named disposable container created; PostgreSQL ready |
| `W generate-types` | 0 | Generated two additions for the persisted Content field |
| `W migrate` | 0 | 123 fresh migrations; second migration invocation proves idempotence; schema/runtime guards pass |
| `W lint` | 0 | Scoped source, migration and verifier lint; zero warnings |
| `W types` | 0 | All application source plus scoped verifier/unit types; zero diagnostics |
| `W unit` | 0 | 5 files, **44 passed**, 0 failed/skipped |
| `node node_modules/vitest/vitest.mjs run tests/unit/content-hierarchy.test.tsx tests/unit/article-route-hierarchy.test.ts tests/unit/disc-00-discovery-contract.test.ts` | 0 | 3 files, **35 passed**, 0 failed/skipped |
| `W serve` and `W worker` | running until deliberate stop | Separate actual web/worker processes; completed worker cycles |
| `W verify` | 0 | **79 passed**, 0 failed/skipped on final overlay |
| Manual owned web/worker stop; `docker restart rc106b-20261018`; readiness; `W serve` and `W worker` | 0/readiness | Actual process/database restarts; identities retained in process receipts |
| `node ./node_modules/tsx/dist/cli.mjs tests/rc1-06b/verify.ts --restart` with the wrapper's identical disposable environment | 0 | **24 passed**, 0 failed/skipped after worker recovery; no assertion changed |
| Owned web stop; `W serve-core`; `W verify-core` | 0 for verifier | Core-only web, **23 passed**, 0 failed/skipped; Events ICS 404 while sitemap/feed/archive remain correct |
| `node tests/rc1-06b/manifest.mjs --check` | 0 | 26 paths contained, zero mismatches |
| `git diff --check` | 0 | No whitespace errors |
| `npm.cmd run typecheck` | **2** | **7 existing 03D diagnostics**, first `tests/rc1-03d/verify-import-and-build.ts:31`; no 06B diagnostic |

Accepted scoped totals: **79 unit + 126 operator/HTTP/browser/restart/core = 205 passed, 0 failed, 0 skipped**. These totals do not erase failed diagnostic runs below. Full build/production-image/whole-repository browser/security/restore gates and ordinary WebAuthn acceptance were unexecuted in this bounded pass; no aggregate readiness claim.

## Restart, errors and limits

[restart-final.log](restart-final.log): **24 passed**. Unpublication, tombstone policy, retained public article, excluded samples, parsed XML/JSON, robots and public modification dates agree after restarts. The worker has a different PID and a fresh heartbeat. [core.log](core.log): **23 passed** with Events disabled. Process receipts and separate web/worker logs bind the restart observations.

**Unresolved operational extension:** `W restart-check` performs an additional PostgreSQL restart while the worker is live. The existing worker exits on PostgreSQL's `terminating connection due to administrator command` / unhandled pool error; that diagnostic run has **23 passed, 1 failed**, exit 1 (fresh heartbeat). See [live-db-outage.log](live-db-outage.log), [live-db-outage-trace.json](live-db-outage-trace.json) and [worker-restart.log](worker-restart.log). Restarting the worker after database readiness restores cycles and the unchanged 24-assertion required restart check passes. Autonomous recovery from a live database outage is **not proved and has a reproducible failure**; it is an operations follow-up, not a successful recovery claim. Discovery projections are request-time reads and were correct through the required web/worker restarts. No general worker recovery repair was added outside 06B.

Other diagnostic runs: the first unknown-host probe used Node fetch, which did not transmit the intended Host; raw HTTP preserved the header and proved denial. A second fixture accidentally carried an Alpha category into Beta content; the product correctly returned 400. Both failed attempts are retained. A preliminary 75-assertion run was completed before the timestamp migration and then terminated for a lingering verifier handle; it is not counted or rebound to the final source. The final verifier explicitly closes resources and exits with its actual verdict.

First checkout-wide blocker: the seven 03D type errors above. Scoped 06B mandatory acceptance is complete. Aggregate RC1 stays NOT READY, including prior open portability/current-tree issues and the newly observed live-database worker outage limitation. No next subpass was executed.
