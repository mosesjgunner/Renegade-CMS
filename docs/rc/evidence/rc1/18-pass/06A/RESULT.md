# RC1 06A - Metadata, Schema and Indexing Controls

Status: **PASS 06A**, 2026-10-18 (America/Chicago). This is bounded source/runtime acceptance; aggregate RC1 remains NOT READY.

## Exact source and preserved work

Final tested base: `cca9f870e9ec5355950f9b4a2b4bb12fd44885c2`. Exact nine-path overlay: `5db6e26c55dce6673da56aaa9f2c5875258e02a4703659a4bc2dc90daf335fe9` in [tested-tree.json](tested-tree.json). [containment.json](containment.json) confirms identical HEAD, all nine hashes, and no missing/unexpected source paths after final execution. HEAD advanced during this session; earlier partial runs are not promoted to this final snapshot. This agent issued no commit, reset, clean, push, tag, publication or deployment command.

Preexisting edits and historical receipts are preserved. [historical-receipt/RESULT.md](historical-receipt/RESULT.md) retains the earlier 131-assertion claim at its older source boundary; it is superseded by this result, not relabeled as current proof. The previous 05C handoff remains NOT READY for its portability/current-tree blockers; this subpass did not repair or accept 05C.

## Actual implementation in the tested tree

- `src/collections/Publishing.ts`: added the missing optional Content `requiredEntitlement` JSON field with nonempty resource/capability validation. The existing renderer and discovery restriction checks previously read an unregistered field, so ordinary saves discarded it. It is now editable in Publish; social/discovery overrides and keywords are visible in SEO. Reused canonical Content, discovery and entitlement services.
- `src/migrations/20261018_061000_rc1_content_entitlement.ts` and `src/migrations/index.ts`: registered forward migration for nullable `content.required_entitlement` JSONB; rollback refuses to discard populated restriction policies. No business statuses were changed with SQL.
- `src/payload-types.ts`: regenerated types, including Content restriction and existing taxonomy/layout SEO fields. Generation also reconciles the already-registered media archived enum; no media implementation was changed.
- `src/modules/editorial/publishing-pass.ts`: canonical validation now follows the same ordinary-field/JSON-override precedence as rendering; clearing the ordinary field cannot bypass validation. Rejects entitlement-restricted canonical targets. Incoming references are checked across Content, categories, sections, topics and layouts, including JSON canonicals, before making targets noncanonical, noindex, restricted, scheduled, removed or tombstoned. Canonical validation returns public HTTP 400 messages rather than generic server failures.
- `src/globals/SiteSettings.ts`: homepage canonical must remain at the site root, preventing a homepage canonical from pointing at draft/content paths; invalid saves return HTTP 400.
- `tests/unit/rc1-06a-metadata-schema-indexing.test.ts`: added regressions for effective canonical fallback, entitlement restrictions, cross-collection JSON references and homepage canonical conflicts.
- `tests/rc1-06a/verify.ts`, `run-isolated.ps1`: SEO creates/updates, theme changes and revisions use authenticated native HTTP APIs; privileged calls are limited to fixture identities/bootstrap and independent persistence reads. Added actual previews, exact canonical counts, persisted denials, gated pages, aliases, noindex toggling and rendered-response receipts. Verification failures now propagate a nonzero exit while cleanup runs; an unconditional success exit in finally was removed.

Existing title/description, OG/Twitter, Schema.org, taxonomy/home discovery, restricted route metadata and robots headers were reused and validated rather than rewritten.

## Executed operator path -> persistence -> output

The final [journey.json](journey.json) contains 100 passed assertions; [operator.log](operator.log) records execution. Fixture owners/staff and real persisted signed production-strategy sessions bootstrap operator identities. `LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`. This proves authenticated HTTP authorization and operator outcomes, **not ordinary WebAuthn enrollment/login or admin form interaction**. Public Chromium navigation/screenshots were executed independently.

1. Created isolated sites and actors, uploaded a real 1200x630 OG fixture through `/api/media/upload`, and saved homepage SEO through `/api/globals/site-settings`, taxonomy SEO through `/api/categories`, and draft/published/private/noindex content through `/api/content`. Fresh canonical-service reads independently confirm persisted homepage/category/article values; [state.json](state.json) records IDs and saved SEO fields.
2. Inspected actual response HTML and headers for `/`, `/articles/investigation-the-waterfront-deal`, `/categories/investigations`, `/login` and `/members/settings`. [rendered.json](rendered.json) stores observed status, X-Robots-Tag, title/meta/canonical tags and parsed JSON-LD from fetched HTML. Public homepage/article/category return 200 with custom titles/descriptions, exactly one canonical each, OG/social metadata and WebSite/Organization, Article/BreadcrumbList and CollectionPage schemas respectively. Login/settings emit noindex/nofollow headers and meta, without canonicals.
3. Draft and private URLs return 404 without public canonical/social metadata or draft SEO title leakage. Explicit noindex content returns 200 with noindex metadata. A separately persisted public-visibility entitlement-restricted article has no indexable metadata. Sitemaps exclude draft/private/noindex/gated content and canonical aliases.
4. Created an authenticated saved-draft preview through `/api/admin/content/preview`: actual preview returns 200, X-Robots-Tag and robots meta are noindex/nofollow, with no canonical/social tags. [preview-rendered.json](preview-rendered.json) preserves that observed 200 response metadata. Anonymous and foreign-site preview requests return 404.
5. Rejected foreign-origin, query, fragment, draft-targeted, gated-targeted and cleared-field/foreign-JSON canonical saves. A valid syndicated alias emits exactly one canonical to the primary article. Attempts to gate/noindex/recanonicalize its referenced target fail; independent reads prove target title/canonical/restriction state remains unchanged. Foreign-site staff and anonymous metadata writes return 403 with unchanged persisted SEO.
6. Switched `neutral-starter` -> `renegade-party` -> `neutral-starter`, created an actual content body revision over HTTP, and checked persisted SEO plus refetched public title/social/canonical/schema output. Toggled homepage `seoNoIndex` on and off over the same ordinary admin field, checking synchronized stored indexing mode and actual rendered robots on both transitions.
7. Chromium visited public homepage/article/category and captured the three `screenshot-*-render.png` artifacts. The article screenshot was visually inspected.

## Restart and isolation

Fresh web process **and** `docker restart rc106a-20261018`; [web-before-restart.json](web-before-restart.json) / [web-after-restart.json](web-after-restart.json) identify different listener processes. Four post-restart assertions pass for homepage, article, category and login. [restart.json](restart.json), [restart-rendered.json](restart-rendered.json), [restart.log](restart.log), and independent SQL projection [restart-persisted.jsonl](restart-persisted.jsonl) preserve observed output and persisted policies/SEO after restart.

Only the explicitly owned disposable PostgreSQL database at loopback 5446 / `rc106a_release_acceptance`, web port 38980, `.next-rc106a`, and `scratch/rc106a-20261018/media` were used. Fresh-migration reset defaults were inspected before use; the container did not exist at entry. [runtime.json](runtime.json) records the exact PostgreSQL image/container identity and environment boundary. No production application image was built or accepted; this is a Next.js development runtime. No external provider actions, live messages, payments or posts.

Own web/container are stopped; database and media are retained. Sibling environments and previous media/evidence are preserved. The wrapper's `migrate` action intentionally resets this disposable schema: do not use it to resume retained state.

## Commands, exits and counts

Commands ran from the current repository root. Wrapper invocation prefix: `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-06a/run-isolated.ps1 -Action`.

| Command/action | Exit | Result / receipt |
|---|---:|---|
| `start-db` | 0 | Created only `rc106a-20261018`, loopback 5446 |
| `migrate` | 0 | 122 fresh migrations, repeated migrate no-op/count checks; [migrations.log](migrations.log), [schema.log](schema.log) |
| `generate-types` | 0 | Canonical Payload generation; [generate-types.log](generate-types.log) |
| `unit` | 0 | 6 files / **63 passed, 0 failed, 0 skipped**; [unit.log](unit.log) |
| `types` | 0 | All src plus 06A harness/test, zero diagnostics; [types.log](types.log) |
| `lint` | 0 | Focused implementation/test ESLint, zero errors/warnings; [lint.log](lint.log) |
| `node node_modules/eslint/bin/eslint.js src/migrations/index.ts src/migrations/20261018_061000_rc1_content_entitlement.ts --max-warnings=0` | 0 | Additional migration lint; [migration-lint.log](migration-lint.log) |
| `node node_modules/prettier/bin/prettier.cjs --check` on changed implementation/migration/tests listed in the manifest | 0 | [format.log](format.log); final one-line harness correction also checked |
| `verify` (final accepted run) | 0 | **100 passed, 0 failed, 0 skipped** operator/HTTP/Chromium assertions |
| `restart-check` after fresh web boot | 0 | **4 passed, 0 failed, 0 skipped** after PostgreSQL restart |
| Scoped `docker exec ... psql` read-only schema/persistence projections | 0 | 122 migration records, nullable JSONB field and exact retained metadata/restrictions |
| `npm.cmd run typecheck` | **2** | **7 existing diagnostics**, all `tests/rc1-03d/verify-import-and-build.ts` (lines 31, 44, 97, 145, 160, 178, 448); [full-types.log](full-types.log) |
| `git diff --check` | 0 | No whitespace errors |
| Stop own web and `docker stop rc106a-20261018` | expected interrupt / 0 | Own resources stopped, data retained |

Final scoped assertions: **167 passed / 0 failed / 0 skipped / 0 mandatory scoped checks unexecuted**. Full repository typecheck is a separate failed command, not a scoped type PASS or RC1 closure. Production build/image and ordinary WebAuthn/admin-form browser acceptance were not executed or claimed in this subpass.

Diagnostic history is not erased: [repaired-failure.log](repaired-failure.log) and [repaired-failure-rendered.json](repaired-failure-rendered.json) retain the earlier unregistered-entitlement failure (indexable output). [corrected-assertion.log](corrected-assertion.log) retains the later Windows-encoding-damaged expected title assertion; persisted indexing was correct. Both are superseded by the final 100/100 run. Intermediate runs before subsequent source changes, and a deliberately interrupted pre-restart run, are not acceptance receipts.

## Remaining blockers and boundary

No open mandatory 06A blocker on the exact tested source. Aggregate RC1 remains NOT READY: the seven 03D full-type diagnostics and prior subpass blockers remain outside this acceptance. No subsequent subpass was started. See [NEXT.md](NEXT.md).
