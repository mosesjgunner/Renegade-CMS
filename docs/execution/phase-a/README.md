# Phase A control plane (A-00)

This directory is the commit-bound execution and evidence system for approved Phase A cards. It is coordination only: it neither grants capability readiness nor changes an application contract.

## Baseline

| Item | Value |
| --- | --- |
| Base commit | `3375297ed9403631f900c37be49efdec9ad3e8a6` (`2026-08-31T17:57:15-05:00`, `Tests and Fixes`) |
| Control-plane branch | `phase-a/a00-control-plane` |
| Worktree | `C:\Projects\Renegade CMS-phase-a-a00-control-plane` |
| Node / npm | `v24.14.1` / `11.1.0` (required: Node `>=20.9.0`, npm `>=10`) |
| Application/runtime | Next.js `16.3.0`, React `19.2.8`, Payload `3.88.0`, `@payloadcms/db-postgres` `3.88.0`, PostgreSQL image `17.6-alpine` |
| Test/runtime tools | TypeScript `5.9.2`, Vitest `3.2.4`, Playwright `1.62.1`, Docker `29.3.1`, Compose `v5.1.0` |

The base has tracked generated Payload files: `src/payload-types.ts` (SHA-256 `AA0CFFD928338456AE12A53C2D7F92AA9E079842DE882200F565593AC256E3F3`) and `src/app/(payload)/admin/importMap.js` (SHA-256 `1C2F046C940EB33E3587891344FBB2B7ACE35198E076DEA8E1226A77B7C94662`). Both are present and tracked at baseline. Their reconciliation is a merge-checkpoint responsibility, not work individual cards perform independently.

## Registered migration ledger

`src/migrations/index.ts` registers these 39 migrations, in this order:

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
```

## Operating rules

- Each card begins from the base SHA named above, uses its Resource Map row, and writes only its assigned evidence file.
- Cards do not edit `CHECKLIST.md`, `EVIDENCE_INDEX.md`, `RESOURCE_MAP.md`, or `SHARED_CONTRACTS.md`; A-00 reconciles those shared files at checkpoints.
- Schema cards report whether regeneration is required. The checkpoint coordinator runs `npm run generate:types` and `npm run generate:importmap`, reviews the resulting tracked files, and records the result.
- New migrations are append-only, globally time-ordered names in `src/migrations/`, registered once in `src/migrations/index.ts`, and may never reuse a registered name. Reserve a final name with the coordinator before creating it.
- A card is not ready merely because its documentation says so. Its evidence must contain an explicit definition-of-done verdict.

## Existing executable surface

| Purpose | Command |
| --- | --- |
| Formatting | `npm run format:check` |
| Lint / types / unit | `npm run lint`; `npm run typecheck`; `npm test` |
| Build | `npm run build` |
| PostgreSQL integration | `npm run test:integration` |
| Browser | `npm run build`; `npm run test:browser` |
| Migrations | `npm run test:migrations:fresh`; `npm run test:migrations:upgrade` |
| Generated files | `npm run generate:types`; `npm run generate:importmap` |
| Release clean clone | `npm run verify:release` |

`playwright.config.ts` currently fixes Chromium/Chrome and web server port `3110`; a concurrent card must use its allocated private browser configuration or defer browser proof to a checkpoint. The checked-in `compose.yaml` exposes PostgreSQL on `5432`; use an untracked, card-specific Compose override as specified in the Resource Map. Never attach to a shared database or `media` directory.

Relevant existing test entry points include `tests/unit/config.test.ts`, `execution-foundation.test.ts`, `operations-diagnostics.test.ts`, `operational-lifecycle.test.ts`, `operational-backup.test.ts`, `public-contracts.test.ts`, `public-navigation.test.ts`, `media-contracts.test.ts`, `media-storage.test.ts`, `portability-contracts.test.ts`, and the isolated integration suites `payload-postgres`, `installation`, `operations-jobs`, `canonical-information-architecture`, `editorial-acceptance`, `media-acceptance`, `page-builder-acceptance`, and `upgrade-migration`.

See [CHECKLIST.md](CHECKLIST.md), [SHARED_CONTRACTS.md](SHARED_CONTRACTS.md), [RESOURCE_MAP.md](RESOURCE_MAP.md), and [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md).
