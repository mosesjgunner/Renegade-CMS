# Full-stack completion reconciliation

Audit date: 2026-08-25 (Second Pass Prompt 0). Evidence comes from registered Payload configuration, migrations, reachable routes/workers, code paths, and tests; documentation alone was not counted as completion.

## Classification legend

- **COMPLETE** — deployed vertical slice with schema, runtime, and focused evidence.
- **PARTIAL** — meaningful implementation, but a required surface or operating behavior is absent.
- **SERVER-ONLY** — schema/runtime exists without required user surface.
- **UI-ONLY** — user surface exists without canonical backed implementation.
- **STUB** — intentionally limited executable placeholder.
- **PLANNED-ONLY** — types/contracts/plans with no registered persisted vertical slice.
- **MISSING** — no equivalent canonical owner/implementation.
- **BLOCKED** — prevented by recorded external/repository condition.

## Current-state matrix

| Prompt | Capability                         | State            | Verified implementation and remaining gap                                                                                                                                                                                                                                            |
| ------ | ---------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1      | Shared jobs/integration runtime    | **PARTIAL**      | Payload PostgreSQL Jobs plus operations, editorial, media, social tasks are registered with retry/concurrency keys. `audienceTasks` is unregistered; no generic provider webhook/reconciliation runtime or release orchestration exists.                                             |
| 2      | Public frontend/themes             | **PARTIAL**      | Public content/article/preview routes, SEO, sitemap/robots, two page-layout themes, Puck builder APIs and acceptance tests exist. Public rendering is not complete for all canonical types; theme management, feeds and localization UI remain absent.                               |
| 3      | Member auth/passkeys               | **PARTIAL**      | Member/session/identity/recovery/audit collections, magic-link endpoints, member session logic and staff passkey authentication exist. Member self-service passkey/recovery UX, OAuth and account consent UI are absent.                                                             |
| 4      | Web3/SIWX                          | **STUB**         | CAIP contracts plus wallet identity/nonce vocabulary exist. Reown/SIWX dependencies and verified browser/server flow are deliberately absent; tests confirm capability-gated non-activation.                                                                                         |
| 5      | Spaces/profiles/forums             | **PARTIAL**      | Profiles, Spaces, Relationships, forums/discussions/posts and CalendarEntry are registered/migrated; isolation/moderation invariants have DB evidence. Public/member community routes and self-service authorization do not exist.                                                   |
| 6      | Messaging                          | **PLANNED-ONLY** | Encryption/envelope and retention vocabulary exists in contracts/ADRs. No conversation, participant, message, key, migration, route or worker is registered.                                                                                                                         |
| 7      | Media Studio/public media          | **PARTIAL**      | Media spine; books/podcast/video/interview/livestream/graphics/derivative/edit-session collections; task shapes; and media acceptance test exist. Studio UI, byte ingestion/serving adapter, public media routes and live connections remain incomplete.                             |
| 8      | Transcription/TTS                  | **SERVER-ONLY**  | Transcript revisions, TTS outputs, MediaJobs and retryable task shapes are registered/migrated. Handlers only mark jobs complete; no provider, byte pipeline, review UI or playback integration exists.                                                                              |
| 9      | Social publishing                  | **PARTIAL**      | Registered/migrated account/draft/variant/queue/attempt/external-post/campaign records, a Social Studio route, approval/idempotency contracts and worker exist. Only fixture ActivityPub/Bluesky adapters execute; real connections, webhooks/reconciliation and full UI are absent. |
| 10     | Calendar/graphics                  | **PARTIAL**      | Native Events/Timelines/CalendarEntries and SocialCalendarEntries/GraphicDocuments exist; PostgreSQL-first timeline and calendar audit behavior are tested. No unified calendar UI, graphic editor/export renderer or full public event/timeline presentation is complete.           |
| 11     | Forms/subscribers/newsletters      | **PLANNED-ONLY** | `Audience.ts` and audience contracts define forms, consent, segmentation, delivery and automation; email task has a development adapter. Collections/tasks are not registered in Payload and have no migration, routes or UI.                                                        |
| 12     | Store/dynamic checkout             | **PLANNED-ONLY** | Commerce contracts/unit evidence cover discovery, carts/entitlements, ledgers and payment-event dedupe. No registered schema, migration, checkout route, webhook or provider adapter exists.                                                                                         |
| 13     | Crypto/crowdfunding/POD            | **PLANNED-ONLY** | Commerce contracts include crypto/support/crowdfunding/POD boundaries. No canonical records, provider, observer, fulfillment workflow or UI exists.                                                                                                                                  |
| 14     | Analytics/operations               | **PARTIAL**      | Operations configuration, installation, PostgreSQL Jobs, diagnostics and job integration tests are implemented. Analytics contracts/source collection definitions exist, but Analytics is not registered/migrated and has no ingestion/dashboard UI.                                 |
| 15     | Import/export/production hardening | **PARTIAL**      | Versioned portability contracts, migration registry, config safety, logging redaction, Docker docs and unit tests exist. No executable import/export service, backup/restore rehearsal, retention purge, clean-host launch proof or passing production build gate.                   |

## Enterprise capability matrix

| Capability                                      | State       | Existing concepts to extend; canonical owner                                                                                                                                                                    |
| ----------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Coordinated Content Releases                 | **MISSING** | Reuse `article-family-content`, immutable `revision-records`, `scheduled-publish-jobs`, `campaigns` and Payload Jobs; no parallel publishing spine. **Prompt 1** owns a release aggregate/workflow if required. |
| B. Translation Operations                       | **MISSING** | Reuse `content`/article revisions, Site/Publication/Space scope, SEO and public-localization helpers. **Prompt 2** owns locale variants, translation requests, review and release gates.                        |
| C. Optional Enterprise Administrator Identity   | **MISSING** | Extend staff `users`, passkey auth, roles and audit vocabulary; do not duplicate Members. **Prompt 3** owns optional enterprise identity.                                                                       |
| D. Digital Asset Governance                     | **PARTIAL** | Extend `media-assets`, `media-usages`, `media-derivatives`, `graphic-documents`, retention and credits/license fields. **Prompt 7** owns rights provenance, approvals, usage policy and governance audit.       |
| E. Privacy-Safe Personalization/Experimentation | **MISSING** | Reuse prospective `consent-events`, `audience-segments`, analytics events/goals, capabilities and scope. **Prompt 14** owns persisted experiments/decisions.                                                    |
| F. Unified Site Quality Center                  | **MISSING** | Reuse diagnostics/jobs, SEO/schema helpers, page-layouts, audit and analytics contracts. **Prompt 14** owns quality findings/checks/approval/dashboard.                                                         |

## Existing schema ownership map

| Domain                             | Canonical registered owner                                                                                                                                                         | Notes                                                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenancy/staff                      | `sites`, `users`, `site-settings`                                                                                                                                                  | UUID PostgreSQL IDs; staff roles are `owner`/`staff`; Site Settings owner-update only.                                                                                       |
| Identity/community                 | `members`, `linked-identities`, `member-sessions`, `identity-tokens`, `member-recovery-codes`, `identity-audit-events`, `profiles`, `spaces`, `relationships`                      | Member owns public identity; LinkedIdentity is the future SIWX/OAuth/passkey association owner.                                                                              |
| Editorial                          | `brands`, `publications`, `authors`, `content`, `article-family-content`, `markdown-conversion-reports`, `revision-records`, `preview-tokens`, `scheduled-publish-jobs`, `sources` | EditorialWorkspace, EditorialChangeSet, ReviewRequest, grammar/dictionary types are not collections. Workflow audit/review data is embedded in article-family content.       |
| Discovery                          | `sections`, `categories`, `topics`, `tags`, `series`, `taxonomy-redirects`, `events`, `timelines`, `timeline-memberships`                                                          | SEOFields/structured-data source helpers are `canonical-shared.ts` fields used by content/events/timelines/Site Settings. PostgreSQL is canonical; graph is projection-only. |
| Community/calendar                 | `forum-sections`, `forums`, `discussions`, `discussion-posts`, `calendar-entries`                                                                                                  | Planning CalendarEntry is distinct from native Event.                                                                                                                        |
| Media                              | `media-assets`, `albums`, `media-usages`, media publishing collections                                                                                                             | MediaAsset/Derivative/GraphicDocument are concrete; EditRecipe is contract/derivative data. Credits/license/uses exist; governance is incomplete.                            |
| Social                             | `social-accounts`, `social-drafts`, `social-network-variants`, `social-queue-items`, `social-publish-attempts`, `external-posts`, `campaigns`, `social-calendar-entries`           | Campaign is concrete.                                                                                                                                                        |
| Audience (unactivated)             | source-only `Audience.ts`                                                                                                                                                          | WorkflowItem, AudienceSegment, ConsentEvent, ActivityEvent, notifications, forms, subscribers/deliveries are defined but not Payload-registered or migrated.                 |
| Analytics (unactivated)            | source-only `Analytics.ts`                                                                                                                                                         | Analytics events, rollups, snapshots/goals are defined but not Payload-registered or migrated.                                                                               |
| Commerce/portability/extensions/AI | TypeScript contracts                                                                                                                                                               | No collection/migration owner yet.                                                                                                                                           |

Locale/localization is a public helper and test only, with no persisted locale/variant owner. Basic rights/credits/usage is `media-assets` plus `media-usages`; unified audit is currently article workflow JSON, `identity-audit-events`, Payload history/jobs and selected social/calendar records. There is no general audit/retention operations service.

## Current route map

| Surface           | Actual routes/status                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public            | `/`, `/[...path]`, `/articles/[slug]`, `/preview/article/[token]`, `/robots.txt`, `/sitemap.xml`; rendering is limited to implemented article/layout paths. |
| Builder/social UI | `/builder/[id]`, `/guided-setup`, `/connections`, `/social-studio`.                                                                                         |
| Auth              | `/login`; member magic-link request/complete/logout and passkey options/complete APIs.                                                                      |
| Setup/health      | `/setup`; setup options/complete APIs; `/health/live`, `/health/ready`, guarded foundation smoke API.                                                       |
| Layout API        | `GET/POST /api/layouts`, `GET/PATCH /api/layouts/[id]`; public draft protection is implemented.                                                             |
| Payload           | REST, GraphQL, GraphQL Playground, Admin under `/(payload)`.                                                                                                |
| Webhooks          | **None.** No provider callback verification/replay runtime for social, email, commerce or analytics.                                                        |

## Payload, migration, job/worker map

`src/payload.config.ts` registers all collection owners above except `Audience.ts` and `Analytics.ts`; `site-settings` is the sole global. Payload Jobs registers operations/editorial/media/social, not `audience-email-delivery`.

| Migration                                                                                  | Scope                                          |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `20260812_010209_initial_foundation`                                                       | users/sites/Payload baseline                   |
| `20260812_034055_m02_operations_jobs`                                                      | PostgreSQL Payload Jobs/retries                |
| `20260812_080000_m02_first_run_installation`, `20260812_081000_m02_single_use_setup_token` | installation/bootstrap                         |
| `20260813_054441_canonical_information_architecture`                                       | Site/Publication/Space/community/content/media |
| `20260814_120000_m03_5_event_timeline_reconciliation`                                      | Events/Timelines reconciliation                |
| `20260818_000000_site_settings`, `20260818_010000_reconcile_seo_canonical_columns`         | global/SEO reconciliation                      |
| `20260818_062327_m04_c_editorial_workflow`                                                 | article revisions/previews/scheduling          |
| `20260822_010232_page_layouts`                                                             | portable layouts                               |
| `20260822_012313_m07_a_passwordless_identity`                                              | Member identity/session/recovery/audit         |
| `20260825_171336`, `20260825_171738`                                                       | media publishing + video provider identity     |
| `20260825_173116_social_distribution`                                                      | social/campaign/calendar-audit schema          |

`npm run jobs:worker` runs Payload’s `operations` queue/schedules. Registered tasks: operations heartbeat/retry proof, editorial scheduled publish, media import/render/transcribe/TTS task shapes, and social publish. They use bounded retries/concurrency keys; durable provider-wide reconciliation does not exist.

## Provider/connection, auth/authz, media/storage, import/export map

- Provider/connection: Extension manifests/contracts and Connections Center exist. Reference adapters are local object storage, development transactional email, fixture ActivityPub/Bluesky. There is no persistent connection/secrets schema or activated live provider.
- Auth/authz: staff uses Payload `users` passkey auth; job queue/run/cancel requires `owner`. Members use independent hashed magic-link/session/recovery records. Community/media/social mutations remain staff-only, so Member/Space self-service is not active.
- Media/storage: `media-assets.storageLocation`/`storageProvider` owns byte pointers. Uses/derivatives/graphics/transcript/TTS records persist, but no upload/derivation/CDN/object-store connection, scan, signed delivery or public media route is verified.
- Import/export: deterministic/checksummed contract supports dry-run/review gates, stable IDs, checkpoints, redirects and non-secret manifests. No registered job, run/checkpoint schema, archive writer, importer endpoint or production round trip exists.

## Test/evidence map

Focused evidence covers config/logging/contracts; canonical PostgreSQL information architecture; operations jobs; installation; editorial acceptance; page builder; media acceptance; and social/AI/audience/analytics/commerce/portability unit contracts. This Prompt 0 audit did not rerun database tests because no live database availability was established. Historical handoff records a pre-existing `/_global-error` prerender `useContext` build failure; it remains production verification debt. The directory is not a Git worktree, so status/history evidence is unavailable.

## Dependency graph

```text
Site + Publication + Space ownership
  -> Members / staff authorization
  -> Content + immutable revisions + MediaAsset
     -> scheduled publish (Payload Jobs) -> public article/layout rendering
     -> Social campaigns/variants -> optional provider boundary
  -> Events/Timelines/Calendar planning

Extensions/connections capability boundary -> optional providers only
Audience + analytics prospective schema -> consent/segments -> Prompt 14 experiments/quality
Portability contracts -> every canonical owner -> Prompt 15 executable proof
```

## Exact remaining implementation order

1. Shared jobs/integration runtime and Coordinated Content Releases: extend existing revisions/schedules/Campaigns/Jobs.
2. Public frontend/themes and Translation Operations: extend content/localization/SEO without a second content spine.
3. Member auth/passkeys and Optional Enterprise Administrator Identity: extend distinct Users/Members securely.
4. Web3/SIWX: capability-gated, pinned, browser/server verified flow.
5. Spaces/profiles/forums: self-service policy and public/member surfaces over current records.
6. Messaging: first conversation/envelope slice with retention/audit.
7. Media Studio/public media and Digital Asset Governance: extend existing assets/usages/derivatives.
8. Transcription/TTS: provider-neutral, reviewable byte pipelines.
9. Social publishing: real connections, callback reconciliation and full approval UI.
10. Calendar/graphics: unified planning/native-event presentation and graphics workflows.
11. Forms/subscribers/newsletters: register/migrate Audience before routes/delivery/consent UI.
12. Store/dynamic checkout: persist commerce, secure checkout and provider webhook boundary.
13. Crypto/crowdfunding/POD: extend commerce; never duplicate wallet identity/payment records.
14. Analytics/operations plus Personalization/Experimentation and Quality Center: registration, consent, approvals, observability.
15. Import/export/production hardening: executable portability, backup/restore rehearsal and launch gates.

## Unresolved decisions

- Do not create duplicate release, translation, enterprise identity, asset governance, experiment or quality families; extend the owners named above.
- Confirm whether unregistered `Audience.ts`/`Analytics.ts` are intentionally prospective or should become canonical Payload schemas; do not silently register divergent replacements.
- Resolve the historical production-build failure and establish a clean PostgreSQL verification environment before claiming hardening complete.
