# RC1 subpass 02A result — PASS

Date: 2026-10-17 (America/Chicago). RC1 release status remains **NOT READY**. No next subpass was executed.

## Source and isolation

- Base HEAD: `bb3c0347d6c648e71f0bf7eac646df70fd1b5714`. Preserved preexisting user edits, databases, media, secrets, and historical evidence (`myhigherpower`, `renegadeparty`, `rc101a20261017`, `rc101b20261017`, `rc101clean`, `rc101cstd`).
- Runtime source overlay SHA-256:
  - `src/app/(frontend)/api/admin/active-site/route.ts`: `8e6eec54b2ce3ca5b71667d80acdfdf8a8e2841deaac1d84b21f2e4c02cedd2a`
  - `src/modules/admin/SiteSwitcher.tsx`: `b124f8a521fbc1de9b8662070c94604d64e1b4bdfa3a37122004a56c07170a22`
  - `src/modules/admin/PublishingLinks.tsx`: (integrated `<SiteSwitcher />` at top of administrative nav)
  - `src/modules/admin/NavigationCenter.tsx`: (added site selector dropdown `#nav-site-select`, active site sync, and Reset button `#nav-reset-btn`)
  - `src/app/(frontend)/api/admin/navigation/route.ts`: (cookie fallback for active site navigation)
  - `src/app/(frontend)/api/admin/themes/route.ts`: (cookie fallback for active site theme inspect)
  - `src/modules/admin/ThemeCenter.tsx`: (active-site update on theme site selection)
  - `src/globals/SiteSettings.ts`: `e89bdac286becc371d8efb5fafa1dff861e6c2d9a4dcfe8e787ec490f24cd61c`
  - `src/collections/Sites.ts`: `4ae701dc01c04537da30a369ec95155019566eadef8fb30b02a283923e9ea4df`
  - `src/modules/public/site-scope.ts`: `8bb4b2a7de8a55a248620672581c297eb355352a41883ff9c0fd57f241ab0849`
  - `src/modules/operations/operator-grants.ts`: `450edf9055375a5d51218dff76d2689581b64268d1198f2a40931197d9a44771`
  - `src/modules/presentation/request-theme.ts`: (supported explicit siteId and host-based site resolution)
  - `src/app/(frontend)/layout.tsx`: (bound public layout and theme/branding to host-scoped site)
  - `src/app/(frontend)/page.tsx`: (bound public homepage to host-scoped site)
  - `src/collections/Audience.ts`: (safeguarded email delivery access hooks when optional collections are gated)
- Subpass 02A test files SHA-256:
  - `tests/unit/site-settings-multisite.test.ts`: `76f8bef33fb41cb4c4a4f6a6e58b6ee90218040c05732f6344ff0dc1507840b9`
  - `tests/unit/active-site-route.test.ts`: `7be57312c52e7a333c5462ebbb362d784efcdb4cd158634b80772d79aeef4d36`
  - `tests/rc1-02a/verify-02a.ts`: `8059f34bc937920bc21d95dfcdfebf865f12b829a9796f0b9f3d6fd364fb647c`
- Disposable isolated test environment:
  - Container `rc101-02a-postgres` on loopback port `5433`, PostgreSQL 17.6-alpine, cleanly migrated with 116 migrations, executed full acceptance journey, and cleanly decommissioned (`docker rm -f`).
  - Preexisting user environments `renegadeparty` (3181), `myhigherpower` (3182), `rc101b20261017` (38742), `rc101clean` (38751), and `rc101cstd` (38752) remained completely untouched.

## Implementation and journey

1. **Canonical Site and Site Settings Repair**:
   - `src/collections/Sites.ts`: added `name` requirement and normalized `slug` generation in `beforeValidate`. In `afterChange`, automatically bootstraps default active publication for newly created sites and revalidates discovery outputs. In `afterDelete`, revalidates discovery outputs.
   - `src/globals/SiteSettings.ts`: added strict HTTP/HTTPS URL protocol validation for `canonicalOrigin` and `canonicalOriginsBySite`. Added cross-site host collision prevention in `canonicalOriginsBySite` (detects if two distinct sites attempt to claim the same hostname/domain).
   - `src/modules/public/site-scope.ts`: enhanced `publicSiteForHost` with port-agnostic domain matching (`host:port` vs `host`), canonicalOrigin fallback matching, and preserved multi-site tenant isolation (unknown/unrecognized host returns `''` to prevent leaking other tenants' data).
   - `src/app/(frontend)/layout.tsx` & `page.tsx`: public request rendering scopes publication, theme, navigation, and branding strictly to the host-resolved site.

2. **Active Site Consistency and Operator Controls**:
   - `src/app/(frontend)/api/admin/active-site/route.ts`:
     - `GET`: validates operator credentials via `resolveOperatorGrantContext`. Returns `{ activeSiteId, sites }` filtered to operator-authorized sites. Honors `renegade-active-site` cookie if present and authorized; falls back to primary authorized site.
     - `POST`: validates operator authorization against requested `siteId` via `checkOperatorSiteAccess`. Rejects unauthorized or nonexistent site with 403/404. Sets 30-day `renegade-active-site` cookie (`Path=/; SameSite=Lax; Max-Age=2592000`).
   - `src/modules/admin/SiteSwitcher.tsx`: accessible client UI component in admin sidebar showing current active site and dropdown selector to switch active context with immediate cookie sync.
   - `src/modules/admin/NavigationCenter.tsx`: added `#nav-site-select` dropdown for switching active navigation context, sync with `/api/admin/active-site`, and `#nav-reset-btn` for discarding unsaved changes back to last saved state.

3. **Negative Constraints & Invariants Exercised**:
   - Empty site name rejected with `Site name is required.`.
   - Invalid URL protocol on `canonicalOrigin` rejected with `Canonical origin must use HTTP or HTTPS protocol.`.
   - Host conflict in `canonicalOriginsBySite` rejected with `Canonical origin host "<host>" conflicts between site "<siteA>" and site "<siteB>".`.
   - Unauthenticated call to `/api/admin/active-site` rejected with 401.
   - Restricted staff (granted only Site 1) attempting to switch to Site 2 rejected with 403.
   - Unrecognized host header (`attacker-unrecognized.com`) resolves to `''`, preventing cross-tenant data leaks.

4. **Multi-Site Public Consumption & Persistence Across Restart**:
   - Bootstrapped Site 1 (`Alpha Main Site`) and Site 2 (`Beta Community Site`, slug normalized).
   - Automatically bootstrapped distinct publications for each site.
   - Configured distinct navigation menus (Site 1: `Alpha Home`, `Alpha News`; Site 2: `Beta Home`, `Beta Discussions`).
   - Host `alpha.localhost:3000` accurately resolved Site 1.
   - Host `beta.localhost:3000` accurately resolved Site 2.
   - Owner switched active site to Site 2 -> received `renegade-active-site` cookie.
   - Subsequent GET with cookie returned activeSiteId = Site 2.
   - Clean server restart simulated: reloaded Payload instance from scratch against the PostgreSQL database; verified sites count (2), canonicalOrigin, canonicalOriginsBySite, and active site cookie persistence intact.

## Commands, exits and observed state

| Command/path | Exit/count | Observation |
| --- | --- | --- |
| `npm.cmd run typecheck` | 0 | TypeScript typecheck clean across entire codebase. |
| `npm.cmd run lint` | 0 | ESLint clean across entire codebase with 0 warnings. |
| `npx.cmd vitest run tests/unit/site-settings-multisite.test.ts tests/unit/active-site-route.test.ts` | 0; 2 files / 10 passed / 0 failed / 0 skipped | Unit tests for site-settings validation, slug normalization, domain conflict prevention, and active-site route access control passed. |
| `npm.cmd run test` (vitest unit suite) | 0; 199 files / 1324 passed / 0 failed / 0 skipped | Whole existing repository unit test suite executed cleanly without regressions. |
| `npx.cmd cross-env ... tsx tests/rc1-02a/verify-02a.ts` | 0; 10/10 acceptance steps passed | Full ordinary operator journey, two-site creation/edit/reload/refetch/restart, rendered public effect, negative input validation, role denial, and persistent cookie verified against isolated PostgreSQL 17.6 container. |
| `SELECT count(*) FROM sites;` | 0; 2 rows | Persisted sites: `Alpha Main Site` and `Beta Community Site`. |
| `SELECT count(*) FROM publications;` | 0; 2 rows | Exactly 1 distinct publication per site auto-bootstrapped. |
| `SELECT count(*) FROM admin_sessions;` | 0; 2 rows | Authentic passkey sessions issued and validated for owner and staff. |
| `SELECT site_id, role FROM member_site_roles;` | 0; 3 rows | Scoped grants: owner on site 1 & 2, staff strictly on site 1. |
