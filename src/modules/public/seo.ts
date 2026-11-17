/**
 * Renegade CMoS Canonical Discovery Boundary.
 * All canonical metadata, schema graph emission, sitemap entry generation,
 * and discovery state auditing are defined in `src/modules/public/discovery.ts`.
 *
 * This module previously carried a second, local metadata/JSON-LD composer
 * (buildMetadata/buildJsonLd). Nothing in the product imported it — only
 * tests of the helpers themselves did — so it was removed in the SEO 1.0
 * pass (§8 dead configuration): one discovery implementation, one truth.
 */
export * from './discovery'
