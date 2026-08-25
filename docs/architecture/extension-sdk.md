# Extension SDK and capability kernel

Renegade loads only reviewed, trusted in-process modules. There is no arbitrary third-party server-code installation, public plugin marketplace, shared runtime, or claimed sandbox in this release.

`src/modules/extensions/contracts.ts` is the versioned SDK boundary. Every module, theme, provider and future trusted plugin supplies an `ExtensionManifest`: core/schema ranges, dependencies/conflicts, configuration schema, capabilities, permissions, migration/export/retention ownership, failure behavior, uninstall choice and measured-resource declaration. Compatibility is checked before migrations or runtime activation. Unknown fields are preserved by the portable JSON boundaries; disabling preserves canonical records and configuration. Uninstall is an explicit retain/archive/export/delete-confirmed choice.

Providers use `ProviderContract` and `ProviderAdapter`. Their identity, authorization/scopes, account capabilities, health test, rate-limit/idempotency policy, normalized errors, callback ownership, revocation and portability boundary are mandatory. Connection secrets are vault references only; they are never serialized as normal client data or diagnostics. Providers never own canonical Members/sessions, content, PostgreSQL data, moderation, or revision truth. Wallet adapters only expose transport/accounts/networks/signing. Federation is capability-honest and cannot claim live interoperability from fixtures. Anchors only verify/publish revision hashes. Graph adapters are optional projections, never canonical storage.

The first reference adapters are local filesystem object storage and development transactional email. They prove two different capability shapes without claiming production credentials. Consumers use `CapabilityRegistry.has('email.transactional', ...)`, not a provider name.

## Agent and external-client manifests

`ToolManifest` is shared by in-app agents, administrative/CLI assistants and the future public API/webhook layer. It specifies typed input/output, permission, sensitivity, rate limit, idempotency, approval, timeout, audit and rollback. Agents may only run registered tools. They cannot publish, spend, connect accounts, change permissions, reveal secrets, bypass moderation or access arbitrary hosts without a reviewed manifest and explicit grant. Dangerous tools pause in `ApprovalRequest`; denied calls retain an audit identifier.

Future API clients and webhook subscriptions must use these exact manifests with scope (Site/Publication/Space), explicit capabilities, pagination/filtering, signed replay-safe delivery, idempotency, redacted delivery logs, revocation, retry/dead-letter state and event versions. Webhooks cannot add permissions or disclose fields outside their subscription scope.

## Resource profiles and extraction triggers

Lean, Standard, Media and Scale are one schema/codebase guidance profiles. Lean is the verified 1 GB-class path: public reads, forms, auth, payments and core jobs remain available while AI, graph, transcoding, high-resolution rendering, large imports and realtime are hidden, queued or externally delegated. Profile changes do not delete data or change ownership. Before out-of-process modules, third-party server code, marketplace, or true multitenancy, record measured queue pressure, public-read latency, memory/CPU/disk/network peaks, isolation failures and a rollback plan; semver alone is insufficient.
