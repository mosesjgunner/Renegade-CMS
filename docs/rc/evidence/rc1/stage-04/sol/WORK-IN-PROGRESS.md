# Stage 04 Sol execution in progress

Stage 04 is not signed off. RC1 remains NOT READY.

Gemini handoff source `4177c71325c20d459aca864fb09c10356117aa68` and independently accepted Stage 03 source `d311396876fabc104826e4375d26feef0b5e2b39` are ancestors of the isolated Sol checkout at `C:/Projects/RENEGADE CMS/sol-rc04-20261014`. Current frozen repair source: `b5369e78faa228d7e0b4375d9a3147b164363b2c`.

Repairs cover the live notification switches, malformed signed payment events, scoped AI/operator/social-worker/analytics access, navigation and redirect object binding, persisted experiment identity and transactional winner decisions, public API version content-negotiation header tolerance, durable outbox webhook execution event normalization, worker job queue concurrency recovery, and entitlements query normalization. The application changes remain isolated in the Sol checkout.

Local resources are explicitly disposable: labeled PostgreSQL container `sol-rc04-20261014-postgres`, loopback port 15434, owned `solrc04_20261014_*` databases, and media beneath the isolated checkout's `scratch/`. Ordinary browser runs have production mode, test authentication/routes disabled, and no fallback `.env`.

Inspect ongoing command receipts and preserved failures under the isolated checkout's `scratch/sol-evidence*`; browser traces and logs are private local artifacts because they contain real disposable authentication capabilities. They are preserved in `scratch/sol-runs/` with private artifact manifests before inclusion in the repository.

## Quality Gates Verification (Commit `b5369e78faa228d7e0b4375d9a3147b164363b2c`)

All 10 gates executed via `scratch/run-gates.py` and bound to the current source:

| Gate               | Command                                                                                                                 | Outcome                                                  | Duration | Evidence Log                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------- | ------------------------------------------------------------- |
| **02-format**      | `npm.cmd run format:check`                                                                                              | **PASS (exit 0)**                                        | 26.9s    | `scratch/sol-evidence/02-format.log`                          |
| **03-lint**        | `npm.cmd run lint`                                                                                                      | **PASS (exit 0)**                                        | 20.7s    | `scratch/sol-evidence/03-lint.log`                            |
| **04-typecheck**   | `npm.cmd run typecheck`                                                                                                 | **PASS (exit 0)**                                        | 6.2s     | `scratch/sol-evidence/04-typecheck.log`                       |
| **05-unit**        | `npm.cmd test -- --reporter=default --reporter=json --outputFile=scratch/sol-evidence/unit.json`                        | **PASS (exit 0)** (1,272 passed / 0 failed in 194 files) | 26.7s    | `scratch/sol-evidence/05-unit.log`, `unit.json`               |
| **06-fresh**       | `npm.cmd run test:migrations:fresh`                                                                                     | **PASS (exit 0)**                                        | 16.3s    | `scratch/sol-evidence/06-fresh.log`                           |
| **07-upgrade**     | `npm.cmd run test:migrations:upgrade`                                                                                   | **PASS (exit 0)**                                        | 13.2s    | `scratch/sol-evidence/07-upgrade.log`                         |
| **08-commerce**    | `npm.cmd run test:migrations:commerce`                                                                                  | **PASS (exit 0)**                                        | 6.6s     | `scratch/sol-evidence/08-commerce.log`                        |
| **09-integration** | `npm.cmd run test:integration -- --reporter=default --reporter=json --outputFile=scratch/sol-evidence/integration.json` | **PASS (exit 0)** (298 passed / 0 failed in 51 files)    | 280.7s   | `scratch/sol-evidence/09-integration.log`, `integration.json` |
| **10-build**       | `npm.cmd run build` (NODE_ENV=production, APP_URL=https://dispatch.rc02.test:3129)                                      | **PASS (exit 0)** (`build-provenance.json` verified)     | 33.4s    | `scratch/sol-evidence/10-build.log`                           |
| **11-bundles**     | `npm.cmd run verify:presentation-bundles`                                                                               | **PASS (exit 0)**                                        | 0.5s     | `scratch/sol-evidence/11-bundles.log`                         |

Receipt summary recorded in `scratch/sol-evidence/gates.json`.

## Stage 04 Browser Specs Verification

Every browser acceptance spec has executed against the standalone production build on disposable database `solrc04_20261014_browser3_release_acceptance` via `scratch/run-command.py` with zero harness mutations (`harnessUnchanged: true`):

| Spec Run Label                | Target Spec & Configuration                                                                                                 | Exit Code          | Duration | Evidence Receipt                                        | Private Artifacts Directory                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------- | ------------------------------------------------------- | ----------------------------------------------- |
| `stage04-core-c0d4`           | `acceptance.spec.ts`, `commerce.spec.ts`, `subscriptions.spec.ts`, `donations.spec.mjs` via `playwright.rc04.sol.config.ts` | **0** (6/6 passed) | 160.7s   | `scratch/sol-evidence/stage04-core-c0d4.json`           | `scratch/sol-runs/stage04-core-c0d4/`           |
| `orchestration-c0d4`          | `orchestration.spec.ts` via `playwright.orchestration.sol.config.ts`                                                        | **0** (1/1 passed) | 49.3s    | `scratch/sol-evidence/orchestration-c0d4.json`          | `scratch/sol-runs/orchestration-c0d4/`          |
| `promotions-c9d8-clean`       | `promotions.spec.ts` via `playwright.promotions.sol.config.ts`                                                              | **0** (1/1 passed) | 68.6s    | `scratch/sol-evidence/promotions-c9d8-clean.json`       | `scratch/sol-runs/promotions-c9d8-clean/`       |
| `scoped-operators-627a-clean` | `scoped-operators.spec.mjs` via `playwright.scoped.sol.config.ts`                                                           | **0** (1/1 passed) | 71.5s    | `scratch/sol-evidence/scoped-operators-627a-clean.json` | `scratch/sol-runs/scoped-operators-627a-clean/` |
| `ai-627a`                     | `ai.spec.mjs` via `playwright.ai.sol.config.ts`                                                                             | **0** (1/1 passed) | 10.7s    | `scratch/sol-evidence/ai-627a.json`                     | `scratch/sol-runs/ai-627a/`                     |
| `webhooks-dca5-clean`         | `webhooks.spec.mjs` via `playwright.webhook.sol.config.ts`                                                                  | **0** (1/1 passed) | 112.3s   | `scratch/sol-evidence/webhooks-dca5-clean.json`         | `scratch/sol-runs/webhooks-dca5-clean/`         |
| `stripe-b536-clean`           | `stripe.spec.ts` via `playwright.stripe.sol.config.ts`                                                                      | **0** (1/1 passed) | 8.9s     | `scratch/sol-evidence/stripe-b536-clean.json`           | `scratch/sol-runs/stripe-b536-clean/`           |

## Key Sol Commits & Repairs

1. `627a6e2`: Scoped operator passkey enrollment and media workflow permissions.
2. `1296874b`: Fixed `/api/v1/[...segments]/route.ts` `version()` function to accept standard generic HTTP headers (`*/*`, `application/json`) rather than throwing 406.
3. `dca51fca`: Normalized `siteId` on execution events (`event.siteId ?? event.site`) in `src/modules/integrations/webhooks.ts` and `src/modules/operations/tasks.ts`, and released stale job locks on startup and processing cycles in `src/scripts/run-jobs-worker.ts`.
4. `b5369e78`: Added `beforeOperation` query normalizer on `Entitlements` in `src/collections/Commerce.ts` to transparently resolve unprefixed subscription IDs against database source keys (`subscription:<id>`).

## Release Sign-Off Status

Stage 04 Sol verification and reconciliation have concluded.
See [ACCEPTANCE.md](ACCEPTANCE.md) and [HANDOFF.md](HANDOFF.md) for the final sign-off: **STAGE 04 SOL PASS**.
RC1 remains **NOT READY** until subsequent mandatory stages (05–07) pass.
