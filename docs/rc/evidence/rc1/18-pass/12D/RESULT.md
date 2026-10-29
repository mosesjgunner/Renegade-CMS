# 12D — NOT READY — 2026-10-29

Partial implementation and focused regression proof only. Mandatory financial lifecycle acceptance is incomplete. Aggregate RC1 remains NOT READY. No next subpass was executed.

## Source and preservation

Base HEAD `48de9a28f8c4d3e3864f271a7f14f31b546d9fd9`, with the dirty executable overlay recorded by SHA-256 in `source-tree.json`. No commit or application image was created. This is development-source test evidence, not production-image acceptance. Preexisting `tests/rc1-12c/journey.ts` edits were preserved; concurrent 12C restart evidence also appeared during execution. No previous receipt is adopted as current 12D proof. No database, media, provider, browser or Compose resources were changed or created.

Read root AGENTS.md, installed Next.js route API guidance, RC1-SCOPE.md, RC1-ACCEPTANCE-MATRIX.md, cumulative ledger, existing commerce/referral services/routes/tests/migration and 12B NEXT.md. Previous 12C RESULT.md/NEXT.md were absent when checked; only source/journey/state artifacts existed then. Their existence is not 12D acceptance.

## Actual changes

- `src/modules/commerce/referral-service.ts`: require affirmative consent when configured, require known allowed role and verified email evidence; reject commission construction with rejected attribution, mismatched site/program/version or missing order identity; reject reversal of an already reversed accrual or compensating entry.
- `src/modules/commerce/affiliate-service.ts`: validate callback event identity/status/time; detect duplicates within a batch as well as prior evidence, scoped by site/network; accept exact click identity only, excluding foreign-site, bot and consent-denied clicks; scope offer hints by site.
- `src/modules/commerce/settlement-service.ts`: summarize accrual status without counting compensating entries as payouts; approved remains unpaid eligible liability; batches exclude non-accrual entries.
- `src/app/(frontend)/api/commerce/{referrals/claim,affiliate/conversions}/route.ts`: explicitly return `projectionOnly: true, persisted: false`; conversion evaluations no longer claim `success: true`; stop defaulting referral consent to true. These routes remain projections with caller-supplied inputs, not authoritative ingestion.
- `tests/unit/shop-06-affiliate-and-referrals.test.ts`, `tests/unit/rc1-12d-financial-boundaries.test.ts`, `tests/unit/rc1-12d-projection-routes.test.ts`: strengthen existing consent setup and add regression coverage for the above boundaries and the reproducible missing-persistence blocker.

No schema/types regeneration was needed for these pure-service/response changes. Existing SQL tables do not by themselves provide working order-linked application persistence.

## Commands and counts

Executed from repository root:

1. `npx.cmd vitest run tests/unit/shop-06-affiliate-and-referrals.test.ts tests/unit/rc1-12d-financial-boundaries.test.ts tests/unit/rc1-12d-projection-routes.test.ts` — exit 0, 3 files, **31 passed / 0 failed / 0 skipped**; `tests.log`. An earlier run warned about a duplicate consent fixture key; corrected and final run clean.
2. `npx.cmd eslint src/modules/commerce/affiliate-service.ts src/modules/commerce/referral-service.ts src/modules/commerce/settlement-service.ts 'src/app/(frontend)/api/commerce/referrals/claim/route.ts' 'src/app/(frontend)/api/commerce/affiliate/conversions/route.ts' tests/unit/shop-06-affiliate-and-referrals.test.ts tests/unit/rc1-12d-financial-boundaries.test.ts tests/unit/rc1-12d-projection-routes.test.ts --max-warnings=0` — exit 0; `lint.log`.
3. `npm.cmd run typecheck` — exit 2, **1 error**: `tests/rc1-12c/journey.ts(719,12): TS2554: Expected 1-6 arguments, but got 7`; `types.log`. No full typecheck PASS claimed.
4. `npx.cmd prettier --check` with the eight changed implementation/test paths — exit recorded in `format.log`.
5. `git diff --check` — exit recorded in `diff-check.log`.

## First reproducible blocker and observed output

`rc1-12d-projection-routes.test.ts` invokes the actual Next.js conversion POST handler twice with `eventId: 12d-replay`, `amountMinor: 1000`, `currency: USD`. Both responses contain `importedCount: 1`, `duplicateCount: 0`, `projectionOnly: true`, `persisted: false`. The route passes empty existing-evidence/click/offer arrays on each invocation and performs no durable ingestion. This is a handler regression reproducer, **not HTTP/operator/browser or persisted acceptance**. Valid conversion/reversal against an immutable order and durable callback rejection have therefore not been achieved. No rows were directly mutated to manufacture outcomes.

## Mandatory acceptance still unexecuted

Eight acceptance groups remain unexecuted, not waived or counted as test skips:

1. Supported disclosed referral link and affirmative consent → canonical persisted attribution and owning immutable order.
2. Settled order → exactly one persisted commission through the real payment worker.
3. Verified refund/reversal → compensating ledger and durable duplicate callback rejection, including concurrent/reordered delivery.
4. Operator referral/commission drilldowns sourced from stored evidence, with truthful pending/unknown/payout distinctions.
5. Joint subscription/donation/affiliate supported UI/API → worker → persisted reconciliation without double counting.
6. Role/site/object/signature/origin and currency negatives against that persisted flow; focused pure-service negatives are not a substitute.
7. Actual PostgreSQL/web/worker restart and retry with pending work, proving no duplicate financial effects.
8. Isolated local provider-adapter error/unknown recovery for that joint flow.

No ordinary user/operator → actual persisted state → observed output journey was executed. No live payment, remote payout, passkey ceremony, subscription/donation acceptance or production image claim. Implementation remains incomplete; this report is not a PASS.
