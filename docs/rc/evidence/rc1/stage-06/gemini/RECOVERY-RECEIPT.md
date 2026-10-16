# Stage 06 Business Recovery Receipt

**Execution Timestamp**: 2026-10-16T03:51:30Z to 2026-10-16T03:52:20Z  
**Target Environment**: Isolated Compose project `rc1-stage06-source` (Web: `http://127.0.0.1:3150`, Postgres: port 15438)  
**Execution Script**: `scratch/stage06/stage06-business-lifecycle.ts`  
**Exit Code**: 0

---

## 1. Representative Business Data Population

The following business entities were populated using authentic business contracts, lifecycle helpers, and domain repositories:

### Multi-Tenant Core & Accounts

- **Tenant Site**: `5dfc07a5-cc1f-47f4-a71c-e61fab64d8b7` (Name: "Renegade Party", Domain: `dispatch.rc02.test`)
- **Publication**: `9a4890f4-c714-4c54-b49a-1ba6055cecfe` (Title: "Renegade Dispatch", Path: `/`)
- **Owner Account**: `1b954d7f-46f6-4c87-a9ae-92898ce2043e` (`founder@renegadeparty.org`, role: `owner`)
- **Administrator**: `f12e8296-1509-4ff8-8c29-1e4ab888dbf7` (`admin@renegadeparty.org`, role: `admin`)
- **Staff Members**:
  - `b7a142e0-244e-4f51-b84f-b67f2e146714` ("Alice Reformer", scoped role: `contributor`)
  - `98e8f85d-85fa-4c4f-9e5b-b9d62be021f1` ("Bob Grassroots", scoped role: `community-manager`)
- **Active Admin Session**: `2ba43f2d-f2d6-4209-83f1-bcb3f5c145c9` (persisted for reauthentication testing)

### Editorial Content & Media

- **Published Article**: `4b94c3d8-e737-4bf7-a5c7-df67e0624a04` ("Decentralized Truth in Action", slug: `decentralized-truth`)
- **Published Platform Page**: `3df254b1-e23a-4122-bc55-c54c30c8ea59` ("Party Platform & Principles", slug: `platform`)
- **Public Media Asset**: `b563aa7a-2b60-4347-888d-7128f60b5ba0` (`renegade-emblem.png`, 4,205 bytes PNG, SHA256: `97df0ecac3746e73f93420443b00c601b59aa68073e40a6272ec8cd758dbd882`)
- **Private Protected Media Asset**: `c7b746c1-a892-411a-be32-ff45dfadce28` (`renegade-constitution.pdf`, 1,024 bytes PDF, rights: `approved`, malwareStatus: `clean`)

### Audience, Consent & Messaging

- **Audience List**: `16da7fc7-6a1c-43f1-b883-fa589932ad98` ("Renegade Supporters")
- **Subscribers**: 12 confirmed subscribers with double-opt-in status (`status: confirmed`, doubleOptInCompleted: true)
- **Consent Events**: 6 auditable consent events (`action: grant`, `ipHash`, verified timestamp)
- **Draft Broadcast**: `37b2756a-116e-4f7f-aa64-b816a70e7e1e` ("Weekly Dispatch #42: Momentum")
- **CRM Contacts**: 5 customer contacts (`status: customer`)

### Community Forums & Engagement

- **Forum Section**: `c3a07851-419b-4e92-91e8-765796df32bc` ("Policy & Action")
- **Discussion Forum**: `d2b18962-520c-4fa3-a2f9-876807ef43cd` ("General Platform Discussions")
- **Discussions & Posts**: 5 discussions with 5 active discussion posts

### Commerce Catalog & Fulfillment

- **Merchant Connection**: `mc_stage06_91a0c8b2` (provider: `stripe_connect`, status: `active`)
- **Payment Method Capability**: `pmc_stage06_91a0c8b2` (`card`, `apple_pay`, `google_pay`, `active`)
- **Shippable Physical Product**: `7b3240a1-4f11-4796-981c-d784260e1011` ("Renegade Freedom T-Shirt")
  - Weight: `250g`, Dimensions: `300mm x 200mm x 20mm`
  - Inventory: 100 units tracked
  - Offer: `$25.00 USD` (amountMinor: 2500)
- **Digital Entitlement Product**: `8a2139b2-5f22-48a7-a92d-e895371f2122` ("Renegade Manifesto & Digital Handbook")
  - Entitlement Key: `digital-manifesto-access`
  - Attached Asset: `c7b746c1-a892-411a-be32-ff45dfadce28` (private PDF)
  - Download Limit: 5, Expires After: 365 days
  - Offer: `$15.00 USD` (amountMinor: 1500)

### Orders, Fulfillment, Refunds & Subscriptions

- **Cart & Proposals**: Cart `f16cfc9c-5d66-4c75-8ce6-a704e6c99778`, checkout proposal verified
- **Payment Intent & Attempt**: Intent `pi_stage06_91a0c8b2`, Attempt `att_stage06_91a0c8b2` (`state: succeeded`)
- **Settled Order**: `ORD-STG6-91A0` (totalMinor: 4000, state: `paid`)
- **Digital Delivery Grant**: `ddg_stage06_91a0c8b2` (downloadLimit: 5, remainingDownloads: 5)
- **Full Refund**: `ref_stage06_91a0c8b2` (amountMinor: 4000, reason: `customer_request`, state: `succeeded`)
- **Supporter Record**: `sup_stage06_91a0c8b2` (member: Alice Reformer, status: `active`)
- **Subscription Tier**: `sub_plan_supporter_monthly` ($10/month, entitlement: `supporter-lounge-access`)
- **Entitlement Checks**: Alice holds `supporter-lounge-access` (verified true)
- **Donation Campaign**: `camp_stage06_91a0c8b2` ("Fall 2026 Ballot Access Fund", goal: $50,000)
- **Settled Donation**: `don_stage06_91a0c8b2` ($250.00 USD, donor: `donor@renegadeparty.org`)

---

## 2. Worker Crash, Lease Interruption & Recovery Proof

### Scenario 1: Worker Crash at Lease Point

1. **Initial Lease Acquired**:
   - Job: `job_stage06_sched_pub_1`
   - Worker ID: `crashed-worker-pid-8842-91cf1e78`
   - Lease expires: `2026-10-16T03:51:30.822Z` (simulated crash mid-lease)
2. **Competing Worker Rejection**:
   - A competing worker attempted execution while lease was active.
   - Outcome: Rejected with:
     ```
     Job is leased by worker "crashed-worker-pid-8842-91cf1e78" (lease valid until 2026-10-16T03:51:30.822Z)
     ```
3. **Lease Expiration & Recovery**:
   - Lease expired at `2026-10-16T03:51:31.822Z`.
   - Recovering worker acquired the expired lease.
   - Execution result:
     ```json
     { "success": true, "published": true }
     ```
4. **Duplicate Execution Protection (Idempotency)**:
   - Second invocation triggered after completion.
   - Execution result:
     ```json
     { "success": true, "published": true }
     ```
   - Audit trail check: Exactly 1 publish event recorded in `payload_locked_documents_rels` / audit ledger. No duplicate document creation.

### Scenario 2: Subscription Entitlement Replay Protection

1. **Initial Grant**: Granted `supporter-lounge-access` -> 1 new entitlement row created.
2. **Replay Triggered**: Identical subscription event replayed.
3. **Outcome**: Grants created on replay = 0.
   ```json
   { "idempotent": true, "activeCount": 1 }
   ```

### Scenario 3: Outbox Delivery Deduplication

1. **First Enqueue**: Delivery envelope queued for `https://fed.example.test/inbox`.
   - Delivery ID: `7e6419a7-ab1c-4a71-ad04-d2b115f871d7`
2. **Duplicate Enqueue**: Same idempotency key re-dispatched.
3. **Outcome**:
   - Re-used identical delivery ID: `7e6419a7-ab1c-4a71-ad04-d2b115f871d7`
   - Total deliveries created: 1
   - Deduplication verified: true.
