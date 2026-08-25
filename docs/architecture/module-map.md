# Modular-monolith boundaries

All modules live in one deployable TypeScript application until an independently measured scaling or security need justifies extraction. A boundary is documentation until code exists; M01 creates code only for `core` and the narrow `publications` path.

| Module                      | Owns                                                                            | May depend on                                                        |
| --------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| platform/core               | IDs, scope, time, errors, audit/job/capability vocabulary, configuration        | no product module                                                    |
| publications                | tenant/site/brand settings and publication membership                           | core, identity references                                            |
| content                     | canonical records, taxonomy, sources, revisions                                 | core, publications, identity/media refs                              |
| profiles/spaces             | Member profiles, owner-scoped Spaces and capability grants                      | core, identity, publications                                         |
| relationships               | Member-to-Member relationship lifecycle                                         | core, identity, security                                             |
| albums/portfolios           | owner-curated media groupings and visibility                                    | core, profiles/spaces, media, retention                              |
| conversations/encryption    | conversations, participants, messages, envelope integration and recovery policy | core, identity, relationships, media, retention, security            |
| discussions/forums          | forums, threads, posts and moderation workflow                                  | core, publications, identity, security                               |
| editorial                   | assignments, review, approvals, planning calendar and scheduled publish         | core, content, identity                                              |
| presentation                | themes, layouts, navigation and rendering projections                           | core, publications, public content/media views                       |
| identity                    | Member principals, LinkedIdentity credentials, sessions, staff roles and grants | core, publications, security policy                                  |
| providers/connections       | provider definitions, installations, account records and capability snapshots   | core, publications, security                                         |
| retention/ephemeral-content | reusable retention policies, holds, purge requests and deletion notices         | core, security, operations                                           |
| AI                          | model routing, provenance, proposals and approvals                              | core plus explicit read contracts; never direct publication mutation |
| media                       | canonical media, derivatives, rights and storage abstraction                    | core, publications, identity refs                                    |
| social                      | variants, intents, attempts and reconciliation                                  | core, content, media, connections, editorial                         |
| audience/email              | subscribers, consent, segments, messages and delivery                           | core, content, identity, connections                                 |
| payments/supporters         | money movement, pledges, subscriptions and supporter ledger                     | core, identity, connections, security                                |
| cart/orders                 | buyer carts, orders and fulfillment state                                       | core, commerce, identity, payments                                   |
| crypto-payments             | on-chain payment observation and verification                                   | core, payments, providers/connections, security                      |
| commerce/fulfillment        | catalog, fulfillment and merchant operational workflow                          | core, content/media refs, payments, cart/orders                      |
| analytics                   | first-party events, aggregates, attribution and reporting                       | public IDs/events from other modules, never their private tables     |
| security                    | security policy, abuse decisions and redacted security events                   | core, identity references                                            |
| imports/exports             | versioned portable bundles and migration runs                                   | explicit public export/import ports only                             |
| updates                     | release manifests, channels and compatibility checks                            | core, imports/exports, operations                                    |
| managed-hosting-readiness   | isolated provisioning contract and instance lifecycle boundary                  | core, operations; never tenant product data                          |
| operations                  | health, migrations, jobs, backups, diagnostics and version metadata             | explicit status ports only                                           |

Rules: domain modules do not import Next/Payload route code; route and Payload collection adapters may import domain contracts. Presentation never owns canonical content. Provider-specific conditionals remain inside adapters. Cross-module writes use an owning module command rather than another module's storage. Public serializers opt fields in; they never spread persistence objects.

No listed boundary implies a package, table, API, provider integration, or UI exists. A module is introduced in code only with an owned vertical slice. Consumers query stable capability keys and never vendor names; provider adapters translate vendor state into those keys.

Canonical IA collection ownership, scope, taxonomy, discussions and retention routing are documented in [Canonical Information Architecture](canonical-information-architecture.md).
