# Dependency map and canonical records

## Runtime spine

```text
Next routes -> module service/projection -> Payload registrations -> PostgreSQL UUID records
                         |                       |
                         +-> Payload Jobs --------+-> worker -> domain delivery/audit records
public routes -> canRenderPublic/canDiscoverPublic -> allowlisted public view -> theme
external provider -> ProviderAdapter/connection reference -> domain-owned durable state
```

## Canonical entities and identifiers

| Concern              | Canonical record(s)                                                                                                     | Stable identity and required links                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tenant/site          | `sites`; `publications`; `spaces`                                                                                       | Payload UUID `id`; `publication.site`, `space.member`; use `site`, `publication`, `space` relationship fields. `TenantID` is contract vocabulary only. |
| Staff/users/members  | `users`; `members`; `linked-identities`; `member-sessions`; `profiles`; `authors`; `team-memberships`                   | UUID; `users.member` links staff to the public identity without merging auth domains.                                                                  |
| Content              | `content`; `article-family-content`; `revision-records`; `preview-tokens`; `scheduled-publish-jobs`; `content-releases` | UUID; retain article revision/provenance and release idempotency keys.                                                                                 |
| Media                | `media-assets`; `media-usages`; `media-derivatives`; media publication records                                          | UUID; reuse `media-assets` and usage references, never duplicate a competing asset family.                                                             |
| Navigation/layout    | `page-layouts`; sections/categories/tags/series; taxonomy redirects                                                     | UUID plus scoped canonical slug/path; presentation is a projection, not another content store.                                                         |
| Audience             | subscribers, consent/preferences/suppressions, email messages/deliveries, contacts/segments                             | UUID; message/delivery idempotency lives in audience contracts/records.                                                                                |
| Events/jobs          | events, timelines, calendar entries; `payload-jobs`; domain task records                                                | UUID; scheduled intent also retains IANA time zone; use domain idempotency/concurrency keys.                                                           |
| Provider connections | api clients/webhook subscriptions; social accounts; merchant connections; network signing/remote records                | UUID plus provider key/external account key and scoped relationship; credentials are references, never normal fields.                                  |
| Commerce             | products, carts, checkout sessions, payment intents, orders, webhook events, entitlements                               | UUID; provider event ID/idempotency and canonical order/receipt/inventory path.                                                                        |
| Audit                | identity/team/integration/network audit events; workflow/release/queue attempts; Payload job logs                       | UUID records or append-only audit arrays owned by the domain; correlation/idempotency is never a display slug.                                         |

## Dependency ordering

1. A must preserve configuration, migrations, Payload registration, installation, and worker proof.
2. B can extend canonical owned records only through the existing scope and public-projection gates.
3. C and D consume B ownership, media and release records; they must degrade without blocking B public reads.
4. E consumes all prior domain contracts but must not register a parallel runtime, plugin system, event bus, or identity store.

## Routes and adapters

- Payload admin/API are under `src/app/(payload)`; public, health, setup, commerce, member, audience, realtime and federation routes are under `src/app/(frontend)`.
- `src/modules/payload-domains.ts` is the one registry joining 14 domains. A new collection/task/global requires its owning domain, a migration, generated types, registry test update, and acceptance evidence.
- Outbound adapter behavior belongs in the owning module (`email`, `social`, `network`, `commerce`, `extensions`), where normalized failure, audit, retry, and idempotency are already defined.
