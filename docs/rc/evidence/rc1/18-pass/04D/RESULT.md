# RC1 04D — Campaign/Commerce Starter Experience

Status: **04D PASS** (2026-10-18, America/Chicago). This is a bounded subpass receipt, not aggregate RC1 readiness.

## Exact Source and Isolation

- Base commit: `bb3c0347d6c648e71f0bf7eac646df70fd1b5714`
- Dirty-tree manifest: [tested-tree.json](tested-tree.json) (199 files, sha256 `24ee591586840a133e1bde259601aa7d3f0965235f2431365fec12c5872374ba`)
- No commits, tags, branches, releases, pushes, or deployments were performed. Preexisting edits and historical evidence were strictly preserved.

### Runtime Isolation
- **Database**: Dedicated Docker container `rc104d-20261018`, image `postgres:17.6`, loopback port `127.0.0.1:5441`, database `rc104d_release_acceptance`. Inspected migration runner executed 120 fresh migrations against this disposable database without touching existing databases.
- **Media**: Isolated scratch directory `scratch/rc104d-20261018/media`.
- **TLS Proxy**: Local loopback proxy on `127.0.0.1:38931` forwarding to Next.js dev server on `127.0.0.1:38930`, trusted locally via `NODE_EXTRA_CA_CERTS`. Node certificate validation remains fully enabled.
- **Build / Dev Cache**: Isolated dist directory `.next-rc104d`.
- **Environment Flags**: `LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`, `EMAIL_MODE=development`, `SEED_ON_INIT=false`. No external API calls, real credit cards, or test credentials used to fake passkey/browser or provider acceptance.

## Actual Implementation

1. **Cart & Checkout Entry Routes**:
   - `src/app/(frontend)/checkout/page.tsx`: Implemented standard accessible Checkout entry route wrapping canonical `<CartView />` with clear status headings and unconfigured payment warnings.
2. **Product Detail Route**:
   - `src/app/(frontend)/store/[slug]/page.tsx`: Implemented product detail route rendering `ProductDetail` component for individual products (e.g. `/store/solidarity-heavyweight-tee`), with slug matching, pricing, tier descriptions, and safe-unconfigured cart actions.
3. **Canonical Widgets in Presentation & Starters**:
   - `src/modules/presentation/themes/components.tsx`: Implemented canonical widgets `publisher.donation` and `publisher.product-showcase` using Next.js `<Link>` navigation, WCAG AA compliant color contrasts, and explicit `data-provider-state="safe-unconfigured"` badge.
   - `src/modules/starters/definitions.ts`: Updated `camp-merch-spotlight` block on campaign starter homepage and `tpl-prod-grid` block on `Product Spotlight Template` to use canonical `publisher.product-showcase` widget.
4. **Focused Unit & Integration Suites**:
   - `tests/unit/rc1-04d-campaign-commerce.test.ts`: 21 focused unit tests verifying starter definitions, canonical layout structure, widget rendering, unconfigured provider states, and error handling.
   - `tests/rc1-04d/`: Complete isolated verification harness (`run-isolated.ps1`, `verify.ts`, `tls-proxy.mjs`, `manifest.mjs`, `tsconfig.json`).

## Executed Path and Persisted Assertions

The verification journey executed the complete operator and anonymous public experience on a disposable site (`site-rc104d-campaign`):
1. **Transactional Rollback on Failure**: An intentionally corrupted install payload triggers atomic rollback leaving 0 orphaned content, media, products, campaigns, or layouts.
2. **Starter Installation**: Operator installs `campaign-commerce` starter. Generates exactly:
   - 1 canonical publication (`Solidarity Forward Campaign`)
   - 4 canonical products (`Solidarity Heavyweight Union-Printed Tee`, `Organizing Tote`, `Campaign Enamel Pin Set`, `Action Poster Pack`)
   - 1 canonical donation campaign (`Clean Transit Now Fund`)
   - 1 homepage layout (`/`)
   - 2 page templates (`__template__/product-spotlight`, `__template__/campaign-action`)
   - 3 reusable patterns (`__pattern__/grassroots-donate`, `__pattern__/action-alert`, `__pattern__/campaign-disclosure`)
   - 4 globals (`announcement`, `header`, `cta`, `footer`)
3. **Admin Customization & Publication**:
   - Operator customizes publication name to `Clean Transit Action Coalition` and updates primary navigation.
   - Operator customizes site settings identity to `Clean Transit Action Coalition`.
   - Operator activates `renegade-party` theme with WCAG AA compliant custom accent token (`#7f1d1d`).
   - Operator customizes and publishes homepage layout with updated heading `Transit Justice is Climate Justice`.
4. **Public Anonymous Routing**:
   - `/` renders customized homepage with active theme, donation widget, and product showcase widget.
   - `/articles` renders campaign articles archive.
   - `/store` renders product catalog with all 4 campaign products.
   - `/store/solidarity-heavyweight-tee` renders detailed product showcase.
   - `/cart` renders cart view.
   - `/checkout` renders checkout proposal view.
   - `/donate` renders donation index.
   - `/donate/clean-transit-fund` renders donation tier form with legal FEC compliance text.
   - `/disclosure` renders campaign disclosure statements.
   - `/contact` renders contact details.
5. **Disabled / Unconfigured Provider Negative Safety**:
   - Checkout proposal returns HTTP 503 or 400 safely when payment provider is unconfigured.
   - Donation payment submission returns HTTP 503 with truthful error message: `"No active payment provider is configured for donations."`
   - Verified 0 completed orders exist in database; no payments or charges manufactured.
6. **Multi-tenant / Role Boundaries**:
   - Foreign site install denied with HTTP 403.
   - Cross-origin starter action denied with HTTP 403.
   - Anonymous starter action denied with HTTP 403.
   - Staff role starter install denied with HTTP 403.
7. **Browser / Mobile Rendering & Accessibility**:
   - Desktop viewport (1280x800): renders heading, navigation, widgets without horizontal overflow.
   - Mobile viewport (390x844): verified zero horizontal overflow on `/`, `/store`, `/donate/clean-transit-fund`, `/cart`, and `/checkout`.
8. **Container Restart Persistence**:
   - PostgreSQL container `rc104d-20261018` restarted.
   - Verified exact persisted IDs and records survive: publication, products, donation campaign, page layout, custom theme tokens, and all public routes.

## Commands and Counts

| Command | Exit | Result |
| :--- | :--- | :--- |
| `powershell -File tests/rc1-04d/run-isolated.ps1 start-db` | 0 | Dedicated PostgreSQL container started on 127.0.0.1:5441 |
| `powershell -File tests/rc1-04d/run-isolated.ps1 migrate` | 0 | 120 fresh migrations executed and verified |
| `npx vitest run tests/unit/rc1-04d-campaign-commerce.test.ts` | 0 | 21 passed / 0 failed / 0 skipped |
| `npx tsc --noEmit -p tests/rc1-04d/tsconfig.json` | 0 | Scoped TypeScript typecheck: 0 errors |
| `npx eslint ... (scoped modified files)` | 0 | Scoped ESLint: 0 errors / 0 warnings |
| `powershell -File tests/rc1-04d/run-isolated.ps1 verify` | 0 | 56 passed / 0 failed / 0 skipped |
| `powershell -File tests/rc1-04d/run-isolated.ps1 restart-check` | 0 | 15 passed / 0 failed / 0 skipped |

Total accepted scoped assertions: **92 passed / 0 failed / 0 skipped** (21 unit + 56 journey + 15 restart).
Scoped unexecuted checks: **0**.

## Evidence Artifacts

All artifacts stored under `docs/rc/evidence/rc1/18-pass/04D/`:
- `desktop-home.png`: Screenshot of customized campaign homepage on desktop
- `store.png`: Screenshot of campaign merch store catalog
- `donate.png`: Screenshot of donation tier form with legal compliance disclosure
- `mobile-home.png`: Screenshot of mobile responsive homepage (390px)
- `journey.log`: Output of full 56-check operator and public acceptance journey
- `restart.log`: Output of 15-check post-restart persistence verification
- `journey-checks.json`: JSON array of all 56 verified journey checks
- `restart-checks.json`: JSON array of all 15 verified post-restart checks
- `state.json`: Complete snapshot of persisted publication, product, donation, and layout IDs
- `unit.log`: Focused unit test output
- `types.log`: Scoped TypeScript check output
- `migrations.log`: Migration execution log
- `tested-tree.json`: Dirty-tree source manifest

## Remaining Boundaries and Handoff

No open blockers within Subpass 04D scope.
The wider repository retains 7 type diagnostics in `tests/rc1-03d/verify-import-and-build.ts` from prior subpass 03D work.
Subpass 04D is fully proved and passes.
Execution terminates here. Do not start the next subpass.
