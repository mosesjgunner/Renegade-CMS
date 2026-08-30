# Productization Pass ? live repository plan

Reconciled 2026-08-29; implementation baseline only, not a release-readiness claim.

## A. Current-state inventory

| Capability                                | Status                     | Canonical ownership, persistence, evidence, gap                                                                                                                                                                                                |
| ----------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payload/PostgreSQL runtime                | IMPLEMENTED BUT UNVERIFIED | `payload.config.ts`, payload domains, registered collections/migrations; Payload Admin and domain tests. No live stack proof this pass.                                                                                                        |
| Production containers                     | IMPLEMENTED BUT UNVERIFIED | `Dockerfile`, production Compose: PostgreSQL, migration, web/worker, named DB/media volumes, ready/live/worker checks. Docker rehearsal remains.                                                                                               |
| Config/secrets                            | VERIFIED                   | core config, env examples and tests validate production URL/secret/proxy/storage/SMTP.                                                                                                                                                         |
| Setup/owner/recovery                      | IMPLEMENTED BUT UNVERIFIED | operations installation, `installation_state`, users/passkeys/recovery codes, setup routes/CLI and integration test. Needs torture evidence.                                                                                                   |
| Jobs/diagnostics/profiles                 | IMPLEMENTED BUT UNVERIFIED | Payload Jobs, worker, operations/editorial/release/social/audience tasks and diagnostics. Worker uses `operations`; profiles are guidance, not runtime controls.                                                                               |
| Backup/restore/portability                | PARTIAL                    | operational scripts and encrypted portable contracts; unit evidence, but no isolated DB/media restore rehearsal.                                                                                                                               |
| Migrations/upgrades/versioning            | PARTIAL                    | ordered migrations through `20260829_130000`, migration gate/scripts. No dedicated DB rehearsal; 0.1.0 has no release artifact/channel.                                                                                                        |
| Extension manifest/lifecycle              | CONTRACT-ONLY              | extension contracts declare compatibility, dependencies/conflicts, config, permissions, migration/data/export/uninstall/budget. No persisted install/discovery/trust/lifecycle.                                                                |
| Extension compatibility                   | VERIFIED (contract scope)  | registry and unit tests; not wired to installed state.                                                                                                                                                                                         |
| Providers/connections                     | PARTIAL                    | capability/connection contracts and local/development executable reference adapters. Connections UI is caller-fed; no credential store/OAuth/revocation.                                                                                       |
| Trusted plugins/tools                     | CONTRACT-ONLY              | agent/tool manifests only; no loader/isolation/signature/local install/durable approval.                                                                                                                                                       |
| Themes/page builder                       | PARTIAL                    | PageLayouts, first-party Puck/page registry, `themePreset`, API tests. No theme manifest/discovery/update lifecycle.                                                                                                                           |
| Social queue/audit                        | IMPLEMENTED BUT UNVERIFIED | social account/draft/variant/queue/attempt/external-post records and task; no live credentials.                                                                                                                                                |
| ActivityPub/Fediverse                     | OPT-IN LIVE                | Publication actors expose WebFinger, NodeInfo, signed inboxes and ActivityStreams documents. Remote identity/key fetches use the network safe-fetch boundary; inbound replies remain moderation-held and persisted delivery uses Payload Jobs. |
| ATProto/Bluesky                           | FIXTURE-ONLY               | same fixture path; no DID/handle, auth/session, record creation, moderation or sync.                                                                                                                                                           |
| Other networks; messaging/federation jobs | CONTRACT-ONLY / ABSENT     | SocialAccounts models networks; task rejects non-fixtures. No messaging, remote moderation or federation worker.                                                                                                                               |
| Remote HTTP safety                        | IMPLEMENTED BUT UNVERIFIED | core external-boundary and security tests; reuse for all remote work.                                                                                                                                                                          |
| Revisions/conflicts                       | IMPLEMENTED BUT UNVERIFIED | article-family content, immutable revisions, workflow base-revision conflict; unit/integration tests, no browser concurrent proof.                                                                                                             |
| Review/releases                           | IMPLEMENTED BUT UNVERIFIED | editorial workflow, scheduling, content releases/task/audit/quality blockers; no reviewer assignment/conversation/notification.                                                                                                                |
| Discussions                               | PARTIAL                    | forum/discussion/post records and public route; staff-only writes, no member UI/mentions/realtime. Not staff review threads.                                                                                                                   |
| Assignments/notifications                 | PARTIAL                    | audience owner-assignment/workflow/notification/preference/channel models; CRM-oriented, no inbox/producer/mention/realtime wiring.                                                                                                            |
| Lexical/Puck realtime                     | ABSENT                     | canonical Lexical/layout revisions exist, but no CRDT/OT/locks/presence/cursors/merge or websocket/SSE runtime.                                                                                                                                |

**Product state:** installable self-hosted application, not yet distributable product. Missing proof/artifacts and lifecycle?not a rewrite.

## B. Canonical ownership decisions

| Capability                          | Extend                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| Version/build/health/operator tools | core config, operations diagnostics, Capability Center                                  |
| Installer/owner recovery            | operations installation/setup routes/migrations                                         |
| Upgrades                            | migration ledger, compose gate, diagnostics, package/build metadata                     |
| Extensions/providers/themes         | extension contracts/registry; existing page registry/`themePreset` for themes           |
| Remote identities/federation        | identity additive remote records; social queue/audit plus Payload Jobs                  |
| Notifications/mentions              | audience notification/preference/channel family                                         |
| Assignment/review                   | editorial workflow/revisions linked to audience notifications, never public discussions |
| Presence/editing                    | optional layer over canonical editorial/page-layout persistence                         |

## C. Dependency order

Existing release/quality work partially covers early items; close gaps rather than recreate it.

1. Product/runtime identity and operator tooling.
2. Installation.
3. Releases/upgrades.
4. Extension lifecycle.
5. Extension SDK/local trusted catalog.
6. Shared network core.
7. ActivityPub.
8. ATProto/Bluesky.
9. Editorial collaboration.
10. Realtime presence/editing.
11. Unified system/product center.
12. Acceptance/handoff.

## D. Expected systems affected

Future prompts may affect `package.json`, env/Docker/Compose/worker scripts; core, operations, extensions, social, identity, editorial, audience and public modules; registrations, selected collections, additive migrations/index, setup/admin/API/frontend routes, focused tests and operations docs. Do not broadly rewrite rendering or collections.

## E. Explicit reuse decisions

Reuse Payload, PostgreSQL, Payload Jobs, web/worker topology, Site/Publication/Space/UUID ownership, extension contracts, social queue/audit, editorial revisions/releases, audience notifications, external HTTP guard, portable export and operational backup. Replace fixtures only with bounded real adapters; public reads never depend on optional health.

## F. Explicit non-goals

No CMS rewrite, frontend/framework or database replacement, needless microservices, mandatory Kubernetes/Redis unless proven necessary, centralized marketplace dependency, arbitrary remote extension code, Mastodon recreation, embedded ATProto PDS, generic project-management suite, Payload-internal patches or broad formatting cleanup.

## G. Migration strategy

Likely additions are extension install/config/audit and protected credential refs; remote actors/relationships/delivery; editorial assignment/review/mention links; optional collaboration sessions/presence. Use timestamped registered, additive/idempotent migrations with explicit backfills; preserve unknown extension data, never drop live data. Rehearse fresh install and sentinel upgrade in disposable PostgreSQL. Production remains forward-safe, repeatable and ledger-auditable.

## H. Security boundaries

Secrets (env, provider credentials, bootstrap tokens, passkey material, archive keys) never enter logs/exports/public responses/config UI. Installation/recovery/migrations/restores are privileged operator actions. Manifests/config are data; executable plugins must be locally trusted/signed/admin-controlled/permissioned, never arbitrary remote code. Treat remote HTTP/federation/media as hostile: SSRF guard, limits, identity/signature verification, queue isolation and redaction. Scope/verify/revoke provider credentials/webhooks. Realtime channels require document authorization and async fallback.

## I. Resource-profile behavior

| Profile  | Behavior                                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Lean     | Preserve core reads/editing/install/state; defer heavy media, federation bursts and realtime; optimistic revisions/queued retry. |
| Standard | Existing web plus operations worker and bounded normal jobs.                                                                     |
| Media    | Constrained separate media capacity; fetching cannot impair reads.                                                               |
| Scale    | Measured Payload concurrency/role scaling, one schema; realtime limits and async fallback.                                       |

AI, email, federation, ATProto, realtime, external storage and payments remain optional.

## J. Acceptance criteria

- Install, owner bootstrap, upgrade and isolated restore have executable evidence.
- Version/build/health/profile diagnostics are accurate and secret-safe.
- One persisted compatibility-checked administrator lifecycle exists for extensions; no remote code loading.
- Network core safely owns remote identity/outbound jobs; ActivityPub/Bluesky are live only after real evidence.
- Editorial assignment, review conversations, mentions and durable notifications work; public discussion stays separate.
- Optional realtime is authorized/conflict-safe; async editing remains complete without it.
- One schema serves all profiles and validation labels fixture/provider-dependent work honestly.

This pass does **not** claim release readiness; the following cleanup/security/installation-torture-test/release-candidate pass owns that decision.
