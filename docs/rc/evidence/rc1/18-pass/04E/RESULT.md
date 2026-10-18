# Subpass 04E Result: Presentation Regression and Accessibility

## Identity & Manifest
- **Subpass:** 04E / 70 (`PRESENTATION REGRESSION AND ACCESSIBILITY`)
- **Base Commit:** `bb3c0347d6c648e71f0bf7eac646df70fd1b5714`
- **Dirty Overlay SHA-256:** `4792877a5bb6c004b89a9cb42c7c610b741cf94a05ffea2e4000e0e7fc345aaa`
- **Tree Manifest:** `docs/rc/evidence/rc1/18-pass/04E/tested-tree.json` (206 modified/untracked files hashed)
- **Status:** PASS

## Subpass Scope & Implemented Repairs
1. **Public vs. Builder Bundle Isolation:**
   - Evaluated public layout and page route import graphs (`src/app/(frontend)/layout.tsx`, `src/app/(frontend)/page.tsx`, `src/app/(frontend)/[...path]/page.tsx`, `src/app/(frontend)/articles/page.tsx`, `src/app/(frontend)/articles/[slug]/page.tsx`, `src/app/(frontend)/store/page.tsx`).
   - Verified that editor-only modules (`@puckeditor`, `BuilderShell.tsx`, `VisualEditor.tsx`) are completely excluded from public routes and imported only inside administrative builder routes (`src/modules/presentation/VisualEditor.tsx`, `src/app/(frontend)/admin/layout-editor/page.tsx`).
   - Recorded audit outcome in `docs/rc/evidence/rc1/18-pass/04E/bundles.json`.

2. **Starter Route & Link Reference Validation:**
   - In `src/app/(frontend)/api/layouts/[id]/route.ts`, repaired link field validation to recognize `collection === 'route'` references (`route:articles`, `route:store`, `route:donate`, `route:members`, `route:subscribe`, `route:cart`, `route:checkout`), matching them against canonical application routes.
   - Preserved strict validation for content and media links, requiring matching site ownership and canonical paths.

3. **Heading Structure & Accessibility:**
   - In `src/modules/starters/definitions.ts`, repaired page bodies for both starters (`about`, `disclosure`, `privacy`, `terms` in `publication-community`; `terms`, `subscribe`, `contact` in `campaign-commerce`) to use `##` subheadings, ensuring each page maintains a single semantic `<h1>` heading (page title).
   - In `src/modules/presentation/themes/components.tsx`, verified button focus rings (`ring-2 ring-offset-2 ring-primary`) and minimum contrast tokens.

4. **Starter Provisioning Lifecycle:**
   - In `src/modules/starters/service.ts`, ensured existing donation campaigns are activated upon starter installation so commerce donation forms accept contributions immediately.

5. **Cross-Site Theme Isolation & Contrast:**
   - Custom palettes applied to Site Alpha (`#165c4c` neutral-starter) and Site Beta (`#7f1d1d` renegade-party) verified via Theme Studio preflight (`POST /api/admin/themes`) meeting WCAG 2.1 AA minimum contrast standards (4.5:1 text/accent, 3.0:1 focus rings).
   - Verified cross-site theme isolation: palette changes on Site Alpha do not affect Site Beta or vice versa.

6. **Layout Revisioning & Rollback:**
   - Customized Site Alpha homepage layout to revision 2 (`The Vanguard Chronicle — 04E Edition`) and published.
   - Executed rollback via `POST /api/layouts/:id/rollback` to revision 1, verifying restored hero block content (`originalHeroTitle`).
   - Re-published revision 2 to maintain branding.
   - Customized and published Site Beta homepage layout to revision 2 (`Forward for the People 2026 — 04E Campaign`).

7. **Browser Journeys (Desktop & Mobile 390px):**
   - Executed full Playwright journeys across both sites:
     - **Publication Community (Site Alpha):** Desktop Home, Dispatches list (`/articles`), Single dispatch (`/articles/community-led-infrastructure`), Subscribe (`/subscribe`), Member directory (`/members`), Editorial disclosure (`/disclosure`), and mobile 390px viewports on 5 core routes with zero horizontal scroll overflow.
     - **Campaign Commerce (Site Beta):** Desktop Home, Store catalog (`/store`), Product detail (`/store/solidarity-heavyweight-tee`), Donation page (`/donate/clean-transit-fund`), Cart (`/cart`), Checkout entry (`/checkout`), and mobile 390px viewports on 5 core routes with zero horizontal scroll overflow.
   - All screenshots persisted in `docs/rc/evidence/rc1/18-pass/04E/`.

8. **Web / Worker Container Restart:**
   - Stopped and restarted PostgreSQL database container `rc104e-20261018`.
   - Verified that persisted sites, layouts, custom theme tokens, and public HTTP responses survive restart identically (`docs/rc/evidence/rc1/18-pass/04E/restart-checks.json`).

## Commands & Verification Results

| Command | Exit Code | Checks Passed | Checks Failed | Notes |
|---------|-----------|---------------|---------------|-------|
| `npx vitest run tests/unit/rc1-04a-layout-media.test.ts tests/unit/rc1-04a-visual-editor.test.ts tests/unit/rc1-04b-template-scope.test.ts tests/unit/rc1-04b-theme-boundaries.test.ts tests/unit/rc1-04c-starter.test.ts tests/unit/rc1-04d-campaign-commerce.test.ts tests/unit/rc1-04e-presentation-regression.test.ts` | 0 | 79 | 0 | All 7 presentation & starter unit suites |
| `powershell -ExecutionPolicy Bypass -File tests/rc1-04e/run-isolated.ps1 verify-bundles` | 0 | 4 | 0 | Public routes exclude editor-only code |
| `powershell -ExecutionPolicy Bypass -File tests/rc1-04e/run-isolated.ps1 verify` | 0 | 47 | 0 | Full automated browser journey across both starters |
| `powershell -ExecutionPolicy Bypass -File tests/rc1-04e/run-isolated.ps1 restart-check` | 0 | 7 | 0 | State & theme persistence across container restart |
| `npx tsc --noEmit -p tests/rc1-04e/tsconfig.json` | 0 | 0 | 0 | Zero TypeScript type errors |

## Summary of Executed Checks
- **Total Verification Checks:** 47 (browser journey) + 7 (restart) + 4 (bundle audit) + 79 (unit tests) = 137 passing assertions.
- **Failed Checks:** 0
- **Skipped Checks:** 0
- **Unexecuted Checks:** 0

## Persisted Artifacts
- `docs/rc/evidence/rc1/18-pass/04E/bundles.json`: Bundle audit results
- `docs/rc/evidence/rc1/18-pass/04E/journey-checks.json`: 47 passing journey assertions
- `docs/rc/evidence/rc1/18-pass/04E/restart-checks.json`: 7 passing restart assertions
- `docs/rc/evidence/rc1/18-pass/04E/state.json`: Persisted database records before/after restart
- `docs/rc/evidence/rc1/18-pass/04E/tested-tree.json`: Dirty overlay tree SHA manifest
- Screenshots:
  - `pub-desktop-home.png`
  - `pub-desktop-articles.png`
  - `pub-desktop-article.png`
  - `pub-desktop-subscribe.png`
  - `pub-desktop-members.png`
  - `pub-mobile-home.png`
  - `camp-desktop-home.png`
  - `camp-desktop-store.png`
  - `camp-desktop-product.png`
  - `camp-desktop-donate.png`
  - `camp-desktop-cart.png`
  - `camp-mobile-home.png`
