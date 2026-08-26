# Project state

## Second Pass Prompt 10 — Calendar Center and Graphics Studio

- Added the `/calendar` orchestration surface with Month, Week and Agenda controls, scoped/My Calendar filters, timezone presentation, status/type indicators, unscheduled and conflict affordances, canonical edit links, and optimistic drag feedback.
- Added `CalendarProjection` contracts and a server command router. Dragging a `content-release` calls `scheduleContentRelease`; no calendar timestamp is copied into a release record. Native calendar and social queue updates retain their own canonical audit/recovery paths.
- Added the canonical `ContentRelease` collection and scheduling command, including idempotency and append-only schedule audit data.
- Added lightweight template-based graphics service: quote, article-social, OG, podcast, YouTube thumbnail, book/chapter promo, product, event, announcement and donation/campaign presets. It verifies asset export/rights state before creating `GraphicDocument`, `MediaDerivative`, and `MediaUsage` records.
- Graphic Documents now carry ownership scope, template, and registered layout-variant keys for later approved experimentation targeting. No Experiment schema was introduced.
- Focused unit suite and TypeScript validation pass. Database migration generation and integration acceptance require the project PostgreSQL service.

## Second Pass Prompt 11 - Forms, subscribers, and newsletters

- Registered the canonical Audience collection family and durable Payload jobs: form definitions/versioned locale schemas/submissions, CRM and workflow links, lists/segments/memberships, subscribers, one-time confirmation tokens, consent evidence, preferences/suppressions, messages/deliveries and notifications.
- Public form submission validates the published schema, uses a honeypot hook and idempotency key, preserves the exact reviewed consent wording/revision/schema version, and refuses outdated or machine-generated localized legal text. Attachments remain private, allowlisted and scan-pending through the safe-upload contract.
- Double opt-in confirmation tokens are opaque, hashed, expire after 24 hours and are consumed once. Unsubscribe uses a signed token; provider bounce/complaint webhooks require `EMAIL_WEBHOOK_SECRET` signatures before suppression is recorded.
- Newsletter review enforces the email-safe block set, checks DAM approval and registers `MediaUsage` for image assets. Scheduled sends dispatch in a durable job and create one idempotent delivery per eligible recipient; delivery workers re-check suppression and retry provider failures without affecting website or subscriber records.
- Translation Operations integration is represented by `translationProject` and `localeCompleteness` snapshots on localized form schemas/messages; reviewed consent is mandatory for non-source locales. CTA button blocks expose an explicit `experimentTarget` hook reserved for Prompt 14, with no hidden personalization.
- Focused TypeScript and unit validation pass. A database migration must be generated against the configured PostgreSQL schema before database-backed acceptance; generation was intentionally not retained without that schema because it duplicated Prompt 10 objects.

## Second Pass Prompt 12 � Canonical Storefront, Cart, and Provider-Neutral Checkout

- Registered the canonical commerce family: merchant connections, capability registry records, products, carts, checkout sessions, payment intents, orders, and verified webhook-event replay records. Products support physical, digital, POD-reference, subscription, and membership shapes, variants/SKUs, multi-currency minor-unit prices, inventory and POD hooks, entitlement keys, collections/categories, localized text, approved governed media, and release revision pinning.
- Added `/store`, `/cart`, canonical public product rendering, server-side checkout initiation, a bounded checkout-expiration Payload job, and a webhook endpoint. Checkout re-evaluates merchant/site/space scope, buyer and merchant country, currency, amount, purchase recurrence, capability configuration, and provider health. Client callback/redirect data cannot confirm a payment.
- Development Stripe, PayPal, Mollie, and bank-transfer fixture adapters follow the same registry contract: hosted immediate flows and asynchronous transfer flow are covered; production adapters must be supplied through the existing connection/credential-reference boundary and signed webhook verification. Provider outage returns no eligible method / a safe unavailable response.
- Webhook processing verifies an HMAC before use, records provider-event identity for replay protection, appends financial history idempotently, transitions checkout/order state only from the verified event, and cannot duplicate an order on replay. Refund, shipping and tax are explicit extension fields/boundaries.
- Product localized fields carry Prompt 2 review snapshots; locale routing and public formatting use the existing locale infrastructure. Legal/payment copy is persisted as reviewed checkout copy and is never machine-translated implicitly. Content release publication references products/revisions only; it has no payment initiation path.
- Focused `npm run typecheck` and commerce unit acceptance validation pass. A PostgreSQL migration should be generated from the registered collection schema against the configured database before database-backed deployment, consistent with prior second-pass modules.

## Part A.5 � Local Point-of-Sale / QR Crypto Payments

- Extended the existing Cart ? Order ? PaymentIntent commerce path with an intent-bound, provider-neutral crypto POS invoice contract. It captures the remote rate-provider/manual quote provenance, fiat amount, exact crypto amount, network, asset, destination, reference, expiry, confirmation requirement and no-secret boundary. QR URIs encode that one invoice; permanent wallet-address-only QR codes are not used where invoice identifiers/references are supported.
- Added a responsive `/pos` surface and local QR encoder, plus POS states, inventory/receipt idempotency, reorg/reconciliation handling, merchant display-config fields (through existing connection configuration), and optional extension capability boundaries. Blockchain observations must be server/adapter verified; customer transaction hashes and UI callbacks do not prove payment.
- Focused POS tests cover QR exactness/binding, wrong payment characteristics, expiry, amount variance, duplicate observations, confirmation progression, reorg, quote expiry/manual fallback, and Space/role isolation. No local node, custodial wallet, private key, seed phrase or signing secret is required or retained.

## Second Pass Prompt 13 � Renegade Simple Crypto Pay, Crowdfunding, and POD

- Extended the canonical `PaymentIntent`, `Campaign`, `Order`, `Supporter`, and `Entitlement` record families. No parallel financial ledger, wallet-auth flow, or private-key storage was introduced.
- Noncustodial crypto invoices bind exact atomic amount, asset, network, creator destination, standard URI/QR payload, expiry, confirmations and append-only transaction observations. EVM-compatible and Dogecoin fixture adapters plus the manual reconciliation boundary are represented; a submitted hash is only a server-side adapter lookup hint. Wrong destination/network, duplicate observations, under/overpayment, late payments and reorgs stay unconfirmed or enter a scoped reconciliation/exception path.
- Campaigns now carry public/private visibility, scheduling, goal/progress history, milestones, update visibility, tiers/perk Product references, Calendar and newsletter/social hooks, supporter visibility, and entitlement/fulfillment references. The public projection removes private updates and all private campaigns.
- Printful/Printify-compatible POD adapters submit governed artwork exactly once with an order idempotency key; `Order.fulfillmentExtension` holds only external status/tracking. Restricted/unapproved artwork is rejected before submission, signed webhook verification is available, and provider failure is scoped to the affected fulfillment/order exception state.
- Verification: `npm run typecheck` and focused Prompt 13 Vitest acceptance coverage pass. Database migration generation remains dependent on the configured PostgreSQL service, consistent with earlier second-pass handoffs.
