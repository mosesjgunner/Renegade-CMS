# RC1 subpass 11A - PASS

Date: 2026-10-26 (America/Chicago). Scope: product catalog, variants and inventory only. Aggregate RC1 remains **NOT READY**. No next subpass was executed.

## Exact tested source and resources

Base commit: `87a9ef6bb35405658ef5dd3fb94f3f95771a799e`. Changes are uncommitted. The complete 1,454-file source/config/test manifest is [source-tree.json](source-tree.json), SHA-256 `56a1045ce2386581bdb0a9e6ebc4bef0a36c8259abeb0838a8eb2d5bb4c9ac45`. It includes tracked/untracked source, tests, scripts, patches, dependency locks, Next/TypeScript configuration and AGENTS.md; documentation/evidence, dependencies, databases, media and secrets are excluded. Existing community edits and prior receipts were preserved. The manifest was checked before the final journey and again after restart; no source drift.

Runtime: Node v24.19.0, installed Next.js 16.3.8 development server, all modules. No application production image was built or tested.

New dedicated PostgreSQL container `rc111a-20261026`, label `rc1.scope=11a`, ID `dadf7524c3889120b7149613a66e91d836ed3b0c99f727afca5a15dfc211ce93`, image `sha256:0cefaabd882e42bcb2a2f3dc56d3ce4770560ba62fd7f197f1a2e008fd5731ab`; loopback port 5459. Database `rc111a_release_acceptance`; media `scratch/rc111a/media`; Next output `.next-rc111a`; web port 39015; isolated Chromium contexts. Destructive fresh-migration script was inspected before use and ran only against this newly created dedicated database. Existing databases, environments and media were untouched. Final web/browser processes and own PostgreSQL container are stopped; data retained.

## Implementation

- `src/collections/Commerce.ts` and new `src/modules/commerce/catalog-write.ts`: validate partial writes against persisted product data after semantic-path assignment; enforce review/publication on create and update; reject invalid variants, inventory and money with HTTP 400; return editorial/variant changes to draft while retaining live stock-only adjustments. Enforce same-site cover media and approved, private, same-site digital delivery media.
- `src/app/(frontend)/api/admin/catalog/route.ts`: retain canonical reviewed lifecycle through the trusted collection-hook context after operator/site authorization.
- New `src/app/(frontend)/api/catalog/route.ts` and `src/modules/commerce/LiveProductShowcase.tsx`: host-scoped, published-only public DTO with current prices and availability; no private delivery fields; no-store reads and truthful empty/error states.
- `src/modules/presentation/themes/components.tsx`: replace fabricated starter products/prices with the live showcase and neutral default copy.
- `src/modules/media/workflow.ts`: authorize cover bytes from a live, same-site published product, respecting media policy; withdraw bytes when that product returns to draft.
- `src/modules/commerce/ProductView.tsx`: missing eligible offer disables purchase availability.
- `src/modules/admin/CatalogCommandCenter.tsx`: expose native Create product action alongside existing edit/lifecycle controls.
- `tests/unit/rc1-11a-catalog-write.test.ts`, `tests/rc1-11a/journey.ts`, `run.ps1`, `provenance.ts`: focused validation and isolated operator/public-browser/persistence/restart proof.

No collection fields changed; existing canonical schema/types were reused. No migration or generated-type addition was needed. Fresh migration verification applied all 127 migrations and repeated migration execution idempotently; independent final SQL count was 127.

## Ordinary operator and observed persistence

Authentication is explicitly **fixture operator sessions**, created using the canonical session signer and isolated session records. Catalog business mutations use authenticated supported HTTP endpoints, not database status flips. `LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`. This is operator API/business-UI proof plus genuine anonymous Chromium storefront browsing; it is **not** ordinary passkey enrollment/login acceptance.

1. Upload cover and separate private digital source through `/api/media/upload` (201); persist private-source policy through native collection PATCH. Run the supported Payload media queue to generate real derivatives.
2. Create physical `b17f5143-e910-4879-ab36-1351c197c971` and digital `77ccf4bc-8ed1-49e8-a65f-a783e18c570d` products through `/api/products` (201), with two deliberate SKUs/options each. Refetch actual PostgreSQL-backed documents and verify variants and prices.
3. Request review, approve and publish both through `/api/admin/catalog`. Read persisted publication states and browse `/store` and product details in Chromium. Native anonymous reads exclude drafts. Cover original and hero derivative return 200; the screenshot shows the actual generated cover.
4. Edit physical price from USD 1200 to 1750 minor units through ordinary PATCH. Persisted state becomes draft; public listing and detail exclude it, and cover delivery becomes 404. Re-review and republish; refetch/browser render USD $17.50.
5. Adjust both physical variant quantities from 5 to 0 through native PATCH. Persisted product stays published; public DTO and Chromium display Unavailable, and the canonical quote rejects out-of-stock inventory. The published starter page `/catalog-11a`, created and published through supported layout APIs, renders current catalog price/stock and excludes fabricated/foreign products.
6. Archive the digital product through the catalog API; persisted state becomes archived, public listing excludes it and its detail returns 404.
7. Stop/start the dedicated PostgreSQL container and start a fresh Next process. Refetch prices/stock, publication/archive states, workflow audit and host-scoped public output; repeat browser reads and inspect the operator catalog Create product link.

Inspect [journey.json](journey.json) (33 passed), [restart.json](restart.json) (7 passed), [state.json](state.json), HTTP logs and [storefront.png](storefront.png). Screenshot SHA-256 `ca8b6550cb8c2725af1547814b7a4309636f6a91c370caa0df9313dc07a6b74c`.

## Negative and error cases

Executed: direct published creation 400; undeclared variant 400 with persisted variants unchanged; invalid minor money/lowercase currency 400 with prior price unchanged; foreign-site product media 400; unrelated-site staff mutation 403 with state unchanged; anonymous mutation 403; foreign published product absent locally and local detail 404; edited/unapproved and archived products absent publicly; out-of-stock and nonexistent SKU rejected by the canonical quote; unknown host 404 via raw HTTP Host header; private digital source bytes 404 anonymously. Focused units additionally reject duplicate SKUs and negative/fractional inventory and revalidate partial publication against active offers.

Digital source governance/clean metadata is a local fixture declaration for generated test bytes. No malware scanner, paid digital delivery, checkout, charge, provider delivery, shipment, remote sandbox, production-image, stock-race or worker-crash outcome is claimed. No external provider is required for this catalog scope.

## Commands, exits and counts

All accepted final commands below exited 0. Logs are retained as text; PowerShell output was normalized for readability.

| Command | Accepted result |
| --- | --- |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-11a/run.ps1 migrate` | 127 fresh migrations; repeated migration run; schema assertions pass; `migrations.log` |
| `npx.cmd tsc --noEmit` | Full checkout typecheck, 0 diagnostics; `types.log` |
| `npx.cmd eslint <catalogPaths> --max-warnings=0` | 0 errors/warnings; `lint.log` |
| `npx.cmd prettier --check <catalogPaths>` | All matched files pass; `format.log` |
| `npx.cmd vitest run <unitFiles>` | 11 files, 86 passed, 0 failed/skipped; `unit.log` |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-11a/run.ps1 journey` | 33 runtime assertions passed, 0 failed/skipped; `journey.log`, `web.log` |
| `docker stop rc111a-20261026` then `docker start rc111a-20261026` | Real database process restart; retained volume/data |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-11a/run.ps1 restart` | 7 runtime assertions passed, 0 failed/skipped; `restart.log`, `restart-web.log` |
| `node --import tsx tests/rc1-11a/provenance.ts --check` | 1,454-file source containment passes |
| `docker exec rc111a-20261026 psql -U postgres -d rc111a_release_acceptance -At -c 'SELECT count(*) FROM payload_migrations;'` | 127 |
| `git diff --check` | Exit 0; `diff-check.log` |

Exact `<catalogPaths>` arguments:

```text
src/collections/Commerce.ts
src/modules/commerce/catalog-write.ts
src/modules/commerce/LiveProductShowcase.tsx
src/modules/commerce/ProductView.tsx
src/modules/media/workflow.ts
src/modules/admin/CatalogCommandCenter.tsx
src/modules/presentation/themes/components.tsx
src/app/(frontend)/api/catalog/route.ts
src/app/(frontend)/api/admin/catalog/route.ts
tests/rc1-11a/*.ts
tests/unit/rc1-11a-catalog-write.test.ts
```

Exact `<unitFiles>` arguments:

```text
tests/unit/rc1-11a-catalog-write.test.ts
tests/unit/shop-01-catalog-workflows.test.ts
tests/unit/shop-02-tampering-and-invariants.test.ts
tests/unit/shop-02-carts-and-proposals.test.ts
tests/unit/med-00-media-contract.test.ts
tests/unit/phase-a-media.test.ts
tests/unit/rc1-04a-layout-media.test.ts
tests/unit/rc1-05c-public-versions.test.ts
tests/unit/rc1-05b-private-media.test.ts
tests/unit/rc1-05c-variants.test.ts
tests/unit/rc1-05a-media-lifecycle.test.ts
```

Earlier unsuccessful diagnostics are not counted as accepted proof: an initial 27-test run had one publication-hook regression (repaired); journey iterations exposed wrong quote arguments, a stale draft reference and fetch ignoring custom Host (harness repaired without weakening assertions); an earlier restart runner exited 1 after passing assertions because of a pg deprecation warning/cleanup issue (repaired). A create-link lint error was repaired. Native validation initially returned 500; final assertions require and observe 400. [earlier-harness-failure.json](earlier-harness-failure.json) retains the pre-fix Host diagnostic. The original script-policy refusal was resolved with process-scoped ExecutionPolicy Bypass. Final source was frozen and the entire 11A journey and restart rerun after repairs.

Accepted totals: **86 unit tests + 40 runtime assertions; 0 failed; 0 skipped; 0 mandatory 11A groups unexecuted**. Broader release/full-unit/build/image/provider gates were not executed and are not passed by this receipt.

## Exit and handoff

**11A PASS. Open 11A blockers: none.** Previous evidence retains its original source identity; no historical receipt is relabeled as current. Existing edits/databases/media/secrets and sibling environments were preserved. No commit, reset, clean, push, tag, publication to external services or deployment occurred. Continue only under the next explicitly assigned subpass; see [NEXT.md](NEXT.md).
