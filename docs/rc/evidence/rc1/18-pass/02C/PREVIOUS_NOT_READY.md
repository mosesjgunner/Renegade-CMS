# RC1 subpass 02C ? NOT READY

Date: 2026-10-17 (America/Chicago). Only 02C was executed; RC1 remains NOT READY. This supersedes the earlier broad PASS. Its original text is preserved in PRIOR_RESULT.md and PRIOR_NEXT.md; its source hashes and historical claims are not promoted to this tree.

**First blocker:** mandatory ordinary UI CRUD and concurrent editing remain unproved. The browser attempted `http://localhost:38903/login` with test authentication disabled and timed out after 180000 ms. Two subsequent attempts stalled and were terminated. These were earlier working-tree attempts, before the final source fixes; they are diagnostic failures, not current-tree acceptance. No passkey enrollment, admin control click, or UI lock was reached. Current-tree UI acceptance is unexecuted. The in-process operator/API checks below cannot replace this requirement.

## Source and isolation

Base HEAD: `bb3c0347d6c648e71f0bf7eac646df70fd1b5714`, plus the `57` source/fixture entries in [tested-tree.json](tested-tree.json), overlay SHA-256 `7a54efb2d981f42443f3f558b60a69ca6f19eb14b51b4268f9fa8f8c4d8af565`. This is a dirty checkout, not a new commit or image. The manifest includes preexisting edits; they were not reset or committed. Only this subpass's changes are described below.

Created disposable container `rc102c-20261017-review`, label `renegade.disposable=rc102c`, image `postgres:17.6-alpine`, database `rc102c_release_acceptance`, loopback port 5433. Its own schema was recreated for final-source verification; no existing environment was targeted. Explicit media directory: `scratch/rc102c-20261017/media`. `LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`, `SEED_ON_INIT=false`, Standard/all. No provider operation or message was sent. The database container is now stopped and retained for inspection. The web process is stopped. Disposable invitation material remains only in ignored scratch, not evidence. Next's changes to tsconfig, next-env and generated import map were returned to their pre-run content.

## Implementation

- `src/modules/operations/redirect-site.ts` centralizes authorized active-site selection for redirect list/create/import/export. Foreign or malformed site cookies fail closed. Export previously read every site's records; import previously selected the first grant instead of the active site.
- `src/app/(frontend)/api/admin/redirects/{route.ts,import/route.ts,export/route.ts}` use that selection. Imports return actual success/partial/error outcomes and count rejected parse rows as skipped.
- `src/modules/admin/RedirectManager.tsx` displays partial/failed import outcomes and individual errors, retaining failed input instead of clearing it behind a success message.
- `src/modules/public/redirect-manager.ts` removes silent truncation at 500 rules and tracks writes within a batch for subsequent updates/loop checks.
- `src/modules/admin/{PublisherDashboard,PublishingCenter}.tsx` explicitly enforce Payload access on local reads. Passing `req` alone does not disable Payload's local access override. `src/collections/Publishing.ts` scopes native redirect reads to operator grants; public redirect resolution continues through canonical internal services.
- `src/collections/Identity.ts` automatically records site-role grant/change/revoke events in existing `identity-audit-events`, with actor, role-record ID and before/after state, using the operation's request transaction. Audit failures reject the change and roll back persisted role state. No migration/type generation was required.
- New focused unit tests and isolated runners live in `tests/unit/{admin-publishing-scope.test.tsx,redirect-admin-scope.test.ts}` and `tests/rc1-02c/`. The preexisting legacy `verify-02c.ts` now refuses destructive execution outside the exact disposable DB and explicitly disclaims UI acceptance; it was not used as a passing gate.

## Executed operator path and persisted output

[operator.log](operator.log): real redirect route POST/GET/DELETE/export/import handlers authenticated by a fixture session against PostgreSQL. Created two sites' rules, exported Alpha without Beta, imported one valid Beta row plus a rejected self-loop, updated then deleted the Alpha record, and reloaded the actual empty list. SQL verified the imported site's binding. Invalid self-loop returned 400, anonymous export returned 403. The owner session was issued by the session service as a fixture; this is not ordinary passkey evidence.

[controls.log](controls.log): access-checked Payload operator operations granted and changed a site role and generated real audit rows automatically. A staff role change was denied with role/audit unchanged. Injecting an audit-storage exception rolled back an owner role update. An actual content update with `overrideLock:false` was denied while another user held its persisted lock; title remained unchanged. After release, the staff update succeeded and reloaded with its new title. A foreign content update was denied with the entire persisted document unchanged. A real dashboard server render excluded the foreign draft; native redirect reads contained only the operator's site. Role deletion generated a revocation event and immediately denied a further write.

After `docker restart rc102c-20261017-review`, a fresh process reloaded the exact retained redirect. [persistence-after-restart.log](persistence-after-restart.log) records three redirects with site/target, two content titles, three automatic role-audit events, 116 migrations and zero remaining document locks. These are persisted local outcomes, not UI, deployed-image or provider proof.

## Route/control coverage and dispositions

[route-inventory.json](route-inventory.json) inventories 17 custom views, all 207 registered collections (75 navigation-visible, 132 hidden), native access functions, lock settings, list/search/default-column/bulk policy, and three globals (`site-settings`, `network-settings`, `payload-jobs-stats`). This is registration/source coverage, not 227 successful browser journeys. Hidden navigation does not exclude API/security acceptance.

| Routes | Controls and current proof/disposition |
| --- | --- |
| `/admin` | Write post/create page/add media/edit menus; setup links; recent drafts/scheduled/published widgets; public links; redirect attention and capability link. Real access-checked server render proved foreign-draft exclusion. UI widgets/actions unexecuted. |
| `/admin/posts`, `/admin/pages` | Create/edit, title search, status filter, pagination, approved scheduling. Three unit view cases enforce scope; UI save/reload/search/filter/pagination unexecuted. |
| `/admin/redirects` | CRUD, local search, import/export; route and persistence/error proof above. UI loading/empty/success/failure/filter and concurrent edits unexecuted. |
| `/admin/capabilities`, `/admin/security` | Diagnostics/setup-required states, sessions/passkeys/recovery/invitations. Source-inventoried shipping views; ordinary controls unexecuted here. |
| `/admin/history`, `/admin/navigation`, `/admin/media-library`, `/admin/indexing`, `/admin/rendered-quality` | Revision/restore, menu/settings, media, indexing/quality controls. Source-inventoried; UI/worker persistence and error/retry paths unexecuted here. |
| `/admin/workflow`, `/admin/releases` | Queues, bulk/review, comments, comparison, schedule/release actions. Local content lock proof is bounded above. UI concurrency/bulk and process-local review-comment restart behavior remain open; no waiver. |
| `/admin/email-composer`, `/admin/audience`, `/admin/moderation`, `/admin/telemetry` | Composition/delivery, consent/audience, moderation and reporting. Source-inventoried; UI operations unexecuted. External delivery is provider-gated, with mandatory local adapter/error/security acceptance still required. |
| Native collections/globals | Enumerated individually in inventory. Internal audit/token/session/blob/version/payment/delivery evidence collections with denied native mutations are intentionally operator-read-only/service-written; arbitrary native CRUD is not required. Visible allowed CRUD/search/filter/pagination/bulk and global save/locks still need ordinary UI coverage. |

No new deferral is approved. The earlier report's blanket federation deferral is rejected: independent local-peer acceptance remains in shipping scope. External bidirectional calendar synchronization remains excluded by RC1-SCOPE. Provider credentials gate external claims, not mandatory local safety/adapter/retry proof. Current configured provider states were not accepted through this UI run.

## Commands, exits and counts

Common runner prefix: `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-02c/run-isolated.ps1`. This sets explicit disposable DB/media/module/auth variables; it does not use fallback DB/media from `.env`.

| Command | Exit | Passed / failed / skipped / unexecuted |
| --- | ---: | --- |
| runner `migrate` (`npm.cmd run test:migrations:fresh`) | 0 | 116 migrations; 0 failed; second migration invocation confirms no reapplication |
| `npx.cmd vitest run tests/unit/admin-publishing-scope.test.tsx tests/unit/redirect-admin-scope.test.ts tests/unit/disc-05-redirect-manager.test.ts tests/unit/authorization-matrix.test.ts tests/unit/member-identity.test.ts tests/unit/staff-enrollment.test.ts tests/unit/progressive-disclosure.test.ts` | 0 | 7 files, 72 passed / 0 failed / 0 skipped |
| `npm.cmd run typecheck` | 0 | 0 errors |
| focused ESLint over the 10 implementation paths, two focused unit files and `tests/rc1-02c/*.ts`, `--max-warnings=0` | 0 | 0 errors / 0 warnings; exact path list in NEXT |
| runner `operator` | 0 | 4 outcome groups passed / 0 failed / 0 skipped |
| runner `controls` | 0 | 6 outcome groups passed / 0 failed / 0 skipped |
| runner `inventory` | 0 | 17 views / 207 collections / 3 globals enumerated; execution is not inferred |
| runner `restart-check` after named DB restart; read-only SQL snapshot | 0 | retained redirect and persisted role/content/history verified |
| runner `dev`, then runner `browser` on earlier working tree | failed/terminated | [browser.log](browser.log): 0 passed, 1 navigation timeout; 2 later stalled attempts terminated. Current-tree six UI groups unexecuted, no skipped requirement waived. |
| `git diff --check` | 0 | tracked diff whitespace clean |

Logs named after each gate contain raw output. The full unit/integration/build/image/provider matrix was unexecuted in 02C. The previous report's 1335/full-suite and claimed browser success are not current evidence.

## Exit and remaining work

**NOT READY.** First missing mandatory proof is ordinary admin UI CRUD and concurrent edit/save/reload/filter with persisted observations. Reproduce with the isolated runner, resolve the `/login` stall without bypassing authentication, and complete the six browser groups plus route/native/control coverage, denied roles/sites and truthful unavailable states. Workflow review comments still use a process-local store and need canonical durable wiring/restart proof before accepting that visible control. Continue 02C until its mandatory gates are proved. Do not execute 02D automatically.
