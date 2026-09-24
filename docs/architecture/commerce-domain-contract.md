# Commerce domain contract

`products` is the canonical catalog. A cart is a customer selection only. At initiation Commerce reads the published Product, Variant and Offer/Price, calculates integer minor-unit lines, and pins those lines on the PaymentIntent. The resulting Order holds that immutable snapshot; neither a cart update nor a return redirect can change it.

Only a provider-authenticated event advances Payment truth. `payment-webhook-events` retains signature-verified, deduplicated evidence and `financialEvents` is append-only. Redirects, wallet login callbacks, client totals and submitted crypto transaction details are non-authoritative. Unknown/timeout remains pending and is reconciled; it never becomes paid by timeout.

| Canonical record                                       | Provider projection / retained extension |
| ------------------------------------------------------ | ---------------------------------------- |
| Product, Variant, Offer/Price, Inventory               | POD inventory/provider reference         |
| Cart, CheckoutSession, PaymentIntent, PaymentAttempt   | hosted action URL/provider reference     |
| immutable Order lines, Receipt, Refund/Dispute         | provider event evidence                  |
| Fulfillment instruction, POD job                       | shipping/tracking provider status        |
| Subscription, Entitlement                              | processor mandate/subscription reference |
| Donation/Campaign, Affiliate offer/referral/commission | external source reference                |

The forward migration adds pinned `payment_intents.order_lines`, payment-attempt and fulfillment-instruction records, plus a quarantine table. Any legacy record that lacks a single site, currency, immutable amount, or verified provider correlation stays in `commerce_reconciliation_cases` with its evidence and is never backfilled into paid state. Exports exclude credential references, webhook payloads and provider secrets; backups retain operational Commerce records under the existing encrypted operational backup boundary.

Settlement creates one receipt and derives entitlement/fulfillment instructions exactly once. Refund/dispute events do not erase the payment evidence; they append compensating evidence and move the order to refunded/exception. Fulfillment failure is operationally visible and cannot silently reverse payment.
