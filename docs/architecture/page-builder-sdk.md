# Visual builder and theme SDK v1

## Decision

Puck 0.23.0 (`@puckeditor/core`) is the visual-canvas adapter. It is React/Next compatible, MIT licensed, supports registered components, migration, viewport previews and feature permissions. The application stores only `PageLayout` v1 from `src/modules/public/page-builder.tsx`; `PuckPageEditor.tsx` is a one-way integration boundary. Replacing Puck therefore requires a new adapter, not a data migration.

Payload Blocks remain suitable for canonical editorial content; the builder composes registered React components around that content. GrapesJS was rejected for public composition because its free-form HTML/CSS project model is incompatible with stable component schemas. Craft.js was rejected because it would require building more canvas behavior ourselves without a stronger fit than Puck.

## Durable data and upgrades

Each block has a stable namespaced component ID, component version, JSON-safe props, responsive visibility and optional graphic placeholder. `validateLayout` preserves unknown, removed, or version-mismatched blocks in `unknownBlocks` and reports them; it never deletes the original data. `migrateLayout` is presentation-only. Theme switching changes only the theme ID and does not duplicate or mutate canonical content.

Only trusted deploy-time code may call `registerDeveloperComponent`, and it requires `layout:developer-register`. Registrations declare fields, editor controls, render/fallback functions, capability dependencies, permission requirements and a compatibility version. Browser users cannot submit JSX, scripts, executable code, raw CSS, or arbitrary HTML. Custom embeds are a reference-only extension point until an allowlisted embed adapter exists.

## Editing and safety

The layout reducer supports selecting, visible-field edits, reorder, duplicate, responsive visibility, hide/show, delete/undo, image-placeholder replacement, draft state and permission-gated publish. Renderers use registry components and theme tokens; they never evaluate stored code or styles. `layout:publish` is required to publish. A profile/Space layout carries its own `spaceId`, keeping customization scoped from site chrome and other profiles.

Graphic placeholders are first-class block state: purpose, aspect ratio, recommended dimensions, subject/style/composition, placement, text-safe area, accessibility reminder, and upload/media-browse/idea/prompt/replace actions. Idea and prompt actions are hooks, not AI generation.

Advanced CSS remains disabled in v1. Enabling it later requires `layout:advanced-css`, an allowlisted parser and URL policy, size limits, scoped cascade/CSP, preview/reset, moderation controls and regression tests; raw user CSS must not be concatenated into a response.

## Recipes and guided setup

The builder supplies previewable one-time recipes for member profile, writer/blogger, photographer portfolio, community forum, creator support, organization, and maximalist social Space. Guided setup maps independent publication, community/forum, creator portfolio, podcast/media outlet, nonprofit/campaign, local business, research/civic project and store/supporter site to these shared primitives. A recipe is a draft layout plus declared capabilities and three clear next actions; it never creates a product edition. Installation refuses an existing page rather than merging or duplicating content.

Navigation categories are Create, Publish, Community, Grow, Operate and System. UI implementations must hide disabled/empty capability families, reveal actions only after prerequisites exist, and use command search for advanced actions. Optional capabilities must explain relevance, resource/connection requirements and disable behavior without data loss.

## Current non-goals

There is no live forms backend, commerce implementation, unrestricted social graphic editor, arbitrary code mode, custom CSS mode, or AI content generation. Timeline blocks accept a selected Timeline, selected Events, or a dynamic query reference and leave PostgreSQL visibility/RetentionPolicy filtering to the canonical public-query adapter.

## Persisted acceptance path

`page-layouts` is an additive Payload collection with PostgreSQL migration `20260822_010232_page_layouts`. Its anonymous read policy is exactly `status=published AND visibility=public`; drafts and private layouts remain inaccessible through Payload APIs. `POST /api/layouts` creates a one-time draft from a previewed recipe for authenticated owner/staff users. `PATCH /api/layouts/:id` validates, retains unavailable blocks, appends a revision snapshot, and requires the same authenticated access before saving or publishing. `/builder/:id` loads the authenticated Payload API representation; `/guided-setup` previews recipe capabilities and next actions before installation. The existing catch-all public route resolves PageLayouts first and renders only records that pass the canonical public visibility/retention gate.

`tests/integration/page-builder-acceptance.integration.test.ts` proves the database-backed journey: recipe installation, guided media replacement, reorder, draft non-disclosure, mobile preview, publish, anonymous public availability, theme portability, and unknown-component preservation. Browser-screenshot tooling is not added in this repository; the representative renderer assertions cover both installed themes at the contract level.
