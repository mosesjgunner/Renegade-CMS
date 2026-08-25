# Shared contracts

[ADR-0002](../decisions/ADR-0002-shared-contracts.md) freezes the following minimum vocabulary. The executable TypeScript form is in `src/modules/core/contracts.ts`.

- IDs are opaque UUID strings branded by entity kind. URLs, slugs, provider handles and database sequence numbers are not cross-system identity.
- Every owned record is scoped by `tenantId`, `siteId`, and nullable `brandId`. V1 may use one tenant/site, but scope is never inferred from a global singleton.
- Stored instants are UTC ISO-8601 strings; scheduled local intent additionally stores an IANA time-zone name when introduced.
- Lifecycle values are owned, explicit state machines. The shared baseline is `draft | active | archived`; publishing modules define publish-specific states without overloading deletion.
- Authorship distinguishes the responsible actor from credited authors. Audit metadata records creator/updater and request correlation; immutable audit events are append-only.
- Soft deletion uses `deletedAt` plus `deletedBy` only for recoverable records selected by their owner. Security/audit/financial evidence uses explicit retention, not generic soft deletion. Queries exclude deleted records by default.
- A provider connection is identified by installation, provider key, external account key and scope; secrets/tokens are never part of identity or public serialization.
- Capabilities use stable namespaced keys with support level and observed timestamp. Callers must handle unsupported/unknown values.
- Background jobs have an opaque job ID, namespaced kind, scope, state, attempt count and optional idempotency key. This does not choose a queue implementation.
- Data classes are `public`, `member`, `staff`, `secret`, and `restricted`. Serialization is allowlist-based. Secrets and restricted metadata never enter client props, ordinary logs, fixtures or exports.

## Portable ownership and identity

- `Member` is the sole canonical public-person principal and owns profiles, Spaces, content, relationships, media, messages and financial history. A provider never becomes the Member record.
- `LinkedIdentity` is a replaceable credential record for passkeys, OAuth/social accounts, signed wallets and expiring magic links. Core has no password, password hash, reset flow or password-login UI. Owner/staff access is a separate security domain from public-member authentication.
- Wallet connectors are replaceable client transports only. Renegade owns nonce issuance, signature verification, account linking, sessions, recovery, revocation and immutable audit. `CryptographicAccount` uses a canonical namespaced CAIP-style account identifier alongside chain namespace/reference, normalized address or public key, wallet type and proof provenance.
- `Profile` and `Space` are owned and explicitly scoped. A `SpaceCapabilityGrant` names the grantee, capability, lifecycle and expiry; it never grants by inferred provider identity.

## Scheduling, commerce and provider contracts

- `CalendarEntry` is an owner-scoped, time-zone-aware planning item with visibility, lifecycle, participants/assignees, recurrence/version, audit, conflict and job references. It can reference a publication, campaign, event, social post, newsletter, livestream, launch, task or future external-calendar object; it does not duplicate that record.
- `Event` is the canonical native structured-event record. It owns schema-first SEO fields, structured-data-source inputs, import/export hooks, optional Neo4j/knowledge-graph projection metadata, retention, and Milestone 5/6 public-render and card/list hook boundaries. A `CalendarEntry` may point to an `Event`; the planning row is not the event itself.
- `Timeline` and `TimelineMembership` are first-class canonical records. PostgreSQL remains the canonical query surface for ordered event timelines; any future Neo4j knowledge graph is an optional projection boundary, never the primary store.
- Event and timeline contracts explicitly reserve Milestone 5 public rendering hooks and Milestone 6 embeddable timeline, event-card and event-list hook points without pre-building the presentation system.
- `Campaign`, `Cart`, `MerchantConnection`, `PaymentIntent`, `Order` and `ProviderAccount` have opaque IDs, scope, audit and lifecycle records. Commerce data is owned by Renegade contracts; remote provider references are evidence, not canonical identity.
- `PaymentMethodCapability` is a time-observed provider/rail snapshot: merchant and buyer geography, presentment/settlement currencies, minor-unit bounds, one-time/recurring/refund/dispute support, synchronous/asynchronous flow, redirect/QR/SDK/hosted-UI requirement, availability and verification provenance.

## Retention and encrypted messages

- Eligible objects share `RetentionPolicy`: permanent, expire-at, burn after first/all-recipient read, burn after view count, manual burn, archive or tombstone; legal/moderation holds; scheduled purge; cache/search/feed removal; a stated backup-retention boundary; and a cryptographic-erasure hook. Product copy must never promise deletion of recipient downloads, screenshots, federated copies or third-party archives.
- `EncryptedMessageEnvelope` is optional and versioned. It records key fingerprints, recovery-key boundary, algorithm suite/version, ciphertext, nonce, sender/recipient wrapped content keys, signature/authentication metadata, rotation/revocation, encrypted attachments and recovery/export behavior. No primitive, audited library, forward-secrecy claim or recovery mechanism is selected until an implementation is tested.

## Modules, releases and destructive operations

- A `ModuleManifest` names identity/version, compatible core/schema ranges, dependencies/conflicts, provided/required capabilities, configuration schema version, permissions, health check, failure mode, migration/rollback and backup/export owner, plus enable/disable/archive/uninstall and retention choices.
- Modules can disable while preserving or archiving data; archive read-only or export before removal; and uninstall only according to the declared data policy. Live data defaults to refusal. Unknown fields/data are preserved by import/export, and a release always refuses unsafe downgrade.
- `ReleaseManifest` records release/schema versions, compatible module/theme ranges, migration owners and the stable/preview/security update channel. Compatibility is checked before enable, update, import or restore.

## Canonical information architecture implementation

The first concrete Payload implementation of these contracts is documented in [Canonical Information Architecture](canonical-information-architecture.md). It keeps staff users separate from public members, uses explicit site/publication/space scope, records taxonomy redirects, and enforces discoverability through shared retention helpers.
