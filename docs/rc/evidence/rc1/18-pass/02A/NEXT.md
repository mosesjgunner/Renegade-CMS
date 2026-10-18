# Next subpass handoff — 02B

Previous subpass: `02A` (Sites and Persistent Settings) — **PASS**.
Next subpass: `02B` (Theme and Appearance Persistence).

## State at completion of 02A

- **Canonical Sites & Settings**:
  - `Sites` collection enforces name presence, normalizes slugs in `beforeValidate`, and auto-provisions a default active `publications` record for each newly created site in `afterChange`.
  - `SiteSettings` global validates URL protocols (strict HTTP/HTTPS) and detects cross-site host collisions in `canonicalOriginsBySite`.
  - Multi-site public consumption is bound to host-header site resolution in `publicSiteForHost`, ensuring each site receives its own scoped publication, theme, navigation, and branding, while unknown domains on multi-site installations return `''` to prevent tenant cross-contamination.
- **Active Site Session State**:
  - `/api/admin/active-site` endpoint provides operator-scoped site enumeration and sets `renegade-active-site` (30-day Lax cookie) upon authorized switch.
  - Sidebar `<SiteSwitcher />` and `NavigationCenter` `#nav-site-select` allow seamless operator site switching with session/reload/restart persistence.
  - Reset button in `NavigationCenter` allows discarding unsaved navigation changes cleanly.
- **Evidence & Cleanliness**:
  - Unit tests in `tests/unit/site-settings-multisite.test.ts` (3 tests) and `tests/unit/active-site-route.test.ts` (7 tests) pass.
  - Automated integration journey in `tests/rc1-02a/verify-02a.ts` verified 10/10 acceptance steps against an isolated disposable PostgreSQL 17.6 database.
  - Entire repository typecheck (`npm run typecheck`) and lint (`npm run lint`) pass with zero errors and zero warnings.

## Scope and focus for 02B

- Subpass: `02B/70 — THEME AND APPEARANCE PERSISTENCE`
- Focus: Native theme activation, color/typography presets, layout customizations, preview vs live appearance consistency, and persistence per site.
- Maintain isolation and preserve preexisting user environments. Do not begin 02B automatically.
