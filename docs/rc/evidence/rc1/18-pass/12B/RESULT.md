# RC1 12B — renewals, cancellations, invoices and dunning

**12B scoped PASS — 2026-10-28 (America/Chicago).** 71 unit tests + 43 ordinary journey assertions + 8 PostgreSQL/web/worker/browser restart assertions = **122 passed, 0 failed, 0 skipped; 0 mandatory 12B assertions unexecuted**. Aggregate RC1 and whole-checkout readiness remain NOT READY. Full-checkout typechecking has a separate concurrent 12C verifier failure; the scoped compile passes.

## Exact source and preservation

Base commit: `ed1ec703ef0401d0876932c310d6f831fc74aef4`. No commit, reset, clean, push, tag, publication or deployment was made. Existing commerce edits, databases, media, secrets and historical receipts were preserved. Read AGENTS.md, installed Next.js route-handler guidance, current scope/matrix and 12A RESULT/NEXT. The commerce validation skill supplied disposable-resource and proof boundaries.

Two exact dirty-tree manifests retain the verifier provenance:

- [Journey manifest](journey-source-tree.json): 1,492 files; treeHash `10b3c47f77648fdc74dc9640523ae2252aca52970fead021d37cde03c2b2251f`; its exact verifier is archived as [journey-verifier.ts.txt](journey-verifier.ts.txt).
- [Restart manifest](source-tree.json): 1,492 files; treeHash `886c04aedf5ac1f234ec38dc309e9300fea4db7503bba1870c758395183264ef`. The restart verifier selects the original contract by ID instead of list position after the second contract exists, and adds a fresh browser assertion.
- [Containment](containment.json) and [executable checker](check-containment.mjs) verify identical application/runtime source across both proofs, the exact archived journey verifier, and the current restart verifier. Generated Next declaration pointers and concurrent 12C verifier changes are recorded with hashes. Strict whole-tree equality is false; no whole-checkout or 12C acceptance is implied. No 12C journey or test was executed here.

Node v24.19.0; Next.js 16.3.8 development runtime. Package-lock identity is in both manifests. No application image was built or accepted. PostgreSQL image/resource identity is in [isolation.json](isolation.json).

## Implemented changes

- `src/modules/commerce/subscription-reconciliation.ts` (new), `subscription-service.ts`, `tasks.ts`: shared provider lock and real transaction bind subscription projection, stable entitlement keys, immutable reconciliation ledger and deduplicated in-app notices. Grace is anchored once to failure evidence, never moved by retries. Expired/canceled projections remain recoverable from authoritative provider reads. Unknown state retains bounded last-known access without inventing renewal. Ambiguous/unmapped or premature plan changes fail closed; immutable period-end change timing is checked. Dispute/refund holds remain paused. Subscription pagination and abandoned billing-job lease recovery are wired to the canonical worker.
- `src/app/(frontend)/api/commerce/webhooks/[provider]/route.ts`: unknown provider lookup rolls back the event marker and all effects, allowing the exact signed event to retry. Current provider projection governs cancellation and period state rather than stale event fields. Failed payment atomically caps grants at the grace deadline before any worker runs. Signed invoice identity and amounts persist in the existing immutable subscription-event ledger.
- `src/modules/commerce/payment-provider.ts`: reject unknown/malformed subscription projections, retain invoice identity and actual paid/due amounts, and preview replacement of the identified existing subscription item. Missing estimate data cannot become a fabricated zero estimate. Preview parameter usage follows the [Stripe API contract](https://docs.stripe.com/api/invoices/create_preview).
- `src/app/(frontend)/api/commerce/subscriptions/route.ts`, `src/modules/commerce/MemberBilling.tsx`: personal/site-scoped invoice history, paid-over-late-failure reconciliation, grace and unknown-state display, and strict action/field allowlisting. Changes/cancellations continue through the real adapter's customer-owned hosted billing handoff.
- `src/app/(frontend)/api/admin/commerce/reconcile/route.ts`, `src/modules/admin/CommerceOperations.tsx`, `src/scripts/run-jobs-worker.ts`, `src/payload-types.ts`: authorized-site subscription reconciliation API/button, commerce schedule dispatch, and generated task input types. Existing collections/JSON fields suffice; no schema migration was added.
- `tests/rc1-12b/{run.ps1,journey.ts,stripe-preload.mjs,provenance.ts}` and `tests/unit/rc1-12b-{renewal,provider}.test.ts`: isolated adapter/UI/operator/worker/PostgreSQL proof and focused regressions. Preexisting 12A implementations and unrelated edits were reused.

## Ordinary actions, persistence and observed output

Fixture-authenticated Chromium signs up through member billing and the actual Stripe-test adapter's loopback hosted page. A signed invoice settles one canonical order. Renewal persists an extended billing period, a separate paid invoice and exactly two stable grants. Billing visibly shows the invoice and next billing. Concurrent replay does not create another checkout, invoice or grant.

A provider outage rolls back a signed event. Supported owner `POST /api/admin/commerce/reconcile` with `{siteId,kind:"subscriptions"}` queues actual worker execution: billing reports unknown provider state while access remains time-bounded. Recovery accepts the same event once.

A signed failed renewal persists the failed invoice and grace-bound entitlements immediately. The worker is killed while blocked on its real adapter read; subscription/ledger/grants remain unchanged. Canonical `recoverStaleCommerceJobs(payload,1000)` reopens the abandoned job bookkeeping, and a fresh worker applies one in-app dunning notice. This is a shortened stale-age service invocation plus actual worker restart, not a claim that the production ten-minute interval was elapsed autonomously. Repeated workers keep the deadline and notice count fixed. Access expires with the worker stopped; a later worker persists expiry and one expiry notice. Payment recovery marks that invoice paid and restores stable grants.

The customer schedules cancellation in the hosted billing portal, retains contractual access, and withdraws the request. A later invoice cannot unschedule cancellation. The customer previews and confirms the mapped annual plan, then immediately cancels under that plan's policy: database state becomes canceled, grants are revoked, and billing displays canceled. A separate monthly customer contract is scheduled through the same portal and ends through the worker at its actual deadline.

[43 journey assertions](journey.json), [persisted state](persistence.json), [IDs](state.json), [8 restart assertions](restart.json), [restart persistence](restart-persistence.json), [fresh browser text](restart-display.txt) and [billing screenshot](billing.png) bind the observations. After actual PostgreSQL and fresh Next/worker/browser restart, the exact original ledger/subscription/grant rows match; both contracts display canceled, the paid renewal invoice remains visible, copied download access stays denied, and replay never regrants access.

Final [SQL readback](final-readback.log): 127 migrations, 2 canceled contracts, 16 unique ledger events with 16 distinct keys (7 invoice events), 4 revoked grants, 1 paid original order and 1 pending-payment second signup order. The second signup's activation/cancellation was never represented as collected payment. No business status row was directly flipped.

## Commands, exits and counts

All commands ran from the repository root. Wrapper configuration is process-only and verifies the named container label/database before destructive fresh migration.

| Command | Exit | Result |
| --- | --- | --- |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-12b/run.ps1 migrate` | 0 | 127 fresh migrations plus idempotent second application; [log](migrations.log). |
| `npm.cmd exec vitest -- run tests/unit/rc1-12b-provider.test.ts tests/unit/rc1-12b-renewal.test.ts tests/unit/subscription-contract.test.ts tests/unit/subscription-plans.test.ts tests/unit/subscription-service.test.ts tests/unit/subscription-provider-plan-mapping.test.ts tests/unit/rc1-12a-plan-boundaries.test.ts tests/unit/shop-04-payment-operations.test.ts` | 0 | 8 files / 71 passed / 0 failed/skipped; [log](unit.log). |
| `npm.cmd run generate:types` | 0 | [log](types-generation.log); only billing task input generated type changes. |
| `npm.cmd exec tsc -- --noEmit --project scratch/rc112b/tsconfig.json` | 0 | Focused application/12B compile; [configuration](types-scope.json), [log](types-scoped.log). Excludes only concurrent `tests/rc1-12c/**/*` in addition to inherited exclusions; no application modules removed. |
| `npm.cmd run typecheck` | 1 | Whole-checkout failure: `tests/rc1-12c/journey.ts(717,12): TS2554 Expected 1-6 arguments, but got 7`; [log](types.log). Preserved and not repaired outside this subpass. |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-12b/run.ps1 journey` | 0 | 43 passed / 0 failed/skipped on the archived exact verifier/runtime; [log](journey.log). |
| `docker restart rc112b-20261028` | 0 | Actual PostgreSQL process restart with retained data. |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-12b/run.ps1 restart` | 0 | Corrected exact restart verifier: 8 passed / 0 failed/skipped; [log](restart.log). |
| `node docs/rc/evidence/rc1/18-pass/12B/check-containment.mjs` | 0 | Both tested runtime trees match; verifier/archive and concurrent differences recorded. |
| `git diff --check` | 0 | Existing work preserved. |

Exact focused lint/format commands (exit 0; [lint](lint.log), [format](format.log)):

```powershell
npm.cmd exec eslint -- src/modules/commerce/subscription-reconciliation.ts src/modules/commerce/subscription-service.ts src/modules/commerce/tasks.ts src/modules/commerce/payment-provider.ts src/modules/commerce/MemberBilling.tsx src/modules/admin/CommerceOperations.tsx src/scripts/run-jobs-worker.ts 'src/app/(frontend)/api/admin/commerce/reconcile/route.ts' 'src/app/(frontend)/api/commerce/subscriptions/route.ts' 'src/app/(frontend)/api/commerce/webhooks/[provider]/route.ts' tests/rc1-12b/*.ts tests/rc1-12b/stripe-preload.mjs tests/unit/rc1-12b-renewal.test.ts tests/unit/rc1-12b-provider.test.ts
npm.cmd exec prettier -- --check src/modules/commerce/subscription-reconciliation.ts src/modules/commerce/subscription-service.ts src/modules/commerce/tasks.ts src/modules/commerce/payment-provider.ts src/modules/commerce/MemberBilling.tsx src/modules/admin/CommerceOperations.tsx src/scripts/run-jobs-worker.ts 'src/app/(frontend)/api/admin/commerce/reconcile/route.ts' 'src/app/(frontend)/api/commerce/subscriptions/route.ts' 'src/app/(frontend)/api/commerce/webhooks/[provider]/route.ts' tests/rc1-12b/*.ts tests/rc1-12b/stripe-preload.mjs tests/unit/rc1-12b-renewal.test.ts tests/unit/rc1-12b-provider.test.ts
npm.cmd exec eslint -- tests/rc1-12b/journey.ts
npm.cmd exec prettier -- --check tests/rc1-12b/journey.ts
```

The final two commands recheck the restart verifier after its ID-selection/browser correction ([lint](journey-lint.log), [format](restart-format.log)). Development attempts caught a harness clock anchored too early, a provider-preview fixture loaded before item-ID support, a browser assertion before billing loaded, and restart selection by list position. Assertions were retained; final complete journey/restart gates above supersede those attempts. Earlier full-type errors also tracked concurrent 12C edits. A progress message incorrectly inferred full type success from a shell's last-command exit; explicit exit capture corrected that claim. Whole-checkout types do not pass.

## Negatives, isolation and limits

Proved foreign operator/member/host denial; another member cannot claim a portal or list invoices; missing CSRF, unsupported/forged billing fields, invalid plan writes and forged provider signatures are denied. Even owner native REST cannot fabricate subscription state. Stale cancellation and late paid events retain ledger evidence without reviving access; concurrent duplicates are harmless. Unknown provider outcome remains unknown, and exact-event retry succeeds after recovery.

Own resources only: stopped container `rc112b-20261028`, retained `rc112b_release_acceptance`, PostgreSQL 5465, web 39021, harness 3145, media `scratch/rc112b/media`, Next `.next-rc112b`. Web/browser/worker/harness processes exited and these ports no longer listen. No Compose project or existing database/media was reset. Credentials/sessions/harness state remain under ignored scratch, outside published evidence. Re-running `migrate` intentionally discards only this disposable proof schema; do not run it to inspect retained evidence.

This is local adapter-harness billing and fixture-authenticated business UI/API proof. Six additional groups remain unexecuted/excluded: remote Stripe sandbox, live billing, genuine passkey enrollment/login, full test suite, production application build/image, and external email delivery. Notices here are actual persisted in-app notifications. No mandatory local/adapter/security/restart 12B group is waived or unexecuted.

Open 12B blockers: **none**. Separate whole-checkout blocker: concurrent 12C verifier type error above. Stop at 12B; aggregate RC1 remains NOT READY.
