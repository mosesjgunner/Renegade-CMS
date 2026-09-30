# Semantic URL architecture

## Runtime behavior

Public canonical paths are resolved through `src/modules/public/semantic-url.ts` and the discovery service. The resolver accepts stable domain slugs and optional route templates; database IDs are never used to form public canonical URLs. Site settings can define defaults and per-site overrides. Template validation rejects invalid paths, unsupported variables, reserved application routes, and overlapping route shapes.

The live discovery/rendering boundary currently covers editorial content and page layouts, events, timelines, topic archives backed by the existing Topics taxonomy, albums, books, products, forums/discussions, podcast shows/episodes, and videos where those collections are registered and public. The resolver also defines route patterns for politicians, organizations, legislation, collections, and typed media, but those patterns do not create collections, public renderers, or discovery records. Those domains remain unavailable until existing domain models are wired into discovery; configuration alone does not make them live. CRM organizations are not public organizations.

Published path changes retain history in the canonical `public-redirects` collection. Redirect inputs are constrained to safe local paths, history is site scoped, and earlier exact redirects are flattened when a published path changes. Stable URL generation is integrated with publishing hooks and discovery output, including canonical metadata and sitemaps. Editors can preview the URL derived from the current settings before publishing.

## Migration and rollout

1. Deploy the schema migration `20260924_060000_semantic_route_templates` before deploying code that reads the new global fields.
2. Start with the default templates. Test custom templates and collisions in staging for each site.
3. Run `npm.cmd run semantic-url:backfill` to produce a read-only report. The command does not write unless passed `--apply`.
4. Resolve every reported conflict before applying. The backfill aborts all writes if its preflight finds a conflict. It creates a redirect before changing each canonical path, so rerunning after an interrupted apply is safe.
5. Run the full unit suite, database integration tests, migration checks, production build, and route/canonical/sitemap smoke tests against a disposable acceptance database before release.

Do not run `--apply` against a shared or production database as a discovery step. Review the dry-run report first and use the repository's guarded acceptance database workflow for migration and restart proof.

## Operator and release checks

- Verify each canonical path resolves on the correct site and that private, draft, archived, and missing records remain unavailable.
- Verify a published slug/template change returns one permanent redirect from every historical path to the newest path, preserving allowed query parameters.
- Verify sitemap entries and canonical metadata use the same resolved path and site origin.
- Verify reserved routes and colliding records are rejected by publishing and backfill preflight, including collisions with page layouts, forms, and redirects.
- Verify preview requests require an authenticated admin session and do not mutate content.
- Keep unsupported domain types visibly unavailable; do not treat a valid route template as evidence that a provider/domain renderer exists.
