# PRE-01 — Local theme lifecycle

## Package authoring

The installation boundary is `theme-packages/<id>-<semver>/theme.json`, relative to the application working directory. The build copies this directory into standalone output. Install by copying a reviewed first-party directory into this boundary; use Capability Center → Themes → Refresh discovery. Packages are JSON data, never npm modules. Do not put README files, scripts, CSS, or executable configuration inside package directories; author documentation outside the boundary.

See the checked-in neutral-starter 1.0.0 and 1.1.0 packages for complete examples. Every field is required: `id`, `version`, `label`, `renegade` (presentation API semver range), `renderer`, `tokens`, `assets`, and `migrations`. Unknown fields fail closed. IDs follow lowercase kebab naming; ID/version pairs are unique, while multiple versions of one ID can coexist. Incompatible packages remain visible and cannot be selected.

`renderer` selects a compiled, validated PRE-00 registry (`neutral-starter` or `renegade-party`). This resolves the component allowlist, seven surface templates, and registered global shell regions. Additional executable renderers require an application source change, review, tests, and rebuild. Packages cannot name an import path or supply functions. Package version and renderer contract version are distinct.

Assets may be declared as `{ "path": "assets/example.png", "sha256": "<64 lowercase hex characters>" }`. Allowed extensions are png, jpg, webp, and woff2. Every file must be declared, every asset hash must match, and symlinks, traversal, nested directories, CSS, JavaScript, and SVG are rejected. The current compiled starter renderers do not consume package assets; declaring a file does not publish it at a public URL. Asset-serving/rendering extensions must retain this allowlist boundary.

The raw manifest SHA-256 is pinned in every saved configuration. It includes the declared asset hashes. Even a whitespace edit requires a fresh draft; never overwrite an active or rollback package in place. Retain both versions. These integrity checks detect local package drift; they are not a signature or protection against an administrator who can modify application code and the database.

## Tokens and migration rules

The owner editor exposes the exact allowed keys and defaults. Colors accept six-digit hex. Body/display font choices are `system-ui, sans-serif`, `Georgia, serif`, or `monospace`. Lengths accept bounded nonnegative px/rem values. Card shadows accept `none` or `0 2px 8px #00000020`; motion accepts 0, 50, 100, 150, or 200ms. Unknown keys, CSS functions, imports, declarations, and arbitrary values are rejected.

Ink and accent require 4.5:1 contrast against canvas and surface; focus requires 3:1. Token colors customize the starter light palette; its compiled dark palette remains independently defined. Variables are emitted inline on the public `body[data-theme]`, outside Payload admin. Typography, article spacing/content width, card radius/border/shadow, and motion use scoped consumers. OS reduced-motion preference takes precedence.

Migrations are versioned declarative `defaults` operations, for example:

```json
{
  "from": "1.0.0",
  "to": "1.1.0",
  "operation": "defaults",
  "tokens": { "radii.normal": "0.75rem" }
}
```

An upgrade with the same ID requires a matching source-version step. It adds defaults while retaining explicit existing token choices. Applying the target version again is a no-op. Migrations have no database or content API, arbitrary code, or article-body rewrite operation. A missing/invalid migration leaves active configuration and revision unchanged.

## Owner operation

1. Apply database migrations and deploy packages with the web application.
2. Open `/admin/capabilities`, find Themes, choose the site, and inspect installed versions, compatibility, capabilities, and update availability.
3. Select a package and enter allowed token overrides. Save theme draft. The first operation pins the current legacy Site Settings theme as the rollback baseline.
4. Start theme preview and open the public site in the same authenticated browser. The opaque, HttpOnly, same-site preview cookie refers to a database snapshot bound to owner ID, site ID, and a 15-minute expiry. A query string or preview cookie without current owner authentication cannot enable preview. End preview when finished; ending it revokes the stored owner/site tokens as well as clearing the browser cookie.
5. Activate theme. For the currently served publication, the API renders authenticated preview requests against home, archive, search, and sampled published canonical routes before committing. Package/token/template checks also run inside activation. If a preflight fails, the old active state remains. PostgreSQL locks the site row, compares the expected revision, replaces the complete configuration, writes its audit record, and revokes previews in one transaction. Root layout cache invalidation follows commit; public routes read dynamic state.
6. Roll back theme to swap in the previous compatible pinned configuration after the same public-route render preflight. Missing, altered, or incompatible active packages trigger transactional recovery to a compatible previous configuration during public resolution. If both packages are unavailable, reinstall a retained package and retry in Capability Center.
7. Restart web and worker normally. Active, previous, draft, audit, and preview state are database records, not process memory.

Database tables: `presentation_theme_state`, `presentation_theme_audit`, and `presentation_theme_previews`. Back them up with the existing PostgreSQL backup procedure. The filesystem package boundary must accompany database restores. Do not remove retained rollback packages.

Theme state and previews are keyed by site; owners retain the repository's installation-wide authority. Public request scope follows existing active/public publication precedence. The application has no host-to-site resolver, so this pass does not invent one. Non-served sites receive registry/package preflight; live HTTP preflight applies to the currently served site.

PRE-01 operates on theme configurations. Existing PageLayout document publication and legacy canonical template preferences are separate from theme activation; no layout or content migration is implicit in installing or upgrading a theme.

## Executable evidence

- `tests/unit/pre-01-themes.test.ts`: manifest and token rejection, undeclared files, junction/symlink rejection, duplicate identity, asset integrity, idempotent migrations.
- `tests/integration/pre-01-theme-lifecycle.integration.test.ts`: actual PostgreSQL row locking, competing activations, preview identity/site isolation, unchanged state after failed preflight, upgrade, rollback, automatic package recovery, and audit.
- `tests/smoke/theme-lifecycle.smoke.mjs`: Chromium owner controls, public HTTP, anonymous denial, authenticated preview, activation, rollback, and canonical-revision fingerprint preservation. Creates and removes a temporary session for an existing local owner. Run only against an authorized local fixture.
- Browser evidence and screenshot: `pre-01-browser-evidence.json`, `pre-01-admin.png`.

## Verification commands

Run from the repository root with the existing local PostgreSQL fixture available:

```sh
npm ci
npm run db:migrate
npm run format:check
npm run lint
npm run typecheck
npm test
node tests/smoke/theme-regressions.mjs
npm run build
npx playwright install chromium
```

Start the built standalone web app with the local environment loaded and `LOCAL_E2E_TEST_MODE=true`, then run `PRESENTATION_SMOKE_URL=http://localhost:3120 node tests/smoke/theme-lifecycle.smoke.mjs` and the read-only `presentation.smoke.mjs` against the same origin. Browser scripts use Playwright Chromium by default; set `PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome. `node tests/smoke/theme-restart.smoke.mjs` starts web/worker pairs twice on port 3121, checks readiness and persisted state, and leaves the second pair running. These local fixture scripts create temporary owner authentication and must not target a production deployment.
