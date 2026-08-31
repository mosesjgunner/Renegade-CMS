# Five-phase execution baseline

**As inspected:** 2026-08-30. This is a live-worktree baseline, not a clean-Git baseline: `git status --short` already contained implementation changes (including realtime collaboration) before this directory was created. Do not overwrite those changes while using this plan.

## Phase map

The repository does not define Phase A--E. These are execution lanes, chosen to preserve the existing modular-monolith ownership rather than introduce a second architecture.

| Phase | Scope                                                   | Canonical owners                                             |
| ----- | ------------------------------------------------------- | ------------------------------------------------------------ |
| A     | foundation, installation, operations, configuration     | `core`, `operations`, `payload.config.ts`                    |
| B     | identity, site ownership, public/editorial presentation | `identity`, `editorial`, `public`, `releases`                |
| C     | media, audience/email, social and network delivery      | `media`, `audience`, `social`, `network`                     |
| D     | commerce, quality, analytics and experiences            | `commerce`, `quality`, `analytics`, `experiences`            |
| E     | integrations, extensions, portability and collaboration | `integrations`, `extensions`, `portability`, `collaboration` |

Use [CAPABILITY_MATRIX.md](CAPABILITY_MATRIX.md) for readiness; use [DEPENDENCY_MAP.md](DEPENDENCY_MAP.md) before changing a cross-system path; run [VERIFICATION.md](VERIFICATION.md) without weakening or skipping a failing check; consult [MERGE_RISKS.md](MERGE_RISKS.md) before parallel edits.

## Frozen cross-system contracts

- **Scope and identity:** PostgreSQL UUIDs are canonical (`src/payload.config.ts`, `src/modules/core/contracts.ts`). Use the existing `sites` record as the site boundary; `publications` and `spaces` are scoped below it. Use `siteScopeFields()` / `ownerFields()` from `src/collections/canonical-shared.ts`; do not infer scope from a singleton, slug, URL, or provider account. The branded `TenantID` contract remains future-facing: there is no registered `tenants` collection.
- **Principals:** staff authentication is `users` with passkey-only roles `owner | administrator | staff`; public people are `members`, with replaceable `linked-identities`, sessions, profiles, spaces, authors and publications. Do not collapse staff and member authentication (`src/collections/Users.ts`, `src/collections/Identity.ts`).
- **State:** retain each owning collection/service state machine. The common base is `draft | active | archived`; published visibility, moderation, retention, review, release, checkout, provider, and job states are not interchangeable (`src/collections/canonical-shared.ts`, `src/modules/editorial/workflow.ts`, `src/collections/Commerce.ts`).
- **Providers:** `ExtensionManifest`, `ProviderContract`, `ProviderAdapter`, and `ConnectionRecord` are the adapter boundary (`src/modules/extensions/contracts.ts`). Secrets are vault/encrypted references only. Providers cannot own canonical content, identities, moderation, or PostgreSQL truth. External failure must become disabled/degraded/manual state, never break public reads.
- **Events/jobs:** use registered Payload Jobs and the owning task; supply the existing idempotency key and concurrency shape. Jobs retain attempts and terminal evidence; retry is bounded exponential (`src/payload.config.ts`, `src/modules/*/tasks.ts`). There is no generic outbox table: delivery domains own their durable records (for example `outbound-network-deliveries`, `email-deliveries`, `social-queue-items`, `webhook-deliveries`). Do not invent a global event bus without an ADR and migration plan.
- **Audit/privacy:** append to the domain audit record/event rather than overwriting history. Apply `public | member | staff | secret | restricted`; use allowlisted public projections and structured-log redaction (`src/modules/core/contracts.ts`, `src/modules/core/logging.ts`, `docs/architecture/data-classification.md`). Consent is mandatory before analytics/experience collection or marketing automation; an end-user consent UI is not yet implemented.
- **Public boundary:** `src/modules/public` is projection-only. `canRenderPublic` / `canDiscoverPublic` gates must protect public and discovery routes; themes and extensions consume normalized values and do not mutate canonical data (`docs/architecture/public-rendering-contract.md`).
- **Extensions:** only reviewed trusted in-process extensions are supported. Preserve manifest compatibility, declared migration/export owner, permissions, and safe disable/uninstall behavior (`docs/architecture/extension-sdk.md`). No marketplace, dynamic code loader, or sandbox exists.

## Blocking decisions

1. **No true tenant model yet.** Treat Site/Publication/Space as the executable boundary; decide whether multi-tenant tenancy is needed before adding tenant persistence or changing all ownership fields.
2. **No generic outbox.** Retain domain-specific durable delivery records until an explicit cross-domain outbox ADR, migration, replay and retention design exists.
3. **Provider credentials and production interoperability require external validation.** Do not label SMTP, payment processors, Bluesky, federation, or crypto rails verified from fixtures alone.
4. **Public projection is intentionally narrow.** Do not expose new collection fields via the catch-all renderer without a typed allowlist and privacy review.

## Baseline validation snapshot

- Passed in this live worktree: `format:check`, `lint`, `typecheck`, `npm test` (**49 files / 192 tests**), and `test:migrations:fresh` through `20260830_090000_realtime_collaboration`.
- Failed before any source change in this session: aggregate integration has a deterministic stale assertion in `tests/integration/upgrade-migration.integration.test.ts` (expects the old final migration `20260829_180000_collaboration`); `test:smoke` fails at `tests/smoke/stack.smoke.ts:45` because the seeded public route does not render.
- Inconclusive in this Windows command host: the aggregate integration and upgrade scripts outlived the 30-second command window after emitting their initial output; production build completed compilation and TypeScript but its final exit was not captured. `verify:release` began a clean `npm ci` and was still running when this snapshot was recorded. None of these are passes.

## Safe parallel lanes

Parallel work is safe only when each lane avoids the shared files listed in the merge-risk register:

- A: operations diagnostics/deployment documentation and isolated operational tests.
- B: typed public projections or editorial acceptance tests, one canonical record family at a time.
- C: one adapter/runtime per domain (media, audience, social, or network), with no shared registry edits.
- D: one bounded domain (quality, analytics, experience, or commerce) plus its tests.
- E: portability/extension contracts or collaboration HTTP behavior, isolated from `payload-domains.ts` and migrations.

## Unblocked next prompts

1. `Phase A: add an authenticated PostgreSQL acceptance test for staff passkey session authorization; preserve Users/Member separation and do not modify migrations unless schema evidence requires it.`
2. `Phase B: implement one typed public projection for calendar events behind canRenderPublic/canDiscoverPublic, with a route-level acceptance test proving private, held, expired, and unlisted records never leak.`
3. `Phase C: implement the MediaAsset local upload/write/serve workflow using the existing media-assets ownership/provenance fields; add PostgreSQL plus HTTP acceptance coverage and preserve provider degradation.`
4. `Phase D: add an HTTP checkout-to-duplicate-webhook acceptance scenario using a fixture adapter; prove finalizeVerifiedOrder issues one receipt and adjusts inventory once.`
5. `Phase E: add authenticated multi-user collaboration HTTP acceptance coverage for invitation, site isolation, durable event recovery, and presence expiry; preserve the existing realtime migration and collections.`
