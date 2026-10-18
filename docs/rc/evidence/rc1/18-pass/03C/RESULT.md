# RC1 03C — NOT READY on current checkout

2026-10-18 (America/Chicago). Only 03C executed by this agent. No commit, push, tag, deployment or existing-environment publication. Current gate failure: `npm.cmd run typecheck` exits **2**, with **7 diagnostics**, all in concurrently added `tests/rc1-03d/verify-import-and-build.ts`; first diagnostic is line 31, TS2345 (Sites create input). These files belong to separate concurrent work and were preserved. No 03D runner was executed here.

## Source identity and isolation

- HEAD: `bb3c0347d6c648e71f0bf7eac646df70fd1b5714`.
- Final source: [tested-tree.json](tested-tree.json), 128 changed/untracked source/config/test paths over HEAD; overlay SHA-256 `d52fe00f783908e9a79c075dd0b3f1fb44e57383df7c828ccb400300ab74f0e3`. Evidence and the cumulative ledger are excluded from source hashing.
- Runtime receipt: [runtime-tree.json](runtime-tree.json), 130 paths, overlay `05c76085ed32c8bc636eb5aaaf26a7b3592d7a8c28725fd5cb7f5d4c15d4292f`. [containment.json](containment.json) proves all **21 scoped implementation/type/migration/test paths identical** in final source. Differences: Next's automatic next-env/tsconfig edits were restored to their initially clean versions; the disposable runner's future Docker bind was tightened to loopback; a concurrent 03D runner and its test changed outside this task. Prior 03A/03B receipts remain historical and untouched.
- New disposable PostgreSQL 17.6 container `rc103c-20261018`, loopback `127.0.0.1:5436`, DB `rc103c_release_acceptance`. Inspected the fresh migration script's DROP SCHEMA default before running it; only this new DB was targeted. It is stopped and preserved.
- Media: `scratch/rc103c-20261018/media`; isolated Next dist `.next-rc103c`; web `127.0.0.1:38906`. Own web process stopped. Other processes, databases, media and edits preserved.
- Flags: `LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`, `SEED_ON_INIT=false`, modules `all`. No remote providers or external delivery. No production image built or claimed: these are current-source development-server HTTP/browser receipts.

## Implementation and changed paths

The complete scoped list and hashes are in `containment.json` (21 paths), plus `tests/rc1-03c/run-isolated.ps1` and `tests/rc1-03c/manifest.mjs`.

- `src/collections/Publishing.ts`, `src/migrations/20261018_050000_rc1_content_visibility.ts`, migration registry and generated `src/payload-types.ts`: add persisted native Content visibility with a Publish-tab control, canonical visibility options, public default and required validation. Previously Content silently discarded `visibility: members`, allowing public leakage. Additive migration preserves existing content and refuses rollback that would discard nonpublic privacy policy. Native hooks now reconcile persisted publication navigation within the content transaction.
- `src/modules/public/content-archives.tsx`, canonical catch-all: real author/tag archives and article links, scoped by host site and filtered through canonical discovery visibility. Empty/nonpublic-only archives return 404; archive metadata has canonical URLs. Existing category hierarchy/archive rendering is reused. `semantic-url.ts` reserves author/tag namespaces against content URL collisions.
- `content-navigation.ts`: rename menu references while retaining query/fragment suffixes; remove unavailable targets and retain valid children. Existing redirects remain the canonical old-URL mechanism.
- `TrashContentAction.tsx` and `PublishingCenter.tsx`: Posts/Pages offer a confirmed Move to trash action through canonical Payload REST PATCH (`status=archived`, `retentionMode=tombstone`, `removeFromDiscovery=true`). Immutable history remains intact. Hard deletion still protects referenced history/child pages; an unreferenced draft can be permanently deleted.
- Homepage and article archive: host-site selection, anonymous visibility filtering and unknown-host handling. Existing selected-page rendering is reused.
- Search, RSS/JSON/scoped feeds and sitemap routes: host-bound site selection; reject foreign search-site substitution and unknown hosts. Feed canonical origins follow the selected site, and feed cache headers require revalidation rather than serving stale publication state.
- Two focused unit suites and a reusable isolated native-API/HTTP/Chromium/restart runner were added.

## Executed operator → persistence → anonymous output

[Journey trace](journey.json), [journey log](journey.log), [restart trace](restart.json), [restart log](restart.log), [browser screenshot](author-archive.png).

Fixture setup creates two sites/publications and actual persisted owner, foreign staff and member identities. Supported Payload Local API mutations use `createLocalReq`, the persisted owner and **overrideAccess:false**. This is operator API acceptance; no login/passkey ceremony or authenticated admin-browser acceptance is claimed.

1. Create draft article/page with Lexical bodies, author, category and tag; publish through the native collection API. Refetch persisted content status and verify the companion's actual immutable published-revision pointer. Anonymous HTTP returns 200 with article/page body.
2. Author, tag and category archives contain the published title; drafts, members-only and trashed content do not appear. Their direct public routes return 404. Homepage, article archive, RSS, JSON and search exclude all three hidden titles.
3. Deny anonymous, member and foreign-site staff updates; compare full persisted content before/after and prove unchanged.
4. Change article slug; refetch canonical path; old URL returns 308 with exact new Location; new URL returns 200 with body. Stored publication menu and tag archive use the new URL.
5. Anonymous Chromium opens the renamed article and follows its actual author-archive link. Inspect every downloaded public script (**16**) and both article/catch-all client-reference manifests: no `@puckeditor`, `BuilderShell.tsx` or `VisualEditor.tsx`. URLs retained in `public-script-urls.json`. This is the exercised development graph, not production-bundle certification.
6. Unpublish article; refetch draft status, remove stored menu link; direct route and now-empty author/tag archives return 404. Trash retains revision history and its removal policy; an unreferenced draft is genuinely deleted and absent on refetch/HTTP. Duplicate canonical-path edit is rejected and original page path remains unchanged.
7. Rename page; old URL 308, new URL 200. Persist Site Settings homepage selection; anonymous `/` renders the selected page body. Beta's host does not render Alpha's selected-page body. Private/trashed scoped feeds return 404; page scoped feed returns 200; sitemap excludes private slug. Foreign feed does not contain Alpha article; unknown feed host and foreign search-site override return 404.
8. Stop/restart the actual Next process and restart PostgreSQL. New verification process refetches persisted draft, members visibility and tombstone policy; observes published renamed page/homepage 200, old URLs 308, hidden routes/empty archives 404 and article absent from feed/search.

## Commands, exits and counts

Run from repository root. No default Playwright configuration or default environment DB was used.

| Exact command | Exit | Result |
| --- | --- | --- |
| `docker run -d --name rc103c-20261018 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=rc103c_release_acceptance -p 127.0.0.1:5436:5432 postgres:17.6` | 0 | New isolated disposable DB |
| `powershell.exe -ExecutionPolicy Bypass -File tests/rc1-03c/run-isolated.ps1 migrate` | 0 | **120** fresh migrations; verifier reruns migration application and asserts exactly-once count/schema |
| `npm.cmd run generate:types` with `RENEGADE_MODULES=all`, `RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT=true` | 0 | Generated types updated |
| `powershell.exe -ExecutionPolicy Bypass -File tests/rc1-03c/run-isolated.ps1 verify` | 0 | **100 assertions passed**, 0 failed, 0 skipped |
| `powershell.exe -ExecutionPolicy Bypass -File tests/rc1-03c/run-isolated.ps1 restart-check` | 0 | Actual `docker restart`, then **19 assertions passed**, 0 failed, 0 skipped; separate web restart logged |
| `npx.cmd vitest run tests/unit/content-archives.test.tsx tests/unit/content-publication-references.test.ts tests/unit/article-route-hierarchy.test.ts tests/unit/discovery-contracts.test.ts tests/unit/public-navigation.test.ts tests/unit/public-contracts.test.ts tests/unit/semantic-url.test.ts tests/unit/content-hierarchy.test.tsx` | 0 | **45 tests**, 8 suites, 0 failed, 0 skipped |
| `npm.cmd run typecheck` | **2** | **7 diagnostics** in concurrent 03D test; current gate failed |
| `node tests/rc1-03c/manifest.mjs` | 0 | Final dirty-tree manifest |
| `docker stop rc103c-20261018` | 0 | Own disposable DB stopped/preserved |

Exact focused lint invocation, exit **0**, **0 warnings/errors**:

```powershell
npx.cmd eslint src/modules/public/content-archives.tsx src/modules/public/content-navigation.ts src/modules/public/semantic-url.ts src/modules/admin/TrashContentAction.tsx src/modules/admin/PublishingCenter.tsx src/collections/Publishing.ts src/migrations/20261018_050000_rc1_content_visibility.ts src/migrations/index.ts 'src/app/(frontend)/[...path]/page.tsx' 'src/app/(frontend)/page.tsx' 'src/app/(frontend)/articles/page.tsx' 'src/app/(frontend)/feed.xml/route.ts' 'src/app/(frontend)/feed.json/route.ts' 'src/app/(frontend)/feeds/[scope]/[slug]/route.ts' 'src/app/(frontend)/sitemap.xml/route.ts' 'src/app/(frontend)/sitemaps/[page]/route.ts' 'src/app/(frontend)/search/page.tsx' tests/unit/content-archives.test.tsx tests/unit/content-publication-references.test.ts tests/rc1-03c/verify-publication.ts --max-warnings=0
```

Accepted assertions/tests total **164 passed / 0 failed / 0 skipped**; separate full-type gate **failed (7 diagnostics)**. The initial privacy-leak reproduction is retained in `initial-failure.log`; the repaired final journey passes. `concurrent-types-failure.log` is an earlier temporary parser failure in concurrent legacy-migration edits and is superseded by current `types.log`, not reclassified as passing proof.

Unexecuted: full authenticated admin-browser click of the new Trash control, production build/image/browser bundle verification, full repository unit/integration/release gates, provider work and subsequent subpass execution. Native access-checked operator mutations and anonymous browser output were executed; no required local privacy negative was waived.

## First blocker and exit

**NOT READY**: current full typecheck is red in concurrent 03D work, first `tests/rc1-03d/verify-import-and-build.ts:31` (TS2345), seven diagnostics total. Do not promote the otherwise passing scoped runtime evidence to a checkout-wide PASS. Preserve these receipts; obtain a stable source and rerun typecheck plus relevant containment/checks after those independent changes settle. Stop here; no next subpass execution.
