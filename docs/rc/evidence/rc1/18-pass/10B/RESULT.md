# RC1 10B — PASS

**2026-10-26: PASS for article comments, forum trees and discussion discovery. Aggregate RC1 remains NOT READY.** All mandatory 10B groups were executed against the final source below. No next subpass was started.

## Exact source and resources

- Base HEAD: `87a9ef6bb35405658ef5dd3fb94f3f95771a799e`; the initial checkout was clean. Changes remain uncommitted.
- [source-tree.json](source-tree.json): 1,434 source/config/test/script files, tree SHA-256 `9063dc9995c57b0e5a05b1363d78c0f4bf72a96f24a89fc4e2e7f5ab97c48d30`. Final containment check passed. [changed-paths.json](changed-paths.json) records all 38 changed source/test paths with individual hashes. Dependency identity is included through package-lock.json. Documentation, framework-generated declarations/dist-specific compiler includes, dependencies, secrets and disposable data are explicitly excluded.
- [environment.json](environment.json): Node 24.19.0, Next 16.3.8, Payload 3.90.2, development Turbopack server, all modules enabled. `LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`. This is source execution; no production application build/image acceptance is claimed.
- Owned PostgreSQL container `rc110b-complete-20261026`, ID `826aa246c801119c1d0fdcb947383b586c9fc989bfe852baaa9b5d8521b4bfa5`, label `rc1.scope=10b-complete`, loopback port 5456. PostgreSQL image ID `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929` (`postgres:17.6`). Primary database `rc110b_complete_release_acceptance`; final fresh-schema target `rc110b_final_release_acceptance`. The earlier fresh target and failed fixtures are retained.
- Web used localhost:39012; the real local SMTP capture sink used 127.0.0.1:3143. Media configuration was `scratch/rc110b-complete/media`; own dist outputs were `.next-rc110b-turbo` and the earlier `.next-rc110b-complete`. Only the guarded new database was schema-reset. The container is stopped, web/SMTP ports are unbound, and data are retained ([cleanup.log](cleanup.log)). Existing environments were preserved.

## Implementation

- Public article SSR and hydrated comment reads now use the canonical `discussions` / `discussion-posts` records written by the public form. Fixed the authenticated form's `memberId` lookup, nested tree ordering, continuation controls, fragment anchors and visible load/retry errors.
- Forum directory renders parent/child spaces. Topic browsing has search, paging and pin ordering. The thread view supplies nested parent IDs, renders multiple levels, supports post editing/deletion and moderator pin/lock/close/post-status controls. Controls wait for hydration.
- Canonical services enforce real public-content policy, authenticated author identity, scoped parent/quote references, the existing 15-minute author edit window, ownership and locked-topic limits. Soft deletion preserves descendants with body-redacted tombstones. Native collection hooks preserve post identity/location and reject foreign forum, article and parent/quote relationships, including hierarchy cycles.
- Public APIs bind requested sites to the configured host and enforce member CSRF. Hardened the versioned routes against caller-supplied author headers/permissions and foreign idempotency ownership. Profile bylines use canonical global-member lookup and the privacy projection; discussion/site authority remains derived from the persisted discussion.
- Topic creation, article comment creation and replies use transactions and PostgreSQL execution locks. Concurrent replies allocate distinct persisted order/permalink values. Added the discussion pin field, generated types, and migrations `20261026_100000_rc1_discussion_pins` / `20261026_101000_rc1_discussion_event_ids`.
- Repaired the realtime writer's explicit generated-sequence insertion and missing UUID default. Registered event-store failures propagate instead of allowing a rolled-back discussion to return false success. Public topic titles enter the existing search projection; hidden/restricted/removed and attached discussion records do not. Post bodies are excluded from that index.

The complete changed paths and hashes are in changed-paths.json; no existing module was removed or assertion weakened.

## Ordinary UI / supported operator proof

[trace.json](trace.json), [state.json](state.json), [browser.log](browser.log), [article.png](article.png), [forum.png](forum.png): **50 named checks passed, 0 failed, 0 skipped; exit 0.** Successful run marker `mvpsabvr`. State records the actual member, article, forum, topic and post identities and the ordered persisted snapshot.

1. Four independent browser contexts enrolled/signed in through the ordinary email form, actual loopback SMTP deliveries and consumed links. An owner fixture session separately exercised supported native APIs to create forum spaces and grant two site-specific moderator roles. Published/draft articles were labelled prerequisite fixtures. There is no ordinary operator passkey or publishing-workflow claim here.
2. Alice posted an article comment through the rendered article route; Bob replied and Alice added a second-level reply. Reload and anonymous server HTML contained the saved tree and anchors. Editing persisted. Another member's edit/delete attempts returned 403 with the original body intact; a draft target returned 404 with no attached discussion created.
3. Alice created a topic through the forum UI and navigated to its saved canonical route. Bob and Alice built and reloaded a multilevel conversation with real author attribution. The moderator UI persisted a pin. Closed/locked replies and locked author edits were denied; the closed UI was observed after reload.
4. Review/restricted/clear/removed post transitions persisted and changed public visibility. Author deletion and moderator removal retained attributed records and descendants while returning tombstone text. Public topic search, full-text search, the public route and persisted index excluded a restricted topic; restoring it restored availability.
5. Supported member APIs created 32 additional replies and 21 topics. Post pages were disjoint and ordered; load-more rendered the second page. Topic navigation showed 20/2 records with the pinned topic first. Article load-more rendered all 35 comments, descendants and tombstones.
6. Exercised missing CSRF, anonymous/header impersonation, foreign site/forum/thread/parent/quote IDs, non-owner mutation, ordinary-member and foreign-site moderator privileges, raw collection bypass, native author replacement, native foreign target/parent relationships and foreign-site staff mutation. A permitted native local post established the positive control for the foreign-parent denial. An explicitly backdated native fixture exercised actual HTTP edit-window expiry.
7. Four simultaneous supported replies received unique persisted order/permalink values. An injected UI HTTP 503 showed failure and created no post; ordinary retry created exactly one post. An injected canonical first-post failure rolled back both the new topic and its search projection. Versioned SQL comment creation, replay and foreign-author idempotency denial were independently exercised through real HTTP.
8. Actually stopped the web process, closed the isolated harness pool, restarted PostgreSQL, and started a new web process. The exact ordered discussion/post snapshot was unchanged. Ordinary authenticated article/forum reloads retained the trees, moderator role/pin and member privilege denial. The adapter's retained probe connection was explicitly released only in the quiescent isolated harness before pool shutdown; this is teardown, not a general failover claim.

## Automated commands and counts

[commands.json](commands.json) contains exact argument arrays, exits and log paths, including the complete scoped ESLint path list.

| Command | Exit | Accepted outcome |
| --- | --- | --- |
| `npm.cmd test -- --maxWorkers=4` | 0 | 247 files, **1,726 passed / 0 failed / 0 skipped** ([unit.log](unit.log)) |
| `npx.cmd eslint <recorded changed TS/TSX paths> --max-warnings=0` | 0 | No errors/warnings; generated payload-types.ts excluded from lint ([lint.log](lint.log)) |
| `npm.cmd run typecheck` | 0 | Repository typecheck clean ([typecheck.log](typecheck.log)) |
| `npx.cmd prettier --check <same scoped source/test paths>` | 0 | Formatting clean ([format.log](format.log)) |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-10b/run.ps1 browser` | 0 | **50 passed / 0 failed / 0 skipped** |
| `npm.cmd run test:migrations:fresh` | 0 | **127 migrations**, repeat-application/idempotency and runtime schema assertions passed in a newly created guarded final database ([migrations.log](migrations.log), [schema.json](schema.json)) |
| `node --import tsx tests/rc1-10b/provenance.ts --check` | 0 | 1,434-file final source containment |
| `git diff --check` | 0 | No whitespace errors |

The final fresh verifier used the exact recorded container ID/label, a newly created `rc110b_final_release_acceptance`, process-only local configuration, all modules, seeding off and the isolated media path. Creation failure would stop the command rather than reset an existing target. Mandatory 10B groups: **7 executed, 0 failed, 0 unexecuted**. Counts above do not include previous attempts or unrelated release gates.

## Retained failures and boundaries

- [partial-attempt/](partial-attempt/) preserves the earlier NOT READY receipt and seven-file source manifest. Its fixture integration had 10 passes and one profile-image projection failure; it is not relabelled current PASS. That old demo helper also generated UUID-scoped media under media/ and the standalone media tree; those artifacts are retained. The completion journey did not use that helper.
- [attempts/](attempts/) retains failed/incomplete compilation/hydration, realtime persistence and byline attempts, plus the successful earlier 48-check source snapshot. Only the final frozen 50-check run is counted here. The earlier full unit attempt had one 15-second digest timeout under concurrent workload; its unchanged isolated rerun passed 4/4, and subsequent complete suites passed 1,726/1,726. No timeout or assertion was relaxed.
- No production build/image, remote-provider delivery, full legacy avatar-integration rerun or aggregate release gate was executed for this 10B acceptance. These are outside the zero mandatory-unexecuted count. Historical 10A/09D and aggregate RC1 limitations retain their original boundaries.

**First remaining 10B blocker: none.** The next assigned subpass may start after this handoff; execution stops here.
