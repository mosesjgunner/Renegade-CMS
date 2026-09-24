# SHOP-01 catalog workflows

Status: implemented; live PostgreSQL and browser acceptance remain required before release verification.

## Ownership

`products` is the site-scoped catalog authority. Presentation layouts may reference a product, but must not contain authoritative SKUs, prices, inventory, affiliate destinations, POD identifiers, or digital file URLs. Provider IDs are projections in reviewed POD/affiliate policy snapshots. Payment credentials do not control whether a published catalog can be browsed.

The repository audit found no storefront component that treats page-layout JSON as catalog authority. The retained legacy `products.prices`, variant `attributes`, `podReference`, and merchant/provider configuration fields are compatibility inputs only: catalog-contract products must publish versioned `offers`, explicit `optionValues`, and reviewed mappings. Checkout will not fall back to legacy prices once `catalogContractVersion` is present.

Product publication uses `draft -> review -> approved -> published -> archived`. Approval and publication validate the complete catalog contract and pin workflow audit evidence. A published URL is `/store/<slug>`; archive can retain a redirect target, and public routing denies every non-published state. Store and product cache paths plus search are invalidated after lifecycle changes.

## Catalog rules

- Capabilities are allowlisted: `shippable`, `digital-entitlement`, `subscription`, `donation`, `affiliate`, and `pod`.
- Option dimensions declare allowed values. Every SKU is authored explicitly and must select exactly one value per dimension. The system never generates a Cartesian variant set.
- Offers retain an ID and monotonically versioned snapshots. Amounts use integer minor units and uppercase currency. Windows, segment allowlists, tax display, recurring terms, donation constraints, and compare-at evidence are publication inputs.
- Checkout ignores browser totals. It selects the latest eligible active offer, checks the variant and tracked quantity, and pins immutable order lines on the PaymentIntent.
- Affiliate destinations require HTTPS, a disclosure, a freshness window, and allowlisted tracking keys. Stale remote price/stock is rendered as unknown.
- POD mappings pin remote product/variant IDs, exact canonical options, artwork revision, mockup provenance, cost/availability observation, and manual approval. Import never publishes a provider catalog automatically.
- Portable export contains canonical content, taxonomy/media/relationship IDs, SEO, disclosures, dimensions, variants, offers, and capability mappings. Applied imports always return to `draft`; canonical checksums make a byte-equivalent replay a no-op.

## Private digital delivery

Digital products pin private Media IDs with approved rights and clean malware evidence. `publicOriginal` must be false. Settlement derives an entitlement, an idempotent download grant, limits/expiry, and a receipt delivery path. The download route rechecks the entitlement and current asset state, reserves the download count atomically in PostgreSQL, emits an append-only audit event, and responds with `private, no-store`. The ordinary `/media/:id` route continues to deny `publicPolicy=private` originals.

## Operator and portability surfaces

`/admin/catalog` provides readiness blockers, public preview links, lifecycle controls, bulk archive with retained dependency warnings, deterministic JSON export, and import dry-run/apply. Import keys records by site and slug; a canonical checksum makes identical requests replay safely. Invalid records cannot be applied.

## Release acceptance

Before declaring SHOP-01 verified, use visible admin controls to publish for Renegade Party:

1. one native physical or private digital product;
2. one disclosed affiliate product, including a deliberately stale snapshot check;
3. one manually reviewed POD mapping and a rejected option-mismatch attempt.

Then verify list/detail media, canonical URL, active-window pricing, availability, disclosure, Product JSON-LD, search inclusion/removal, theme swap, role denial, cache invalidation, import replay, private original denial, keyboard/label/contrast behavior, PostgreSQL migration/rollback in disposable data, and a production build. A focused unit suite is not a substitute for those gates.
