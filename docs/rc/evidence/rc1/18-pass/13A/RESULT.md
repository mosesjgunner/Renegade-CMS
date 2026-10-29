# RC1 13A — PASS, bounded fulfillment planning

2026-10-29. **121 passed / 0 failed / 0 skipped; 0 mandatory local 13A checks unexecuted:** 97 focused tests, 20 checkout/operator journey checks and 4 restart checks. Fresh migration, generated types, full repository types, scoped zero-warning lint, formatting, storage assertions and source containment also passed. Aggregate RC1 remains NOT READY. No 13B work executed.

## Exact source and changes

Tested base **`2197e44cc8624fdbf5beec8996a5c9583607c6ac`**, with the uncommitted implementation identified by [source-tree.json](source-tree.json): **1,517 source/configuration files**, SHA-256 **`0e34026b10e352158ef28ac012f55c72cdb4d88efcc0b7a1a25a425cf7e30565`**. Final containment passed after type generation and both journeys. This is a dirty-tree source identity, not a new commit or application image. Initial checkout was clean. Prior subpass evidence remains unchanged and historical; none is relabeled as current proof.

Application paths:

```text
src/app/(frontend)/api/admin/fulfillment/route.ts
src/app/(frontend)/api/commerce/checkout/initiate/route.ts
src/collections/Commerce.ts
src/migrations/20261029_130000_rc1_fulfillment_binding.ts
src/migrations/index.ts
src/modules/admin/FulfillmentCommandCenter.tsx
src/modules/admin/FulfillmentPlanningPanel.tsx
src/modules/admin/PodMappingCenter.tsx
src/modules/commerce/catalog-write.ts
src/modules/commerce/catalog.ts
src/modules/commerce/fulfillment-mapping.ts
src/modules/commerce/fulfillment-operator.ts
src/modules/commerce/fulfillment-persistence.ts
src/modules/commerce/fulfillment-plan.ts
src/modules/commerce/pod-mapping.ts
src/modules/commerce/service.ts
src/payload-types.ts
```

Verifiers: `tests/unit/{fulfillment-provider-boundaries,shop-03-pod-fulfillment,rc1-13a-fulfillment-eligibility}.test.ts`, `tests/rc1-13a/{journey.ts,provenance.ts,run.ps1}`. Next generated `next-env.d.ts` and the isolated output includes in `tsconfig.json`; these are included in the tested manifest. Documentation changes are this receipt, NEXT and the single cumulative 13A ledger row. The manifest excludes documentation/evidence, dependencies, media, databases and secrets; `package-lock.json` supplies dependency identity.

Implemented owner/admin mapping reviews on canonical products, bound to exact variant/site/merchant/provider connection. Native mapping forgery is rejected; mappings and encrypted provider credentials are hidden from public reads. Draft POD authoring can precede mapping review, while readiness/approval/publication still require valid mappings. Mapping changes return published products to draft.

Checkout now validates real shipping, variant availability/template placement and approved private PNG bytes before initiating payment, then freezes the mapping into order lines. Artwork inspection checks actual checksum, decodable pixels, dimensions and effective DPI, with signed sold snapshots. It does **not** claim antivirus scanning or provider rendering. Emulator availability/cost comes from its catalog/templates; external availability remains unverified and cannot authorize POD checkout. Item cost estimates exclude unquoted shipping and are not provider quotes.

The existing paid worker now persists the full immutable plan and canonical packages/jobs from sold instructions. Eligibility requires an issued receipt and matching canonical settlement evidence; unpaid, cancelled, disputed and partially/fully refunded orders are denied. Confirmed crypto evidence is additionally covered by focused service tests, without a chain acceptance claim. A transaction/row lock and unique order/package indexes prevent duplicate resources. Disabled bindings leave the actual order paid with a blocked fulfillment result. Operator reconciliation repairs the plan after configuration recovery and clears its current error. An owner/admin can audit a held-job manual override; replay creates no second package and never implies provider submission.

## Ordinary actions → storage → output

Canonical-service fixture operator sessions were used with `LOCAL_E2E_TEST_MODE=false` and `ENABLE_TEST_ROUTES=false`. These prove authorized product/operator paths, **not an ordinary passkey ceremony**. Customer checkout used the supported local payment confirmation UI; signed callbacks were processed by a separate real commerce worker against isolated PostgreSQL.

1. Uploaded actual private 1600×1600 PNG bytes via HTTP, approved media rights, created manual/POD products and reviewed mappings through the supported operator API. Supplied cost `999999` was ignored in favor of the observed emulator item estimate `1250 USD`. Review/approve/publish transitions persisted.
2. Built the physical mixed cart and proposal through HTTP, then clicked **Confirm test payment** in Chromium. Paid order **`5f07bbde-f14d-43da-9dd6-140c683ffce8`**, **3687 USD minor units** including canonical checkout charges, acquired one full plan, one manual package and one held POD job. `/admin/fulfillment` displayed that plan and actual held job. Its **Manual queue** displayed the persisted package ID and `pending_acknowledgement` status. See [operator.png](operator.png) and [manual-package.png](manual-package.png).
3. Concurrent operator reconciliations plus replay of the same signed payment event retained one package/job of each kind. Revising the product mapping returned it to draft but left the sold plan/job snapshot at version 1 unchanged.
4. A second browser checkout, with its provider disabled after initiation, persisted paid order **`ed529450-6b71-4610-93c4-dc99bed13abe`** with a blocked plan and zero deliverable resources. Re-enabling its canonical connection and operator reconciliation created the plan. Owner manual override cancelled the unsubmitted POD job, persisted the actor/reason audit and produced active counts **0 POD / 2 manual**. Staff override was denied; replay did not duplicate resources.
5. Supported partial/full refund requests, including second-owner approval where required, made the first order refunded. Release, submission and replanning were denied. A signed cancellation of a separate unpaid checkout created no order or fulfillment.
6. Stopped the worker, confirmed another payment in the browser, observed HTTP 303 and its durable callback by provider event ID, and asserted no order yet existed. Restarted PostgreSQL, web, worker and browser context. The fresh worker produced paid order **`0f58550b-366e-4c0a-b308-f5d66f00b673`**, exactly one plan/manual package/held POD job with sold mapping version 2. Repeated reconciliation added nothing; the restored customer browser displayed paid state.

[storage.json](storage.json), produced by the read-only [storage-query.sql](storage-query.sql), contains actual persisted plans, lines, jobs, packages, receipts, settlement events and bindings. Final assertions: **3 orders / 3 plans / 3 POD jobs / 4 manual packages / 4 processed callbacks**. Every order matches its intent's site, merchant, amount and currency; every job matches its order and connection site/merchant. All plan statuses are planned with cleared current errors. **Every POD job has attemptCount 0 and no externalOrderId**; two remain on hold and the override job is cancelled. No real provider order was requested.

Denied cases include staff mapping/configuration changes, native mapping/job writes, foreign-site operators/artwork/connections, same-site wrong merchant, anonymous access, foreign Origin, insufficient artwork pixels, wrong variant/options, out-of-template placement, EUR checkout against a USD provider snapshot, unsupported PO Box delivery, unpaid and cancelled checkout planning, and partial/full refund instructions. Focused tests also cover mismatched settlement, cancelled/disputed order states, crypto under-confirmation/reorg/mismatch, and separate connections sharing a provider key.

## Commands and explicit exits

| Command | Exit / observed result |
| --- | --- |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-13a/run.ps1 migrate` | 0; **129 fresh migrations**, `migration.log` |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-13a/run.ps1 types` | 0; generated types, `generated-types.log`; source unchanged |
| `npm.cmd run typecheck` | 0; full repository, `types.log` |
| `npx.cmd eslint --max-warnings 0 $paths` | 0; 21 paths from `check-paths.txt`, zero warnings/errors, `lint.log` |
| `npx.cmd prettier --check $paths` | 0; same 21 paths, `format.log` |
| Focused Vitest command below | 0; **7 files / 97 passed**, 0 failed/skipped, `unit.log` |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-13a/run.ps1 journey` | 0; **20 passed**, 0 failed/skipped, `journey.json` / `journey.log` / web and worker logs |
| `docker restart rc113a-20261029` | 0; `database-restart.log`, exact owned-container containment checked |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-13a/run.ps1 restart` | 0; **4 passed**, 0 failed/skipped, `restart.json` / restart logs |
| `Get-Content …/13A/storage-query.sql -Raw \| docker exec -i rc113a-20261029 psql -X -U postgres -d rc113a_release_acceptance -v ON_ERROR_STOP=1 -t -A` | 0; output saved UTF-8 to `storage.json`; binding/count assertions exit 0, `storage-assertions.txt` |
| `node --import tsx tests/rc1-13a/provenance.ts --check` | 0; 1,517 files unchanged, `containment.log` |
| `git diff --check` | 0; `diff-check.log` |
| `docker stop rc113a-20261029` | 0; data retained, `resource-closure.log` |

```powershell
$paths = Get-Content docs/rc/evidence/rc1/18-pass/13A/check-paths.txt
npx.cmd vitest run tests/unit/shop-03-pod-fulfillment.test.ts tests/unit/fulfillment-provider-boundaries.test.ts tests/unit/rc1-13a-fulfillment-eligibility.test.ts tests/unit/shop-01-catalog-workflows.test.ts tests/unit/rc1-11a-catalog-write.test.ts tests/unit/shop-04-payment-operations.test.ts tests/unit/shop-07-donation-checkout-route.test.ts
```

Earlier development failures were repaired before this accepted fresh run: outdated media inspection import, draft POD bootstrap, fixture inventory/cart input shapes, browser navigation/confirmation timing, and the callback assertion's wrong query field. Provider-boundary mocks now supply genuine eligibility context to reach their original authorization/configuration assertions; the mug fixture uses its actual product ID. Assertions were not weakened. One intermediate rerun was deliberately stopped to add the explicit manual-package UI inspection. Development attempts are not counted as accepted passes. An initial runner invocation was rejected by PowerShell execution policy; the recorded commands use process-scoped `-ExecutionPolicy Bypass`.

## Isolation and limits

Only task-owned **`rc113a-20261029`**, label `rc1.scope=13a`, PostgreSQL 17.6 database **`rc113a_release_acceptance`**, loopback **5468**, was reset/migrated/restarted. Inspected the fresh migration script's schema-drop behavior and guarded the runner by exact container label/database/URL. Media is `scratch/rc113a/media`, Next output `.next-rc113a`, web port 39024, worker profile `commerce-only`. Email/telecom outbound are disabled. Browser/session fixture secrets stay in ignored scratch. Existing environments, secrets, media and previous evidence were preserved.

Database image **`sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94`** is PostgreSQL, not an application image. Screenshot SHA-256: operator **`2e82072ba8721f0d2211be9d96952f982c6a3392ee4b7133d57bd053b4972626`**; manual package **`7fa5f6422eb5d0165dc0173f87ba317aa67fa1c5f9f565f4268a1146710ceda4`**.

Own web/worker/browser processes and PostgreSQL are stopped; database/media retained. **No open mandatory 13A blocker.** Remote sandbox/live POD creation, provider artwork processing, antivirus acceptance, manufacture, shipment, genuine identity ceremony and production application-image acceptance were not executed or claimed. External POD mappings remain unavailable until availability is actually established. Existing connections require explicit merchant binding; the migration does not invent one. No push, tag, publication, deployment, live charge, payout, real POD order or unsolicited message occurred. Stop at 13A.
