# RC-05 Pass 3 final gate — FAIL

Date: 2026-10-05 (America/Chicago). Inspected HEAD: `e25f1b554eeae6e898d754822c64181f4b8040cc`, with pre-existing working-tree changes. This is not an immutable candidate claim.

AGENTS.md and the RC control plane were read. No completed RC-05 Pass 1/Pass 2 commits, evidence, or RC-05 acceptance harness were found in the local branches/worktrees or workspace filename search. RC_SCOPE does not contain an accepted RC-05 subset. Consequently there is no identifiable RC-05 change set to clean without widening this small pass into implementation work. Existing changes were preserved; no commerce source or tests were modified.

## Executed verification

The existing focused commerce, SHOP, subscription and donation unit suites passed: 19 files, 161 tests, no skips. This covers helper/adapter contracts, including tampering, signature and replay cases; it is not normal admin/public checkout, PostgreSQL inventory concurrency, provider settlement or tenant browser acceptance. Typecheck, zero-warning lint and production build passed.

The initial literal wildcard Vitest invocation selected no tests and exited 1. The corrected invocation used file paths enumerated by `rg --files tests/unit`, filtered for commerce, SHOP, subscription and donation; all selected tests passed. No assertion was weakened.

RC-05 catalog/checkout browser acceptance, DB-backed shared commerce/affiliate/POD regression, canonical settlement/retry/isolation and inventory race acceptance were not run. No completed prior-pass harness or approved acceptance fixture was found. Existing integration fixtures use privileged internal creation and cannot alone establish ordinary admin/public workflow proof. Existing local data was not reset.

## Concrete blockers and capability truth

- `src/modules/commerce/pod-real-provider.ts`: `uploadPrintFile` fabricates a Printful file ID and URL without uploading; `preflight` fabricates a mockup URL and labels provenance `provider`. This confirms the existing provider-matrix blocker.
- `src/modules/admin/PodMappingCenter.tsx` seeds an approved emulator mapping when no initial mappings exist. This is not configured Printful/Printify manufacture or shipping proof.
- Payment adapters include deterministic local and Stripe test boundaries; no current RC-05 configured-provider settlement acceptance is available. Local/test success must not be promoted to live settlement.
- Subscription, donation, affiliate payout and POD capabilities have no current RC-05 accepted or deliberately deferred subset. Unit success does not promote their status or establish product deferral.
- No RC-05 browser responses, screenshots, provider configuration captures or logs were available for the requested final secret inspection. Source inspection did not establish an accidental exposed provider secret, but runtime secret hygiene remains unproven.

Verdict: **FAIL**. Obtain/merge completed Pass 1 and Pass 2 work, repair the fabricated provider outcomes or explicitly defer their product surfaces, then rerun the missing acceptance and final regression on an identified candidate. RC-06 remains gated on RC-05; this report does not authorize advancing automatically.

## Current-tree verification recheck — 2026-10-05

HEAD remains `e25f1b554eeae6e898d754822c64181f4b8040cc`; pre-existing changes remain present. `git log --all` found no RC-05-labelled commits, the registered worktree inventory identifies no completed RC-05 candidate, and the RC evidence filename inventory contains only this report for RC-05. Pass 1/Pass 2 completion cannot be established from this checkout. No identifiable RC-05 source change set was available for targeted cleanup, so commerce source and tests were preserved.

Executed again, without assertion changes:

- Explicitly enumerated commerce/SHOP/subscription/donation unit paths: **19 files / 161 tests passed**, no skips.
- `tests/integration/shared-contract-affiliate-pod.integration.test.ts`: **1 file / 28 tests passed**, no skips. This suite exercises in-memory contracts, emulator adapters, injected provider responses and static rendering; it does not prove database persistence, payout execution, manufacture or shipping.
- `npm.cmd run typecheck`, `npm.cmd run lint` (zero warnings), `npm.cmd run build`, and `git diff --check`: **passed**.

Normal admin/public catalog-checkout acceptance, DB-backed shared commerce and local-donation integration, real worker partial-failure/retry, canonical webhook side-effect deduplication, persisted tenant/order isolation and inventory concurrency remain **NOT RUN** in this recheck. The historical browser verifier creates actors/data through privileged internals and deletes known product slugs; it was not run against existing local data. Unit adapter/signature/replay success does not close those acceptance gates.

Claim reconciliation confirms the local checkout page explicitly says no real money is charged; the Stripe adapter accepts test keys only; CommerceOperations displays provider keys, states and quarantined reconciliation cases; recurring-donation campaign pages state that online recurring checkout is unavailable. The current frontend `/admin/fulfillment` route renders an unavailable workspace. The demo FulfillmentCommandCenter still mounts PodMappingCenter in its own source, but that fact alone does not prove the current frontend route exposes the sample mapping. The historical provider-matrix findings remain open: Printful `uploadPrintFile` synthesizes remote identifiers/URLs, and `preflight` synthesizes a mockup URL with provider provenance. No configured-provider settlement, automated affiliate payout, Printful/Printify manufacture or carrier delivery is approved by this pass. Subscription and affiliate entry points remain present; they are **BLOCKED / UNPROVEN**, not newly product-deferred. Historical FEATURE_READINESS is already marked superseded by the RC ledger.

Secret inspection compared both configured commerce/provider secret values of at least 12 characters against 378 text files in `.next/static` and `docs/rc/evidence`: **zero matching files**. Values were not printed. Credential/status contract tests passed. This is a limited exact-value text check, not an assertion about transformed secrets, runtime browser responses, logs outside those paths, or screenshots. No RC-05 runtime capture set exists here for that final inspection.

Final verdict remains **FAIL**. Missing prior-pass acceptance and the fabricated Printful provider outcomes are concrete blockers; passing baseline checks does not override them. NEXT remains RC-06, gated until RC-05 is repaired and accepted.
