# SHOP-03 Print-on-Demand (POD) and Fulfillment Architecture

Status: implemented; live PostgreSQL and browser acceptance required before release verification.

## 1. Overview & Ownership

`SHOP-03` provides the deep print-on-demand (POD) integration path and honest manual fulfillment fallback for Renegade CMS. It applies after `SHOP-01` (Catalog Workflows) and `SHOP-02` (Carts & Proposals), and coordinates with `SHOP-04` (Authoritative Payment Operations).

Print-on-demand fulfillment must adhere to strict principles:

- **Authoritative Paid Acceptance**: External POD jobs are **never** created on cart checkout, checkout proposal creation, or preliminary payment intents. A `PODJob` is created **only** after authoritative confirmation of successful payment (SHOP-04 `state: 'paid'`).
- **Hold Window & Address Boundary**: Newly created jobs enter an operator/customer hold window (default 2 hours) allowing address corrections or cancellation prior to external submission. Once submitted or in production, address modifications are rejected at the boundary.
- **Cancel Deadline**: Order cancellation is only possible while an order has not entered provider production. Once in production, cancellation fails cleanly and routes to return/reprint handling.
- **Deep Provider Path + Honest Manual Fallback**: If a provider connection is disabled, unmapped, or encounters terminal failure, the system never fakes completion. Instead, it generates an explicit `ManualFulfillmentPackage` with full artwork links and an address manifest, declaring `NEVER IMPLY AUTOMATION`.
- **Immutable Sold Snapshots**: Deliberate catalog or mapping changes cannot rewrite historical sold order lines or print rendition snapshots.

---

## 2. Versioned Adapter Contract (`shop-03.v1`)

The POD adapter contract is declared via `POD_ADAPTER_CONTRACT_VERSION = 'shop-03.v1'`.

Every adapter (`PodProviderAdapter`) declares an explicit capability matrix:

```ts
export type PodProviderCapabilityMatrix = Readonly<{
  supportedPrintAreas: readonly PrintAreaType[]
  supportsCancellation: boolean
  supportsPartialShipments: boolean
  supportsLivePreflight: boolean
  supportsLiveCostEstimation: boolean
  supportsAutomaticReprint: boolean
  supportsReturnRouting: boolean
  supportsPoBoxDelivery: boolean
}>
```

Adapters implement:

- `health()`: connectivity, latency, health status (`healthy` | `degraded` | `unavailable`)
- `getCatalog()` & `getVariants(remoteProductId)`: live/synced provider catalog
- `getTemplates(remoteVariantId)`: print area bounds, recommended DPI (300) and minimum DPI (150)
- `validateFile(file)`: checks MIME types (PNG, TIFF, PDF), dimensions, DPI, file size
- `uploadPrintFile(file)`: uploads or registers private artwork assets
- `preflight(input)`: verifies effective DPI on physical substrate and generates mockup provenance
- `estimateCost(input)`: returns live production, shipping, and total cost breakdown
- `createOrder(input)`: idempotent order submission with `idempotencyKey` and recipient address
- `getOrder(externalOrderId)`: status polling and line-level fulfillment tracking
- `cancelOrder(externalOrderId)`: provider cancellation when permitted by lifecycle state
- `verifyWebhook(rawBody, signature, secret)`: HMAC-SHA256 signed event verification

---

## 3. Adapters: Deterministic Emulator & Configured Real Provider

### 3.1. Deterministic Emulator (`pod-emulator`)

- In-memory deterministic provider with reproducible seeds.
- Simulates realistic lifecycles: `submitted` -> `in_production` -> `partially_shipped` -> `shipped` -> `delivered`.
- Test hooks for generating HMAC signed webhooks, out-of-order events, partial shipments, provider unavailability, and cancellation rejection in production.

### 3.2. Configured Real Provider (`PrintfulPodAdapter`)

- Conforms to Printful API v2 endpoints (`/v2/catalog-products`, `/v2/store`, `/v2/orders`).
- **Live Creation Guard**: Live order creation requires explicit `allowLiveCreation: true` AND `RENEGADE_POD_ALLOW_LIVE_CREATION="true"`.
- Excluded from CI and test suites by default to prevent accidental charges or live orders.

---

## 4. Encrypted Connection & Store Mapping

Store connection credentials (`PodConnectionRecord`) are encrypted at rest using AES-256-GCM.

- Secrets are never displayed in plaintext in logs or admin UI; `redactSecret` exposes only `prn_***1234`.
- Connections store remote store ID (`remoteStoreId`), label, status (`active` | `degraded` | `disabled`), and cached health matrix.
- `rotatePodConnectionCredentials` re-encrypts new credentials safely.
- Safe disable (`disablePodConnection`) halts new order routing without breaking existing historical order reconciliation.

---

## 5. Private Governed Print Renditions & Artwork Governance

Media assets destined for print on demand (`GovernedPrintRendition`) must satisfy strict criteria:

1. **DPI & Resolution**: Minimum 150 DPI required (300 DPI recommended); minimum dimensions 1000x1000px.
2. **Private Originals**: `publicOriginal: false` is strictly enforced. High-resolution print files are never accessible via public URLs; ingestion uses short-lived HMAC-signed URLs (`signPrivatePrintAssetUrl`).
3. **Rights & Malware**: `rightsStatus: 'approved'`, rights must not be expired, and `malwareStatus: 'clean'`.
4. **Approval**: Operator preview and approval required before mapping.
5. **No Color-Fidelity Promise**: Prominent user and operator disclosure:
   > _"No color-fidelity promise: Screen previews are approximations (sRGB); print results may vary based on garment color, fabric substrate, and direct-to-garment (DTG) ink absorption."_
6. **Immutable Sold Snapshot**: `freezeSoldPrintRendition` signs and freezes the print rendition and placement at moment of sale.

---

## 6. FulfillmentPlan & Exactly-One PODJob Creation

When an order is created, `buildFulfillmentPlan` inspects the items:

- Items mapped to active POD providers -> `PlannedPodPackage`
- Physical items without mapping or where provider is disabled -> `PlannedManualPackage`
- Digital items -> `PlannedDigitalGrant`

### Exactly-One Submission Gate:

- `createPodJobAfterPaidAcceptance` checks that order payment state is `'paid'`.
- Generates idempotent key: `pod_job:${siteId}:${orderId}:${packageIndex}:${payloadHash.slice(0, 16)}`.
- Payload hash covers recipient name, address, line items, quantities, and print area artwork hashes.
- Enters hold window (`state: 'on_hold'`).

---

## 7. Durable States, Reconciliation & Safe Tracking URLs

### Lifecycle State Machine:

```
created -> on_hold -> submitting -> submitted -> in_production -> partially_shipped -> shipped -> delivered
  |           |            |             |             |
  +-----------+------------+-------------+-------------+--> cancelled / failed / exception / returned
```

### Event Ingestion & Disorder Handling:

- Duplicate events are deduplicated via `providerEventId`.
- Out-of-order events: an out-of-order `shipped` event immediately advances state to `shipped`; late-arriving `in_production` events will not regress state backwards.
- Line-level partial shipments: each package fulfillment specifies fulfilled line indices. When all lines are fulfilled, state becomes `shipped`.
- Safe tracking URLs: strict domain allowlist (`tools.usps.com`, `ups.com`, `fedex.com`, `dhl.com`, `tracking.printful.com`, `parcelsapp.com`, `17track.net`). Any `javascript:`, data URIs, or untrusted hostnames are rejected and replaced with verified tracking URLs.

---

## 8. Manual Fulfillment Package Queue

If a provider connection is disabled, or a POD submission exceeds retry limits (`MAX_POD_SUBMIT_ATTEMPTS = 3`), the order cleanly transitions to `ManualFulfillmentPackage`:

- Contains complete specifications: garment color, print area bounds, signed high-resolution artwork download links, recipient address manifest, and packing slip notes.
- Declares **`MANUAL FULFILLMENT QUEUE: No automated third-party provider submission has been performed or implied.`**
- Tracks operator acknowledgement (`acknowledgedBy`, `acknowledgedAt`) and dispatch with carrier tracking number.
