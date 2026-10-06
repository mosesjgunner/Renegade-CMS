# RC-08C final release closure — FAIL / NOT READY

Recorded 2026-10-06. Package version: `0.1.0`. Tested clean source: `01908f39a3ce40b5eae5d4dec64b981e103d5fb1`, branch `rc08c-closure`. Documentation and receipt commits following this source are not newly accepted executable candidates. No release, tag or push occurred.

This report supersedes earlier current-readiness claims. Historical receipts remain unchanged. Repairs continued through newly discovered failures; the remaining failures and missing prerequisites below prevent closure.

## Executed acceptance

| Gate on the frozen source                           | Result                                                           | Practical limit                                                                                                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm.cmd run verify:release`                        | PASS, exit 0                                                     | Includes clean install, format, lint, typecheck, full unit/integration, fixture migrations, build and guarded persistence smoke. Smoke uses test configuration. |
| Full unit suite                                     | 175 files, 1,140 passed, zero failed/skipped                     | Unit proof only.                                                                                                                                                |
| Full integration suite                              | 46 files, 261 passed, zero failed/skipped                        | Mix of PostgreSQL and contract fixtures; not ordinary operator or real-provider acceptance.                                                                     |
| Fresh migration                                     | 112 registered migrations applied                                | Disposable PostgreSQL 17.6.                                                                                                                                     |
| Upgrade rehearsal                                   | Historical fixture at migration 56 plus 56 subsequent migrations | No authentic customer predecessor artifact was supplied.                                                                                                        |
| Production Next build and presentation bundle check | PASS                                                             | Public bundle excludes Puck/editor; no broad product journey implied.                                                                                           |
| Docker production build                             | PASS, exit 0                                                     | Actual Linux runner boots web and worker; image retains root development dependencies.                                                                          |
| Ordinary browser journeys                           | 4 passed, 2 failed, zero skipped                                 | Settings/core journey and new staff enrollment fail; full role/action matrix remains open.                                                                      |
| Supported operational backup and separate restore   | Both PASS, exit 0, bounded state                                 | Accounts, settings and governed media only; broader business-state restore remains open.                                                                        |

Receipts: [checks](evidence/rc-08c-2026-10-06/checks.json), [release output](evidence/rc-08c-2026-10-06/release.txt), [browser results](evidence/rc-08c-2026-10-06/core-browser-results.json), [repair cards](repairs/RC08C-closure-blockers.md). Captured screenshots, sanitized traces, server/worker logs, harnesses, dependency graph and archive metadata are in the same receipt directory. Private environment files, passkey private material and raw database/media archives remain outside tracked evidence.

## Repairs included in the frozen source

Integration prerequisites now use isolated acceptance databases, genuine subscriber consent and a trusted test HTTPS certificate. The fulfillment component again renders supplied records truthfully; its live workspace still presents an unavailable state. Sharp is pinned to 0.35.5. Build, standalone, worker, Docker and installer provenance now carry the source SHA, with inconsistent explicit build SHA rejected. Moderation resolves the authenticated administrator through the canonical member and site-team grants; owner onboarding creates its site-team membership. Theme preview avoids recursive Payload permission resolution and retains owner-only authorization. Production POD encryption requires an explicit key. Docker excludes private scratch evidence and receives configured encryption keys.

The ordinary theme draft and activation endpoints both returned 200 in 323 ms on this source. This is bounded runtime proof of the theme repair, not completion of the failed core browser journey.

## Remaining release blockers

The first real browser failure occurs after Site Settings saves successfully: reloading the native editor produces a blank page. The server throws `Cannot read properties of undefined (reading 'id')` in Payload's lock-owner extraction. Later authenticated reads resolve the lock owner correctly, so a permanently orphaned database row is not established. Locking must remain enabled while the transient projection failure is repaired and the same journey rerun.

A new staff account is created through ordinary owner REST with 201, but its first passkey enrollment returns 401 and login options return 400 because no credential exists. Additional credential registration works for an already authenticated owner. A supported invitation/first-credential path and canonical staff member/site grants are required before the role matrix can run honestly.

Source review also found global-role checks followed by unscoped reads/object operations in Connections and integrations, and host-site resolution without actor site membership in audience intake. Anonymous denials passed; authenticated cross-site/object denials have not passed. No fabricated staff sessions were used to bypass enrollment.

Ordinary commerce settlement, inventory races, affiliate/donation/subscription effects, signed callbacks, real providers and recovery are unproved. Live fulfillment remains unavailable; backend contract tests do not clear it. Complete Lean/Standard module truthfulness, moderation actions and broad runtime security negative cases remain unproved. Canonical golden stages A–T were not found in the supplied documents or repository; no substitute stage mapping was invented. The existing core-site journey stopped before publication and cannot prove A–T.

Current audit reports 23 affected package entries: 2 critical, 9 high and 12 moderate, representing 10 unique advisory IDs. `npm ls --all` reports an invalid YAML peer graph. Critical tooling dependencies are present in the full production image even when absent from standalone traces. Reachability and compensating-control adjudication remains OPEN; these counts do not establish a publicly exploitable application vulnerability or a clean production dependency gate. See [dependency decisions](evidence/rc-08c-2026-10-06/dependency-decisions.json).

## Backup, restore and recovery boundaries

The supported backup quiesced actual web/worker services and produced native PostgreSQL/media archives with verified checksums. The supported restore used a separate Compose project, fresh volumes and new secrets, verified an empty target, restored and cold-started production web/worker. The source project received a native transfer of the genuinely created browser state; it was not an ordinary fresh Docker installer journey.

Before post-restore authentication, 306 of 309 public-table fingerprints matched exactly. Worker housekeeping changed `payload_jobs`, `payload_jobs_log` and `payload_jobs_stats`; these differences are disclosed. All 21 original/variant asset files matched in size and SHA-256. Operational `.renegade` and temporary `.upload-sessions` files were excluded from the asset comparison. Restored owner WebAuthn login, theme/footer render, readiness and anonymous protected-route denials passed. The unreferenced governed asset remained anonymous 404, and the test-only smoke endpoint remained production 404.

Published editorial/search state, settled commerce, audience/community business records and pending scheduled business work were absent from this backup. Their refetch and recovery gates therefore remain unexecuted. Scheduler housekeeping and a completed media-variant job do not prove failed-only business retries, outbox recovery or deduplication after a crash.

## Provenance and handoff

Next BUILD_ID, standalone manifests and web/worker runtime identify `01908f39a3ce40b5eae5d4dec64b981e103d5fb1`. Lockfile SHA-256: `cccde14064335e68dc69c911725c24c57a5f6117a459fa3e089e43da94da7f7d`. Image config digest: `sha256:f809014fdb80e962559b453dfe2158bf8d57e5d5262b6548b22f33eb12736c08`. The image's manifest records `clean: null` because its Docker context excludes Git metadata; the checked-out build source was independently clean. A forged worker environment SHA did not override the embedded artifact SHA.

Repair the dependency-ordered cards, commit and freeze a new clean source, restart the affected gates, then complete all mandatory operator, security, golden and business-state restore journeys. Do not promote bounded PASS results into release acceptance. Existing developer/customer databases were not reset or modified; acceptance used named disposable PostgreSQL databases and separate Compose projects.
