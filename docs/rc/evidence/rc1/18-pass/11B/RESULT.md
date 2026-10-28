# RC1 subpass 11B - PASS

Date: 2026-10-27 (America/Chicago). Scope: persistent guest/member carts, ownership, merge and authoritative server pricing. Aggregate RC1 remains **NOT READY**. No next subpass was executed.

Base commit: `87a9ef6bb35405658ef5dd3fb94f3f95771a799e`. Changes remain uncommitted. The complete 1,459-file [source manifest](source-tree.json) has treeHash `95dc0853cfb3692ed1aafd09d538747382563ebdd9b0d509756ba07a83363a4c`. Final cart/quote actions and restart match this source; containment was checked after both runs. Documentation/evidence, dependencies, media, databases and secrets are excluded; dependency identity is package-lock.json. Earlier receipts retain their original source identities.

## Implementation and changed paths

- `src/modules/commerce/cart.ts`: canonical cart lifetime including legacy records without expiresAt; merchant isolation; bounded quantities; current variant/title/price/tax snapshots; server variant choices; shipping coupon adjustments.
- `src/modules/commerce/cart-mutation.ts` (new): allow only purchase choices; reject customer-supplied prices, totals, ownership, cart IDs and scope, malformed quantities/coupons/donations.
- `src/modules/commerce/cart-access.ts`: reject inactive/expired carts in addition to host and guest/member ownership checks.
- `src/app/(frontend)/api/commerce/cart/route.ts`: persist new-cart expiry and merchant; resolve member identity without falling back to a guest capability; reconcile changed snapshots/coupons with a new version; validate and persist variant edits, coalescing duplicate variants; serialize reads/edits/creation and return private no-store cart reads.
- `src/app/(frontend)/api/commerce/cart/merge/route.ts`: share the cart lock, restrict guest lookup to unowned active/unexpired records, preserve expiry/member identity and load merchant/time/usage restrictions.
- `src/app/(frontend)/api/commerce/proposal/route.ts`: share the lock; reject forged quote fields, expired cart/quote reads and unknown shipping rates; calculate shipping from the current subtotal and tax from current discounted lines and the selected offer's tax mode.
- `src/modules/commerce/pricing.ts` and `tax.ts`: preserve exact tax allocations, handle inclusive/exclusive/exempt lines without adding inclusive tax twice, reject inconsistent allocations. Pricing rule version is `2026-10-27.1`.
- `src/modules/commerce/promotions.ts`: deny customer-limited discounts when authoritative customer usage history is unavailable. All three route mappers preserve zero usage limits and promotion time windows.
- `src/modules/commerce/CartView.tsx`: ordinary variant selector and explicit guest-to-member merge action; truthful quote/shipping/tax copy.
- Added recent/null-expiry and expired legacy ownership coverage to `tests/unit/commerce-cart-access.test.ts`.
- New `tests/unit/rc1-11b-cart-boundaries.test.ts` and `tests/rc1-11b/{journey.ts,run.ps1,provenance.ts}`: focused boundaries, isolated runtime/browser/persistence proof and source containment.
- Next dev updated its generated `next-env.d.ts` import and added `.next-rc111b` type includes to the already modified `tsconfig.json`. Unrelated preexisting edits were preserved.

Existing collection fields and JSON cart/quote snapshots were reused; no schema migration or Payload generated-type change was needed. Fresh migration verification applied all 127 existing migrations and reran them idempotently.

## Executed ordinary paths and persisted observations

Two independent genuine Chromium guest contexts and a member browser exercised product add, quantity edit, cart variant edit, reload and explicit UI merge into an existing member cart. Products and promotions were created through supported operator REST/catalog review APIs. Guest A persisted two units at 2400 minor units, edited to three at 3600 and added another SKU at 4800. Guest B retained a separate cart and edited its variant in the cart UI at 1200. The member first added its own unit; UI merge combined quantities to four small plus one large at **6000**, retained member ownership and retired the original guest token/record. Merge replay did not duplicate items or affect Guest B.

An ordinary catalog edit/review/republish changed price from 1200 to 1750. Cart read/reload returned and persisted **8750** for the five units. The authoritative physical quote persisted subtotal 8750, free qualifying shipping, bounded TX tax 546 and **9296** grand total. A UI-applied 10% coupon persisted discount 875; its quote used discounted taxable amount 7875, tax 492 and **8367** total. Expiring the promotion restored 8750 and removed its persisted cart code. A guest quote below the shipping threshold returned 1750 + 500 shipping + 109 tax = **2359**; the supported free-shipping coupon reduced net shipping to zero and total to **1859**. Amounts are USD minor units and use the existing bounded integer tax rounding policy.

Actual PostgreSQL-backed documents were refetched throughout. [journey.json](journey.json) records 37 passing assertions; [persistence.json](persistence.json) is an independent sanitized SQL projection after restart, including ownership, versions, SKUs, prices, quote snapshots and zero orders/payment intents. [state.json](state.json) identifies the final records. [cart.png](cart.png) shows the current member cart after consent was rejected through the real UI; SHA-256 `e24ffd152375c3f3eba3decee494aa307672b7b30c3906ba93d4d676df11b58a`.

Authentication boundary: genuine anonymous browsers; member session issued/consumed through the canonical magic-link service as a fixture and installed in the browser; fixture signed operator sessions. `LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`. This proves cart business UI/API behavior and persisted session ownership, **not** ordinary member login, SMTP delivery or passkey acceptance.

## Negatives, concurrency, error and restart

Executed: forged cart-ID/site/merchant/price fields and fractional quantities (400, both carts unchanged); foreign-site item (404); same-site other-merchant item (409); guessed native cart mutation (403); guessed member quote read by the other guest (403); forged quote totals (400); invented free shipping rate (400); unavailable tax jurisdiction (422); merge replay (400, no duplication); zero-use coupon and customer-limited coupon without usage history (removed, persisted total unchanged). Two simultaneous edits with the same expected version yielded exactly one 200 and one 409.

Controlled expiry proof used supported operator REST to shorten only expiresAt, then waited for the deadline. No business status row was directly flipped. Expired quote read and checkout initiation returned 409 before any payment operation. Expired guest-cart lookup returned null and edit returned 404; a new browser purchase created a different persistent capability. No orders or payment intents were created.

Stopped and started the dedicated PostgreSQL container and launched a fresh Next process. Retained member and guest browser cookies resolved the correct canonical cart IDs and exact 8750/1750 totals; persisted items, converted guest state and the retained immutable quote amount survived. [restart.json](restart.json): 6 passed. No worker or provider retry is involved in these cart operations.

Per-customer usage-dependent discounts fail closed until authoritative history is available; no successful redemption-history or settlement enforcement is claimed. Mixed inclusive/exclusive/exempt tax is covered by focused unit tests; the runtime quote journey used exclusive physical offers and the configured local shipping/bounded TX tax adapters. No remote provider, tax certification, successful payment, fulfillment, production build or application-image acceptance is claimed.

## Commands and counts

All accepted final commands exited **0**.

| Command | Result / artifact |
| --- | --- |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-11b/run.ps1 migrate` | 127 fresh migrations, idempotent second run, physical schema assertions; migrations.log |
| `npx.cmd tsc --noEmit` | Full checkout, 0 diagnostics; types.log |
| `npx.cmd eslint <cartPaths> --max-warnings=0` | 0 errors/warnings; lint.log |
| `npx.cmd prettier --check <cartPaths>` | Pass; format.log |
| `npx.cmd vitest run <unitFiles>` | 4 files, 45 passed / 0 failed / 0 skipped; unit.log |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-11b/run.ps1 journey` | 37 passed / 0 failed / 0 skipped; journey.log, web.log |
| `docker stop rc111b-20261027` then `docker start rc111b-20261027` | Real database process restart, retained data |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-11b/run.ps1 restart` | 6 passed / 0 failed / 0 skipped; restart.log, restart-web.log |
| `node --import tsx tests/rc1-11b/provenance.ts --check` | 1,459 files match the final treeHash |
| `docker exec rc111b-20261027 psql -U postgres -d rc111b_release_acceptance -At -c 'SELECT count(*) FROM payload_migrations;'` | 127 |
| `git diff --check` | Exit 0; preexisting CRLF warnings only; diff-check.log |

Exact `<cartPaths>`: the ten application paths listed above, `tests/rc1-11b/*.ts`, `tests/unit/rc1-11b-cart-boundaries.test.ts`, and `tests/unit/commerce-cart-access.test.ts`.

Exact `<unitFiles>`: `tests/unit/rc1-11b-cart-boundaries.test.ts`, `tests/unit/commerce-cart-access.test.ts`, `tests/unit/shop-02-carts-and-proposals.test.ts`, `tests/unit/shop-02-tampering-and-invariants.test.ts`.

Accepted totals: **45 units + 43 runtime assertions = 88 passed; 0 failed; 0 skipped; 0 mandatory 11B groups unexecuted**. Broader full-unit/integration/build/image/provider gates were not run. Earlier unaccepted diagnostics: migration attempted before the new image/container finished starting; a missing scratch directory; one browser iteration filled controls before hydration (observed quantity 1 instead of 2, retained in earlier-harness-failure.json); one prefer-const lint diagnostic. These were repaired without weakening expected totals, and affected checks reran. Later iterations added variant, tax, shipping and usage-rule coverage, dismissed consent through the UI and repaired null-expiry legacy ownership. The complete journey and restart reran after that final repair.

## Isolation and exit

Only new container `rc111b-20261027`, label `rc1.scope=11b`, ID `28c7c33591bdaebdc815c72b463f14596e37c830674465aba82a03156523f005`, loopback port 5460, DB `rc111b_release_acceptance`, media `scratch/rc111b/media`, Next output `.next-rc111b`, web port 39016 and private browser contexts were used. The destructive fresh-migration script was inspected before running against this new target. Docker inspect `.Image`: `sha256:b8faeff7712663c2773a190181e1246e37e364b887611c04658c28b44e2408fe`. Runtime was Node v24.19.0 and installed Next.js 16.3.8 development source; no application production image was built.

Own web/browser processes and PostgreSQL container are stopped; disposable data retained. Existing databases, media, secrets, sibling environments and earlier evidence were not reset or overwritten. No commit, push, tag, external publication or deployment.

**11B PASS. Open scoped blockers: none.** See [NEXT.md](NEXT.md); stop here.
