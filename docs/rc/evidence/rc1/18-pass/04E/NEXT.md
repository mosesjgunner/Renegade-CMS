# Subpass 04E Handoff: Presentation Regression and Accessibility

## Subpass Status
- **Completed Subpass:** 04E / 70 (`PRESENTATION REGRESSION AND ACCESSIBILITY`)
- **Status:** PASS
- **Base Commit:** `bb3c0347d6c648e71f0bf7eac646df70fd1b5714`
- **Dirty Overlay SHA-256:** `4792877a5bb6c004b89a9cb42c7c610b741cf94a05ffea2e4000e0e7fc345aaa`
- **Tested Tree Manifest:** `docs/rc/evidence/rc1/18-pass/04E/tested-tree.json`

## Retained Evidence & Verified Contracts
1. **Public vs. Builder Bundle Boundary:**
   - Public route component trees exclude `@puckeditor`, `BuilderShell.tsx`, and `VisualEditor.tsx`.
   - Verified via `docs/rc/evidence/rc1/18-pass/04E/bundles.json`.
2. **Starter Link & Route Validation:**
   - Repaired `api/layouts/[id]/route.ts` to recognize `collection === 'route'` references (`route:articles`, `route:store`, `route:donate`, etc.) without failing content collection lookups.
3. **Heading Hierarchy & Accessibility:**
   - Repaired markdown bodies in `src/modules/starters/definitions.ts` to use `##` subheadings, ensuring strict single `<h1>` heading hierarchy across all public pages.
   - Button focus rings and color contrast comply with WCAG 2.1 AA (4.5:1 text/accent, 3.0:1 focus rings).
4. **Starter Provisioning & Revisions:**
   - Both starters (`publication-community` and `campaign-commerce`) provision clean content, layouts, templates, and patterns.
   - Layout customization, publication, rollback to revision 1 (with verified content restoration), and re-publication pass.
5. **Browser Journeys:**
   - 47 automated browser journey assertions across desktop and 390px mobile viewports verified with zero horizontal scroll overflow.
   - Screenshots persisted in `docs/rc/evidence/rc1/18-pass/04E/`.
6. **Container Restart Persistence:**
   - 7 assertions verified against PostgreSQL 17.6 container restart in `docs/rc/evidence/rc1/18-pass/04E/restart-checks.json`.
7. **Disposable Resource Cleanup:**
   - Disposable database container `rc104e-20261018`, dev server (`38940`), and TLS reverse proxy (`38941`) have been stopped and removed.

## Handoff to Next Subpass
- **Next Subpass:** Phase 05 / Subpass 05A per `docs/rc/RC1-SCOPE.md` and `docs/rc/RC1-ACCEPTANCE-MATRIX.md`.
- **Preexisting Issues to Note:** Concurrent `tests/rc1-03d/verify-import-and-build.ts` contains draft type mismatches from subpass 03D work. All presentation modules and scoped 04E files pass TypeScript check cleanly (`tests/rc1-04e/tsconfig.json`).
- **Execution Rule:** Subpass 04E is complete. Stop execution here. Do NOT start Subpass 05 automatically.
