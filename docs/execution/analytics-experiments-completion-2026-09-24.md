# Analytics, Attribution & Experiments Completion — 2026-09-24

Status: **VERIFIED — Prompt 5 Production Ready**

Renegade CMoS Prompt 5 productizes telemetry and experiment contracts into a complete, consent-aware product. All event sources, grains, identity linkage models, retention policies, suppression rules, and canonical reconciliation boundaries are formally inventoried. A comprehensive operator dashboard (`/admin/telemetry`) is deployed with date and site filters, source freshness indicators, currency-separated financial views, and explicit uncertainty disclosures. Complete attribution for disclosed links, campaigns, and orders is proved without claiming false certainty where consent or identity is absent. A public experiment is wired to live variant rendering, assignment, exposure, conversion, and human winner approval. Tracking-off, consent withdrawal, deduplication, bot filtering, and suppression isolation are fully verified.

---

## 1. Formal Event Source & Storage Grain Inventory

All event streams are inventoried under `src/modules/analytics/inventory.ts`:

| Event Source ID | Canonical Collection | Primary Grain | Identity Linkage | Retention Policy | Canonical Reconciliation Target |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`web-client-telemetry`** | `analytics-events` | `raw-event` | `consented-salted-hash` | 90 days (`retentionExpiresAt`) | Canonical Content (`content`, `publications`) |
| **`consent-lifecycle`** | `analytics-consent-records` | `raw-event` | `consented-salted-hash` | Permanent legal audit proof | Canonical Audience (`consent-events`, `suppressions`) |
| **`audience-crm`** | `form-submissions` | `raw-event` | `member-authenticated` | 730 days | Canonical Audience (`form-definitions`, `contacts`) |
| **`community-interactions`** | `activity-events` | `raw-event` | `member-authenticated` | 365 days | Canonical Community (`members`, `forum_discussions`) |
| **`commerce-financial`** | `metric-snapshots` | `order-snapshot` | `member-authenticated` | Permanent financial ledger | Canonical Commerce (`orders`, `contributions`) |
| **`experiment-lifecycle`** | `experiment-events` | `raw-event` | `consented-salted-hash` | 90 days | Canonical Audience (`experiments`, `experiment-decisions`) |
| **`suppression-ledger`** | `suppressions` | `raw-event` | `suppressed-masked` | Permanent compliance barrier | Canonical Audience (`subscribers`, `contacts`) |

### Identity Linkage & Privacy Rules
- **Consented Sessions**: Pseudonymous SHA-256 salted `anonymousHash` and `sessionHash` generated using secret-derived HMAC.
- **Unconsented / Tracking-Off**: Zero persistent cookies, zero identity linkage. Evaluated under `privacy-default-unlinked`.
- **Suppressed Visitors**: Emails on the `suppressions` collection are hashed (`emailHash`). In all operator views, queries, and exports, identities matching the suppression set are strictly masked with `[SUPPRESSED VISITOR]` and never exposed in cleartext.

---

## 2. Operator Dashboard & Metric Dictionary

Mounted under Payload Admin navigation (`PublishingLinks.tsx`) and accessible at `/admin/telemetry` (`src/modules/admin/TelemetryCommandCenter.tsx`):

### Key Capabilities
1. **Source Freshness & Operational Health**:
   - Status badge: `HEALTHY` (latency ≤ 15m), `LAGGING`, or `INACTIVE`.
   - Displays last event received timestamp, raw event count, deduplicated replays, and bot/crawler requests filtered.
2. **Prominent Uncertainty & Missing Data Banner**:
   - Transparently discloses the percentage of traffic arriving with tracking off (DNT/GPC or declined analytics consent).
   - Summarizes unconsented interactions and missing UTM campaign parameters.
   - States explicitly: *"Conversions without cryptographic consent linkage are classified as unattributed (consent absent) rather than miscredited."*
3. **Currency-Separated Financial Views**:
   - Strictly segregates presentment and settlement currencies (USD, EUR, GBP). Distinct currencies are **never summed together** without provenance-tagged exchange rates.
   - Details Gross Volume, Processing Fees, Net Settled Volume, Order Counts, and Reconciliation status:
     - `reconciled`: 1:1 match with canonical `orders` and `contributions`.
     - `unreconciled`: Detected telemetry or payment discrepancies.
     - `provider-reported`: Webhook/processor reported figures.
     - `estimated`: Affiliate / referral commissions.
4. **Metric Dictionary (`src/modules/analytics/definitions.ts`)**:
   - Formal mathematical formulas, data grains, sources, caveats, and uncertainty disclosures for `page_views`, `unique_visitors`, `disclosed_campaign_clicks`, `conversions`, `conversion_rate`, `experiment_exposures`, `practical_effect`, and `financial_gross`.

---

## 3. Campaign Funnel Attribution & Uncertainty Modeling

Implemented via `attributeCampaignFunnel` in `src/modules/analytics/contracts.ts`:

### 4-Stage Funnel Model
1. **Disclosed Inbound Link**: Clicks arriving with explicit campaign tags (`utm_campaign`, `utm_source`, `utm_medium`, `ref`, `affiliate_id`).
2. **Consented Landing**: Page view registered with active first-party analytics consent.
3. **Deep Engagement**: Reaching read depth ≥ 50% or internal navigation click.
4. **Goal Conversion**: Reconciled form submission, newsletter signup, or completed order.

### Non-Negotiable Attribution Principles
- **No False Certainty**: When visitor consent is absent or denied (`consentBasis === 'denied'`), attribution returns:
  - `attributedChannel`: `'unattributed (consent absent)'`
  - `confidence`: `'unlinked'`
  - `uncertaintyRating`: `'high - consent absent'`
  - `uncertaintyStatement`: *"Visitor has not granted analytics consent or tracking is off (DNT/GPC). Identity linkage is strictly prohibited; touchpoints cannot be credited with certainty."*
- **Persistent Identity Validation**: When consent is granted but identity hashes are missing, confidence is rated `'unlinked'` with `'high - untracked identity'`.
- **Verified Consented Journeys**: Multi-touch journeys linked via salted hashes are rated `'verified'` with `'low'` uncertainty.

---

## 4. Live Public Experiment Lifecycle

Wired on the public homepage (`src/app/(frontend)/page.tsx`) via `PublicExperiment.tsx`:

### Experiment Specification (`exp-homepage-hero-cta`)
- **Hypothesis**: Community-focused call to action increases reader conversion over standard dispatch subscription.
- **Goal Key**: `newsletter-member-signup`.
- **Variant A (Control)**: *Sovereign Dispatch (Control)* (`publisher.newsletter-cta`, 50% traffic allocation).
- **Variant B (Treatment)**: *Free Reader Network (Treatment)* (`publisher.cta`, 50% traffic allocation).

### Lifecycle Proof
1. **Deterministic Assignment**:
   - Unconsented / DNT / GPC visitors receive Control variant with `isDefault: true`, generating **zero** exposure or conversion telemetry.
   - Consented visitors receive deterministic variant based on SHA-256 salted hash of subject key.
2. **Exposure Tracking (`/api/experiences/exposure`)**:
   - Beacons on component render; deduped by `source:${experimentId}:${assignmentKey}:exposure`. Duplicate requests return HTTP 202 without double-counting.
3. **Conversion Tracking (`/api/experiences/conversion`)**:
   - Beacons on CTA action; deduped by `source:${experimentId}:${assignmentKey}:conversion:${goalKey}`.
4. **Statistical Analysis**:
   - Computes Practical Effect (Lift), Standard Error, and 95% Confidence Intervals (`uncertainty95`).
   - Flags small sample warning when exposures < 100 per variant (*"Tiny sample: fewer than 100 exposures per variant. Insufficient evidence: do not select a winner or stop early."*).
5. **Human Winner Approval (`/api/admin/telemetry/experiment/winner`)**:
   - Requires explicit human operator authorization; programmatic or automated selection is rejected.
   - Requires documented decision rationale (minimum length validation).
   - Writes immutable audit record to `experiment-decisions` with `decision: 'winner-selected'`, `actor`, `reason`, and `decidedAt`.
   - Transitions experiment state to `'winner-selected'`.
6. **Permanent Winner Deployment**:
   - Once approved, `resolvePublicExperimentVariant` enforces the winning variant for **all** visitors under `winner-enforced` privacy mode.

---

## 5. Verification & Conformance Evidence

### Test Execution Summary
- **Unit Suite (`tests/unit/analytics-attribution-experiments.test.ts`)**: 9/9 passed.
  - Inventories all 7 canonical event sources, grains, and reconciliation targets.
  - Verifies metric definitions and uncertainty disclosures.
  - Proves consented multi-touch attribution with disclosed UTM tags.
  - Proves refusal to claim certainty when consent or identity is absent.
  - Proves suppression ledger masking (`maskSuppressedIdentity`).
  - Proves incompatible currency separation and summing validation.
  - Proves statistical analysis, practical effect, and human winner approval requirement.
- **Integration Suite (`tests/integration/public-experiment-and-telemetry.integration.test.ts`)**: 6/6 passed.
  - Proves tracking-off serves privacy-default variant with zero telemetry.
  - Proves GPC (`sec-gpc: 1`) and DNT (`dnt: 1`) override granted cookies.
  - Proves consent withdrawal immediately halts tracking.
  - Proves bot & crawler filtering (Googlebot, HeadlessChrome, internal header).
  - Proves end-to-end experiment lifecycle (assignment → exposure → conversion → deduplication → winner approval → winner deployment).
  - Proves an operator can explain a campaign funnel from inspectable events without exposing suppressed visitors.
- **Baseline Integration Suite (`tests/integration/experiences-runtime.integration.test.ts`)**: 3/3 passed.
- **Baseline Contracts Suite (`tests/unit/analytics-contracts.test.ts`)**: 3/3 passed.
- **TypeScript Static Analysis (`npx tsc --noEmit`)**: 0 errors.

---

## 6. Exit Criteria Confirmation

> **Exit Criteria**: *"An operator can explain one campaign funnel and one experiment from inspectable source events without exposing suppressed visitors."*

**Verified**:
1. **Campaign Funnel Explanation**: The operator can select `autumn-sovereign-launch`, trace inbound touchpoints across disclosed links, review consented landings, read engagement, and inspect individual source events down to the raw grain.
2. **Experiment Explanation**: The operator can view `exp-homepage-hero-cta`, inspect exposures, conversions, practical effect lift, and confidence bounds, review statistical sample warnings, and execute a human winner decision.
3. **Suppression Protection**: All visitor identifiers matching the `suppressions` collection are verified to render as `[SUPPRESSED VISITOR]`, ensuring suppressed visitors are never exposed in cleartext.
