# Phase A control plane (A-00)

This is the commit-bound execution and evidence system for approved A-01 through A-10.
It is coordination and baseline work only: no implementation, schema/migration change,
test repair, external service, second architecture, Phase B work, or capability-readiness
claim is authorized by these documents.

## Baseline binding

| Item | Observed value |
| --- | --- |
| Repository | `https://github.com/mosesjgunner/Renegade-CMS` |
| Exact base commit | `3375297ed9403631f900c37be49efdec9ad3e8a6` (`Tests and Fixes`) |
| A-00 branch / worktree | `phase-a/a00-control-plane` / `C:\Projects\Renegade CMS\.worktrees\a00-control-plane` |
| Node / npm | `v24.14.1` / `11.1.0` (engines: Node `>=20.9.0`, npm `>=10`) |
| Runtime/dependencies | Next `16.3.0`, React/DOM `19.2.8`, Payload and `@payloadcms/*` `3.88.0`, `@payloadcms/db-postgres` `3.88.0`, TypeScript `5.9.2`, Vitest `3.2.4`, Playwright `1.62.1` |
| Generated Payload types | `src/payload-types.ts`, tracked, 11,186 lines, SHA-256 `AA0CFFD928338456AE12A53C2D7F92AA9E079842DE882200F565593AC256E3F3` |
| Generated admin import map | `src/app/(payload)/admin/importMap.js`, tracked, `CollectionCards` entry, SHA-256 `1C2F046C940EB33E3587891344FBB2B7ACE35198E076DEA8E1226A77B7C94662` |

## Registered migration ledger

At the bound commit, 40 migration files (excluding `index.ts`) are registered once in
`src/migrations/index.ts`, in this exact order:

```text
20260812_010209_initial_foundation
20260812_034055_m02_operations_jobs
20260812_080000_m02_first_run_installation
20260812_081000_m02_single_use_setup_token
20260813_054441_canonical_information_architecture
20260814_120000_m03_5_event_timeline_reconciliation
20260818_000000_site_settings
20260818_010000_reconcile_seo_canonical_columns
20260818_062327_m04_c_editorial_workflow
20260822_010232_page_layouts
20260822_012313_m07_a_passwordless_identity
20260825_171336
20260825_171738
20260825_173116_social_distribution
20260825_180000_calendar_graphics
20260826_053416_second_pass_schema
20260829_110000_content_release_execution
20260829_120000_quality_runtime
20260829_130000_progressive_disclosure_admin
20260829_140000_onboarding_settings
20260829_150000_integrations
20260829_160000_activitypub_delivery
20260829_170000_network_experience
20260829_180000_collaboration
20260830_090000_realtime_collaboration
20260830_100000_media_storage_workflow
20260830_110000_discoverability
20260830_120000_discoverability_lock_relation
20260830_130000_admin_auth_hardening
20260831_090000_phase_b_execution_foundation
20260831_100000_analytics_privacy_runtime
20260831_110000_events_workflow
20260831_120000_media_publishing_workflows
20260831_130000_books_quality_center
20260831_140000_public_api_webhooks
20260831_150000_phase_b_locked_document_relations
20260831_160000_phase_b_book_lifecycle_reconciliation
20260831_170000_phase_b_scoped_media_reconciliation
20260831_180000_phase_b_video_captions_relation
20260831_190000_phase_b_integrations_id_defaults
```

New migration names are globally unique and time-ordered across this whole ledger; reserve
the final name with the coordinator. Schema cards report a regeneration requirement, but
only checkpoint reconciliation runs `npm run generate:types` and `npm run generate:importmap`,
reviews tracked output, and records it in evidence.

## Verification surface and availability

Available commands: `npm ci`, `npm run format:check`, `npm run lint`, `npm run typecheck`,
`npm test`, `npm run build`, `npm run test:integration`, `npm run test:browser`,
`npm run test:migrations:fresh`, `npm run test:migrations:upgrade`, `npm run test:smoke`,
`npm run db:migrate`, `npm run db:status`, and `npm run verify:release`.

Relevant baseline tests: 58 unit files, 14 integration files, two browser specs plus
`global-setup.ts`, and `tests/smoke/stack.smoke.ts`; important Phase A-adjacent suites
include installation, payload-postgres, canonical-information-architecture, editorial,
media, page-builder, discoverability, operational-backup, public-contracts, and
public-navigation. Baseline results and infrastructure gates are in `EVIDENCE_INDEX.md`.

The current checked-in Playwright configuration fixes `3110`; concurrent browser work must
use a card-private configuration and its Resource Map port. Docker Compose is installed but
the Docker daemon was unavailable during A-00; no PostgreSQL service, isolated Compose
runtime, or browser gate was started. Chrome is installed; Playwright CLI is available.
Unrun infrastructure checks are **NOT RUN**, never passed.

## Card operating rules

Before implementation, read this file, `SHARED_CONTRACTS.md`, and `RESOURCE_MAP.md`; confirm
the dependency/checkpoint in `CHECKLIST.md`; use only that card's resource row; and write
only its assigned evidence file copied from `evidence/_TEMPLATE.md`. The coordinator alone
updates the checklist, resource map, and evidence index during reconciliation. See the four
linked control-plane documents for the complete operating contract.
