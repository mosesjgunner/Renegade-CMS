# Handoff after 11C

11C PASS for the checkout, merchant selection, and payment settlement scope in [RESULT.md](RESULT.md). 69 unit tests, 32 runtime browser/API/webhook/race/reconciliation/negative assertions, and 3 post-restart assertions passed; full repository TypeScript (`tsc --noEmit`), focused ESLint/Prettier, 127 fresh migrations, and source containment pass. Aggregate RC1 remains NOT READY.

Base `87a9ef6bb35405658ef5dd3fb94f3f95771a799e` plus 1,463-file source manifest treeHash `09e0fe21b4d33250aefb358c002bdb836d73a540b88572ac32dbfd314095d9a7` ([source-tree.json](source-tree.json)). Uncommitted changes and prior unrelated edits remain. Preserve prior receipts and rerun affected complete acceptance after source changes.

## What 11C established for downstream subpasses (11D+)
- **Merchant & Payment Method Selection**: `eligiblePaymentMethods(...)` enforces active site (`siteId`), space (`spaceId`), merchant connection (`merchantConnectionId`), enabled state, provider health, currency, and required product capabilities.
- **Authorized Checkout & Local Test Confirmation**: `POST /api/commerce/checkout/initiate` enforces origin CSRF, host-to-site binding, actor ownership, and proposal/session execution locks (`commerce.checkout.initiate:<id>`). Both guest checkout cookies and authenticated member cart owners can view and confirm `/checkout/test/[reference]` (`canConfirmTestCheckout`).
- **Webhook-Authoritative Settlement & Race/Disagreement Safety**: Browser return redirects never settle payments. `processPaymentEventTask` serializes per attempt (`commerce.payment-attempt:<attemptId>`), records verified events on `payment-intents.financialEvents`, deduplicates replays, ignores out-of-order lower-sequence regressions after settlement, and quarantines `amount-or-currency-mismatch` and `terminal-success-conflict` into `commerce-reconciliation-cases` without creating orders.
- **Reconciliation & Order View**: `POST /api/admin/commerce/reconcile` enforces site-scoped operator grants (`403` on foreign site) and recovers `unknown` attempts via provider idempotency/reconcile truth. `/api/commerce/checkout/status` and `CheckoutStatus.tsx` expose immutable settled totals, line items, receipt numbers, and digital download links.

Own `rc111c-20261027` PostgreSQL container (`127.0.0.1:5461`, DB `rc111c_release_acceptance`) and web/browser processes (`port 39017`, `.next-rc111c`, `scratch/rc111c`) are stopped and retained. Do not rerun destructive migrations against retained evidence or touch sibling resources.

Await the next explicit subpass assignment (11D). No next subpass was executed.

