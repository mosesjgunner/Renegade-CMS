# RC1 subpass 03A — NOT READY (current checkout, 2026-10-18)

The requested Site → Section → Category → Subcategory → Collection → Content journey is implemented and passed 137 scoped assertions on the exact 97-file tree below. The checkout changed concurrently before final acceptance, so this receipt does not promote the changed checkout. The latest full typecheck fails on three diagnostics in a concurrently added rich-editor test. No subsequent subpass was executed by this agent; those external edits were preserved.

**First current blocker:** `npm.cmd run typecheck` exits 2 at `tests/unit/rich-editor-draft-preview.test.tsx:313`: `"content"` is not a `DiscoverySourceProvenance`. Lines 314 and 326 add two diagnostics. See [types-current.log](types-current.log). The earlier nine 02D diagnostics in types.log belong to the earlier tested tree; they must not be presented as current failures after those files changed.

## Exact source and runtime

- Base commit: `bb3c0347d6c648e71f0bf7eac646df70fd1b5714`; no commit created.
- Exact exercised 97-file dirty overlay: [tested-tree.json](tested-tree.json), digest `a98f868e55b2729f14d99e94c8dab03b2db7508739b0486b57593872bf5fc66d`. It includes preserved preexisting edits, not just this implementation. Digest input is sorted `sha256 + two spaces + path`, joined with LF, without a trailing LF. Evidence and cumulative ledger are excluded to prevent self-reference.
- Later observed 99-file checkout: [current-tree.json](current-tree.json), digest `fbb30a37c3e399b5c225534fc8b954aa3282404f2b13fc17c4472db2e23d0c2a`. [final-verification.json](final-verification.json) proves all 23 scoped implementation/test paths remain byte-identical, but two 02D tests changed and editorial persistence/new rich-editor test changes appeared. The latter tree is an observation and partial recheck boundary, not a replacement for the fully exercised tree. Concurrent RichText rendering edits also appeared transiently and were removed by the other process; this agent did not modify them.
- [baseline-tree.json](baseline-tree.json) identifies the pre-03A dirty source. [prior-source-containment.json](prior-source-containment.json) records the comparison with 02C (64/71 unchanged) and the later-available previous 02D handoff (80/93 unchanged) at comparison time. The earlier proofs remain bound to their original manifests; neither is current 03A proof. The short 02C NEXT was reconstructed from its retained PASS receipt during handoff reconciliation; its PASS receipt and original source manifest were preserved.
- Runtime: local Next.js 16.3.8 webpack dev server, Payload 3.90.2, port 38913; no CMS container image or production-build claim. [resources.json](resources.json) records Node, exact PostgreSQL image/container/volume identity and isolation. PostgreSQL image ID: `sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94`.
- Only newly created container `rc103a-20261017`, labelled `renegade.disposable=rc103a`, database `rc103a_release_acceptance`, loopback port 5435, new media directory and transient browser contexts were used. Destructive fresh migration was inspected and restricted to this explicitly disposable target. Existing databases, media and services were not reset or stopped.
- `LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`, `SEED_ON_INIT=false`. The owner and foreign administrator use fixture-issued, persisted sessions accepted by the real HTTP authentication/authorization stack. This proves supported operator/API behavior, not an ordinary passkey enrollment/login ceremony. The public browser is unauthenticated.
- Own web process and database container stopped after verification; isolated data retained. Next's generated root TypeScript config changes were compared with saved originals and restored exactly. Their runtime hashes are in [runtime-generated-config.json](runtime-generated-config.json); application source did not change during restoration. Focused typecheck passed again after restoration.

## Implementation and control dispositions

| Level/control | Canonical implementation and observed disposition |
| --- | --- |
| Site | Existing `sites` native CRUD. Referenced sites reject deletion with the dependent collection named. Native create/edit/delete succeeds after explicitly removing its bootstrap publication and grants; identity audit evidence remains. |
| Section | Existing `sections`; automatic stable canonical path, deterministic sort order, site validation. Native edit/move/delete works for empty sections. Populated scope moves and deletes are rejected. |
| Category/Subcategory | Existing `categories.parent` plus `section`; no duplicate subcategory collection. Same-site, same-section, publication-scope and acyclic ancestry validation. Rename/reparent preserves the canonical URL. Dependent children, content or collections prevent deletion. |
| Collection | Existing `albums`, labelled Collections and promoted to the core module floor. Optional `category`, sort order and native CRUD; category moves stay within site. Content and media memberships protect deletion. Legacy media albums remain supported. No provider configuration is required for core collections. |
| Content | Existing `content`, with `collections` memberships and sort order in the normal Writing form. Site, section, category, collection and Page-parent integrity enforced. Empty editor may save as draft; publish without a body returns an explanatory 400 instead of success followed by public 404. Child pages and editorial revision history protect deletion; revision-backed content can be archived, which returns public 404. Empty drafts can be detached/deleted. |
| Public routes | `/browse`, `/sections/…`, existing category canonical paths, category-linked `/albums/…` and canonical content URLs display names and links. Direct category/section content listings remain supported. Empty hierarchy branches explain their state. Public discoverability rules exclude drafts/private records; site host scopes every graph. |
| Public article renderer | Explicit `/articles/[slug]` delegates to the canonical site/revision/entitlement renderer, preserving the same hierarchy breadcrumb and scoped discovery data instead of bypassing it. |
| Read-only/protected controls | Section/category canonical paths are generated and stable. Content site identity remains protected. Referenced scope changes require detachment first. Protected delete returns a real error; revision-backed content requires archive, not fabricated delete success. |

Hierarchy writes lock referenced rows within the Payload transaction using `FOR NO KEY UPDATE`. This serializes parent mutation/deletion with child writes while permitting the existing indexing foreign-key checks during publish. Native forms remain canonical; admin Publishing links expose Sections, Categories and Collections.

Changed implementation paths (some already contained unrelated edits, which were preserved):

```text
src/app/(frontend)/[...path]/page.tsx
src/app/(frontend)/articles/[slug]/page.tsx
src/app/(frontend)/browse/page.tsx
src/collections/Publishing.ts
src/collections/Sites.ts
src/migrations/20261017_230000_rc1_content_hierarchy.ts
src/migrations/index.ts
src/payload-types.ts
src/modules/admin/PublishingLinks.tsx
src/modules/admin/progressive-disclosure.ts
src/modules/module-registry.ts
src/modules/editorial/hierarchy.ts
src/modules/public/hierarchy.ts
src/modules/public/HierarchyView.tsx
src/modules/public/discovery.ts
src/modules/public/semantic-url.ts
tests/rc1-03a/run-isolated.ps1
tests/rc1-03a/verify-hierarchy.ts
tests/rc1-03a/browser-public.ts
tests/rc1-03a/tsconfig.json
tests/unit/content-hierarchy.test.tsx
tests/unit/article-route-hierarchy.test.ts
tests/unit/module-registry.test.ts
```

Migration adds section canonical paths, collection category/order, content order and collection relationship storage, and repairs missing UUID defaults on the three hierarchy collections. All 119 registered migrations passed on the fresh isolated database. Down refuses to discard populated hierarchy relationships/order; down and populated upgrade rehearsal were not executed here.

## Executed journeys and persistence

1. Native authenticated REST built two sites and all six Alpha levels. Draft creation then normal publish PATCH created the real editorial revision; all levels were refetched after commit. Rename, category reparent, collection move, title/order edit, membership filter and ordered reload matched persisted values.
2. Invalid/missing parent, self/descendant cycle, cross-site category/section/collection, wrong-section parent and populated scope change were rejected. Every denied mutation compared the complete refetched record with its before value. Foreign administrator and anonymous mutations were denied. Referenced site/section/category/collection and Page-parent/revision-backed content deletions were denied. Detachment and ordered removal succeeded for disposable empty records.
3. Native Site create/edit/remove and empty Section edit/cross-site move/remove succeeded. Concurrent category create versus parent Section delete produced **404/200**, not two successes. SQL proved zero category→Section orphans; supported cleanup/retry succeeded. Archive persisted and its former public URL returned 404.
4. Real virtual-host HTTP returned 200 at all six levels. Alpha excluded hidden draft/private/foreign labels; the same content URL on Beta returned 404. The article contained the complete named breadcrumb. Direct category content and stable public collection order were asserted.
5. Fresh Chromium clicked Knowledge → Engineering → Database Practice → Field Guides → PostgreSQL Field Guide Revised, saw the persisted article body, followed breadcrumb links back, observed direct-category content and an empty branch, and received Beta's 404. [hierarchy-browser.png](hierarchy-browser.png) is the actual rendered result.
6. The owned web process was stopped, PostgreSQL restarted, health rechecked, and a new web process started. A new verifier process refetched persisted IDs/relationships/title/order/status and reran all six public HTTP levels plus the Beta denial. Eight restart checks passed. Initial immediate `pg_isready` returned 1 during startup; the subsequent health check returned 0 before verification.

Raw original proof: [operator.log](operator.log), [controls.log](controls.log), [browser.log](browser.log), [restart.log](restart.log) and server HTTP traces. Persistence JSON records `content_rels.path=collections`, the exact `albums_id`, published status, order and title from SQL; it contains no session token. After concurrent edits, supported controls, persisted/public refetch and the same public browser journey were rerun: [controls-current.log](controls-current.log) **5/5**, [restart-current.log](restart-current.log) **8/8**, [browser-current.log](browser-current.log) **6/6**, all exit 0. These runs updated the HTML, screenshot and restart persistence artifacts; image/HTML hashes are in final-verification.json. They do not rerun the entire original 37-check fresh fixture or the 81 units against the changed checkout.

## Commands, exits and counts

Run from the repository root. `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-03a/run-isolated.ps1 <action>` supplies only the isolated environment above.

| Exact command/action | Exit | Passed / failed / skipped | Artifact |
| --- | --- | --- | --- |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-03a/run-isolated.ps1 migrate` | 0 | 119 migrations / 0 / 0 | migrations.log |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-03a/run-isolated.ps1 types` | 0 | Generated all-module Payload types | generate-types.log |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-03a/run-isolated.ps1 verify` | 0 | 37 / 0 / 0 | operator.log |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-03a/run-isolated.ps1 controls` | 0 | 5 / 0 / 0 | controls.log |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-03a/run-isolated.ps1 browser` | 0 | 6 / 0 / 0 | browser.log |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-03a/run-isolated.ps1 restart` | 0 | 8 / 0 / 0 | restart.log |
| `npx.cmd tsc --project tests/rc1-03a/tsconfig.json --noEmit` | 0 | All application source plus focused 03A tests; 0 diagnostics | types-focused.log |
| Unit command below | 0 | 81 / 0 / 0 in 12 files | unit.log |
| ESLint command below | 0 | 0 errors, 0 warnings | lint.log |
| `npm.cmd run typecheck` | **2** | **9 existing diagnostics in two 02D test files** | types.log |
| `npm.cmd run typecheck` (after concurrent edits) | **2** | **3 diagnostics in new rich-editor test** | types-current.log |
| `npx.cmd tsc --project tests/rc1-03a/tsconfig.json --noEmit` (post-drift application/focused test check) | 0 | 0 diagnostics | types-focused-current.log |

```powershell
npx.cmd vitest run tests/unit/content-hierarchy.test.tsx tests/unit/article-route-hierarchy.test.ts tests/unit/rc02-published-revision.test.ts tests/unit/module-registry.test.ts tests/unit/discovery-contracts.test.ts tests/unit/disc-00-discovery-contract.test.ts tests/unit/semantic-url.test.ts tests/unit/publishing-pass.test.ts tests/unit/public-navigation.test.ts tests/unit/progressive-disclosure.test.ts tests/unit/module-profiles-acceptance.test.ts tests/unit/pub-04-publishing-floor.test.ts

npx.cmd eslint src/modules/editorial/hierarchy.ts src/modules/public/hierarchy.ts src/modules/public/HierarchyView.tsx 'src/app/(frontend)/browse/page.tsx' 'src/app/(frontend)/[...path]/page.tsx' 'src/app/(frontend)/articles/[slug]/page.tsx' src/modules/public/discovery.ts src/modules/public/semantic-url.ts src/collections/Publishing.ts src/collections/Sites.ts src/modules/module-registry.ts src/modules/admin/progressive-disclosure.ts src/modules/admin/PublishingLinks.tsx src/migrations/20261017_230000_rc1_content_hierarchy.ts src/migrations/index.ts tests/rc1-03a/verify-hierarchy.ts tests/rc1-03a/browser-public.ts tests/unit/content-hierarchy.test.tsx tests/unit/article-route-hierarchy.test.ts tests/unit/module-registry.test.ts --max-warnings=0
```

**Original exact-tree scoped assertions: 137 passed, 0 failed, 0 skipped, 0 mandatory 03A checks unexecuted on that tree.** Post-drift supplement: **19 passed, 0 failed, 0 skipped**. The original fresh-fixture 37-check suite and 81 units have not been rerun on the later checkout; their earlier results are retained with their exact source identity. Full typecheck failed on both trees, with different diagnostics; neither failure was weakened or hidden. Focused typecheck explicitly covers all application source and selected tests, not the unrelated test tree. This agent did not repair or run the next subpass's rich-editor tests.

Intermediate attempts found and repaired the empty-original-document create guard, an overstrong parent lock that blocked indexing, an ignored Host header in Node fetch (replaced with an actual HTTP virtual-host request), the article route bypass, and unexplained revision-backed delete failure. An attempted empty-body revision hit the required projection invariant; that attempt was removed and replaced with truthful publish rejection. [public-recheck.log](public-recheck.log) is an earlier failed intermediate attempt, not current-source proof. Current operator/restart/browser logs above supersede it only for the exact current manifest.

Four other explicitly unexecuted acceptance families: ordinary authenticated admin-form CRUD/passkey ceremony; production build/image/deployment; populated upgrade/down rehearsal; exhaustive whole-repository tests. No provider or real-world external outcome was claimed. RC1 and the current-checkout 03A promotion remain NOT READY. Resolve the three current test diagnostics in their owning scope, obtain a stable candidate, and complete the affected 03A checks before promotion. Existing passing proof and all implementation edits are preserved. Own isolated processes/container are stopped.
