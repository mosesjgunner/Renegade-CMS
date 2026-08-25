# Sovereign finance and provider boundary

The M13 commerce core owns supporter identity, product/campaign intent, entitlement decisions, immutable money snapshots, financial-event history and export shape. Processors and fulfillment providers own credentials, onboarding/KYC, network acceptance, settlement and any nonportable recurring mandate. Renegade never receives raw card data, wallet private keys/seed phrases, or pooled creator funds.

Payment methods are discovered from each scoped merchant connection's verified capability snapshot. Eligibility uses merchant account/country, selected or billing/shipping buyer country, currency, amount, recurring status and provider health; IP location is only a hint and is not an eligibility decision. A cart is single-merchant. Multi-merchant purchase requires explicit direct checkouts.

Current adapters are fixture-contract only: `fixture-hosted` proves immediate hosted checkout and `fixture-local` proves asynchronous voucher-style checkout. PayPal, Stripe, Patreon, Buy Me a Coffee, Ko-fi, POD, Reown/AppKit and chain adapters are not live claims. A provider can be disconnected without removing canonical history; exports flag processor mandates as potentially nonportable.

Crypto payment is a distinct server-verified PaymentIntent flow. A wallet connection/login cannot create, redirect, or satisfy it. Direct QR/URI/manual-wallet paths remain available; a Dogecoin adapter must be independently verified. Anchoring proves only that a hash existed at a time, not truth, ownership, copyright, identity, or legal priority.
