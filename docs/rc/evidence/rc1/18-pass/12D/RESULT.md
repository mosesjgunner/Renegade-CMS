# 12D - PASS - 2026-10-29

Scoped affiliate/referral lifecycle acceptance passes. All financial amounts below are integer minor units. **105 unit cases + 24 ordinary UI/operator/adapter/persistence/security checks + 5 actual restart checks = 134 passed, 0 failed, 0 skipped. Zero mandatory 12D acceptance groups remain unexecuted.** Aggregate RC1 remains NOT READY. No next subpass was executed.

## Exact tested source and boundaries

Base commit `63d7799f8afcfcc69b6042c6c6932c6e7ad14869` plus the 1,508-file dirty source manifest in `source-tree.json`, tree SHA-256 **`4e825bd0c7fc7ad09b8040cb4b38cdaab5522223deb5625f5a3cdaf7c87e8d90`**. Containment passed after the final journey and restart. Source capture includes application, tests, scripts, patches, package lock, Next/TypeScript/Vitest/ESLint configuration and AGENTS.md; excludes evidence, dependencies, secrets, databases and media. No application image was built or tested. Node v24.19.0; installed Next.js 16.3.8 development runtime.

The shared checkout advanced from initial `48de9a28...` to concurrent checkpoint `63d7799f...`; this agent created no commit. The accepted runs use the latter base and exact manifest, including the remaining dirty overlay. Preexisting 12C work and newly appearing 12C receipts were preserved. Read AGENTS.md, installed Next route API guidance, RC1-SCOPE.md, RC1-ACCEPTANCE-MATRIX.md, cumulative ledger, applicable services/collections/tests/migrations and 12B handoff; the 12C RESULT/NEXT appeared during execution and were then read. No historical receipt is substituted for current 12D proof. The earlier partial 12D NOT READY report is superseded only by the executed proof below.

Identity boundaries: genuine Chromium commerce controls and real supported HTTP APIs, using canonical-service **fixture member/operator sessions**. `LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`. No genuine passkey enrollment/login claim. Payment evidence is **local adapter-harness evidence**: real Stripe-test adapter with guarded loopback transport, plus the deterministic-test payment adapter. No remote sandbox, real charge, external affiliate-network conversion, provider payout, delivery or production-image claim.

## Implementation

- Persistent, immutable referral program versions and site-member codes, with owner/administrator provisioning. Required consented last-touch policy, verified referrer role/email evidence when configured, member/email self-referral checks, account-age/disallowed-member checks and fixed program/terms snapshots. Unsupported fingerprint rules, aggregate caps and non-reversing policies fail explicitly.
- Disclosed `/referrals/[code]` UI captures affirmative consent in a host-bound HttpOnly opaque cookie. Token hashes and consent snapshots persist in `referral_claims`. Checkout, donation and subscription entry points bind the claim only after canonical checkout authorization/site derivation. A claim binds one checkout; financial records remain after cookie withdrawal.
- Transactional order-locked reconciliation freezes `orders.referral_attribution`, accrues one commission per actual paid order, matures holds, and appends compensating partial/full reversals from canonical cumulative refund/dispute/cancellation evidence. Original commission principal and order attribution stay immutable. Replays cannot multiply accrual or reversals; periodic commerce worker reconciliation resumes interrupted work.
- Signed, site-keyed callback ingestion persists immutable event identity/hash, rejects conflicting replays, serializes concurrent callbacks and verifies order/site/currency/amount association. Callback assertions cannot manufacture settlement or payouts. Exact duplicate callbacks return `202` with `replay: true`, without duplicate financial effects.
- Stored, site-scoped affiliate offers replace caller-supplied redirect destinations. Public `/affiliate/[offerId]` disclosure precedes optional interaction tracking. Plain/declined/bot interactions remain untracked; an allowed consented interaction persists one canonical click. No external navigation was followed in acceptance.
- `/commerce/referrals` and the protected affiliate operator API expose stored order, attribution, callback, commission and reversal drilldowns, pending/unknown payment states and separate currency totals. Commerce operations links to the drilldown. Controls wait for hydration. Approvals and compensating reversals are not counted as executed payouts; partial reversals reduce remaining liability/export amounts.
- Additive migration registers the referral job enum values, claim/code tables, reversal accounting and durable uniqueness constraints. Payload order field and generated job/types updated. No live payout implementation or success was invented.

Changed application paths (all rooted at the repository):

```text
src/app/(frontend)/api/admin/commerce/affiliate/route.ts
src/app/(frontend)/api/commerce/affiliate/conversions/route.ts
src/app/(frontend)/api/commerce/affiliate/redirect/route.ts
src/app/(frontend)/api/commerce/checkout/initiate/route.ts
src/app/(frontend)/api/commerce/donations/intent/route.ts
src/app/(frontend)/api/commerce/referrals/claim/route.ts
src/app/(frontend)/api/commerce/subscriptions/checkout/route.ts
src/app/(frontend)/referrals/[code]/page.tsx
src/app/(frontend)/affiliate/[offerId]/page.tsx
src/app/(frontend)/commerce/referrals/page.tsx
src/collections/Commerce.ts
src/migrations/20261029_120000_rc1_referral_lifecycle.ts
src/migrations/index.ts
src/modules/admin/CommerceOperations.tsx
src/modules/commerce/affiliate-referral-contracts.ts
src/modules/commerce/affiliate-service.ts
src/modules/commerce/affiliate-offers-runtime.ts
src/modules/commerce/referral-service.ts
src/modules/commerce/referral-lifecycle.ts
src/modules/commerce/settlement-service.ts
src/modules/commerce/tasks.ts
src/modules/commerce/refund-execution.ts
src/modules/commerce/ReferralConsent.tsx
src/modules/commerce/ReferralOperations.tsx
src/modules/commerce/AffiliateOfferConsent.tsx
src/payload-types.ts
```

Also changed four unit verifiers (`shop-06-affiliate-and-referrals`, `refund-reconciliation`, `rc1-12d-financial-boundaries`, `rc1-12d-projection-routes`) and added `tests/rc1-12d/{journey.ts,run.ps1,stripe-preload.mjs,provenance.ts,tsconfig.json}`. Next generated its own `next-env.d.ts`/root `tsconfig.json` development metadata; exact files are in the source manifest. Cumulative ledger and this evidence/handoff are documentation changes. Concurrent 12C changes are not attributed to this implementation.

## Executed journeys and persisted results

`journey.json` / `journey.log`: **24 passed**. Operator provisions actual site-member referral codes and a stored disclosed affiliate offer. Chromium confirms disclosure/consent, then a fixture member starts a published 1200 USD subscription through the supported signup API and confirms the local hosted adapter form. A signed invoice plus an actual commerce worker produces one immutable subscription order and **120 USD minor-unit commission**. Nothing accrues before payment.

A newly consented donation checkout of **1000 USD minor units** passes through its real confirmation UI, signed event and worker to one donation, issued order receipt and **100 commission minor units**. Three concurrent duplicate signed callbacks produce only one conversion event and one accrual. Supported operator refunds of **300 then 700** produce compensating commissions **30 then 70**, with the original attribution unchanged. Duplicate reversal callbacks are replay-only.

A second-site guest checkout of **1000 EUR minor units** produces its own donation/order and **100 EUR commission minor units**. Cross-site codes/orders/callbacks and currency substitution fail closed. A referrer's own normal donation remains paid but receives a persisted `SELF_REFERRAL_SAME_MEMBER` attribution rejection and **no commission**. Native order-attribution forgery is denied. Operator Chromium loads the stored drilldown and opens the refunded order (`operator.png`).

A real signed payment with the wrong amount is processed by the worker into **unknown**, visibly reported against the bound claim, with **no donation/order/commission invented**. The worker is stopped; a corrected signed event is received and left pending. PostgreSQL and web are restarted and a fresh worker processes it. A restored customer browser observes the paid order.

`restart.json` / `restart.log`: **5 passed**. Original refund/subscription state survives; the pending correction yields exactly one donation/order/commission; post-restart callback replay does not duplicate evidence; final arithmetic and browser output pass.

Final persisted receipt (`persistence.json`, read-only query in `persistence.sql`): **5 orders, 4 donations, 1 subscription invoice event, 4 commission accruals + 2 compensating reversals, 2 callback events, 1 tracked affiliate click, 0 settlement batches**. Canonical revenue is **3200 USD** (1200 subscription + 1000 self-referral-rejected donation + 1000 recovered donation) and **1000 EUR**; the original refunded gift contributes zero net revenue. Affiliate unpaid liabilities are separately **220 USD and 100 EUR**, with **100 USD reversed**, and no payout. The quarantined mismatched payment amount is retained as unknown evidence and is excluded from revenue and commission totals. Source order, payment, invoice, donation, callback and compensation references are inspectable in the receipt.

Negatives exercised: anonymous access, foreign-site staff, same-site staff configuration overreach, foreign origin, declined consent, forged financial fields, arbitrary redirect destination, bots, foreign-host code, wrong-site order, wrong currency, forged signature, conflicting event identity, concurrent exact replay, repeated reversal, self-referral, native order mutation and signed amount mismatch. Unit coverage additionally checks missing eligibility evidence, invalid event identities/status/timestamps, attribution windows, partial remaining-liability exports and reversal guards.

## Commands, exits and counts

All commands ran from `C:\Projects\RENEGADE CMS\Renegade-CMS`.

| Command | Exit / result |
| --- | --- |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-12d/run.ps1 migrate` | 0; **128 fresh migrations**, repeated migrate records each once (`migrations.log`) |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-12d/run.ps1 types` | 0; Payload types generated (`generated-types.log`) |
| Vitest command below | 0; **11 files / 105 passed / 0 failed / 0 skipped** (`tests.log`) |
| `npx.cmd eslint <32 paths listed below> --max-warnings=0` | 0; zero warnings (`lint.log`) |
| `npx.cmd prettier --check <same 32 paths>` | 0 (`format.log`) |
| `npx.cmd tsc --noEmit -p tests/rc1-12d/tsconfig.json` | 0; all source + focused verifiers (`scoped-types.log`) |
| `npm.cmd run typecheck` | 0; full checkout (`types.log`) |
| `node --import tsx tests/rc1-12d/provenance.ts` | 0; exact source capture (`source-capture.log`) |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-12d/run.ps1 journey` | 0; **24 passed / 0 failed / 0 skipped** |
| `docker restart rc112d-20261029` then `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-12d/run.ps1 restart` | 0; **5 passed / 0 failed / 0 skipped**, fresh web/worker/browser |
| `Get-Content -Raw docs/rc/evidence/rc1/18-pass/12D/persistence.sql \| docker exec -i rc112d-20261029 psql -U postgres -d rc112d_release_acceptance -v ON_ERROR_STOP=1 -At` | 0; persisted receipt exported and exact counts asserted |
| `node --import tsx tests/rc1-12d/provenance.ts --check` | 0; full source containment (`containment.log`) |
| `git diff --check` | 0 (`diff-check.log`) |

```powershell
npx.cmd vitest run tests/unit/shop-06-affiliate-and-referrals.test.ts tests/unit/rc1-12d-financial-boundaries.test.ts tests/unit/rc1-12d-projection-routes.test.ts tests/unit/refund-reconciliation.test.ts tests/unit/shop-07-donation-checkout-route.test.ts tests/unit/rc1-12b-renewal.test.ts tests/unit/donation-ingestion.test.ts tests/unit/rc1-12c-donations-acceptance.test.ts tests/unit/subscription-service.test.ts tests/unit/subscription-contract.test.ts tests/unit/shop-04-payment-operations.test.ts
```

The exact ESLint/Prettier list is the application path block above **except generated `src/payload-types.ts`**, plus the four changed unit verifiers and `tests/rc1-12d/{journey.ts,provenance.ts,stripe-preload.mjs}`: 32 files. Generated types are checked by both type commands. The focused config does not erase the separately recorded full-checkout result.

Earlier development failures (missing job enum registration, attribution-result unpacking, SQL parameter type conflict during refund reconciliation, host-alias origin handling, relative test navigation and hydration timing) were repaired. Confirmed refunds were retried through the canonical path without issuing another refund. The preexisting 12C verifier TS2554 initially blocked full types and was repaired concurrently; current full types pass. A final test-loader whitespace correction was followed by a complete fresh journey/restart rerun; only the final source-bound runs count above.

## Isolation, closure and remaining scope

Only disposable container **`rc112d-20261029`**, label `rc1.scope=12d`, PostgreSQL **17.6**, database **`rc112d_release_acceptance`**, bound to **127.0.0.1:5467**, was migrated/reset/restarted. The runner checks label/database containment before setting the explicit database URL. Inspected the fresh-migration script's DROP SCHEMA behavior before use. Existing databases/media/secrets/evidence and sibling environments were preserved.

Own media: `scratch/rc112d/media`; Next output `.next-rc112d`; web 39023; loopback provider harness 3146. Worker profile `commerce-only`. Email/telecom outbound disabled. Fixture session/browser/provider data remains only in ignored scratch. Database image ID: `sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94` (`database-image.txt`), **not an application image**.

Own web/worker/browser/provider processes are stopped; own PostgreSQL container is stopped with data retained. No push, tag, publication, deployment, live charge/payout, real POD order or unsolicited message. **No open mandatory 12D blocker.** Remote provider outcomes, genuine identity ceremony, production image, broader release/recovery gates and aggregate RC1 acceptance remain outside this scoped PASS. Stop here; NEXT.md is a handoff, not authorization to run another subpass.
