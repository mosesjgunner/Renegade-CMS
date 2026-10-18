# RC1 04C ? publication/community starter

Status: **04C PASS**, 2026-10-18 (America/Chicago). Aggregate RC1 remains NOT READY.

## Source and containment

Base commit `bb3c0347d6c648e71f0bf7eac646df70fd1b5714`; no commit, push, tag, publication or deployment was performed.

- The current-source 54 units and 82 operator/API/Chromium assertions use the 206-path dirty overlay `4b70cfc9074c9b0c33c48f113c4f3651db177c7474238c11d8a6f79eae282443` in [tested-tree.json](tested-tree.json).
- The 12 web/PostgreSQL restart assertions use [restart-tested-tree.json](restart-tested-tree.json). Its only change is an explicit successful CLI exit **after** assertions and cleanup. [source-check.json](source-check.json) reconstructs the earlier verifier bytes and proves their exact SHA-256 match; no assertion body was changed.
- Final 207-path overlay `8458fface3956c65675b5344cc7b8e7b32f3d98d0fcb9feb4ed66479fd0b2f5b` is in [observed-tree.json](observed-tree.json). The final application change is only the article comments wrapper, changed from a second `main` to a named `section`. Eight focused desktop/mobile assertions and regenerated article screenshots prove that repair. Final scoped types/lint cover it. Source comparison has **zero unexpected changes**.
- Earlier valid 82 + 12 receipts remain under `original-*`, bound to their original 199-path overlay `8d2da1f435f67350fa1e3fa0a77c6f6b7290237211359c72fc23fbab72ada094`. They are historical and are not added to current counts. Concurrent 04D/04E work changed shared starter/component/layout code; the current 82-case run reaccepted 04C against that code. This agent did not execute 04D or 04E. Their files, ledger entries and evidence are preserved.

## Isolation and authentication

Only disposable container `rc104c-20261018` / PostgreSQL 17.6 was used: image `sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`, container ID `70a2744d6c1314892698b904cf6b048fa1043163b68111fb6a259c2f5b5cccb9`, loopback port 5440, database `rc104c_release_acceptance`. The inspected migration runner drops only this dedicated schema. Each journey creates a new empty site; diagnostic and accepted fixtures remain isolated and preserved.

Next development runtime: loopback HTTP 38920, local TLS proxy 38921, `.next-rc104c`; media/TLS under `scratch/rc104c-20261018/`, accepted originals under `media-accepted/`. `STORAGE_DRIVER=local`, `EMAIL_MODE=development`, `LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`, fixture seeding off. No application production image was built or tested.

Canonical signed operator sessions with persisted `admin_sessions` entries provide the supported HTTP operator path. Public Chromium visitors use no authentication bypass. Operator sessions are removed after execution. **No passkey ceremony, ordinary administrator login, deployed image, remote SMTP or real inbox delivery is claimed.** Newsletter delivery runs the real `payload.jobs.run` operations-queue handlers against the local capture adapter, followed by an actual browser confirmation link. No external messages, charges, donations, orders or posts were sent.

## Implementation

- `src/modules/starters/service.ts`: transactional installation and queued side effects, per-site serialization, cleanup of newly copied originals after abort, empty-site protection, canonical publication reuse, identity preservation, site-specific sample identities, full Markdown-derived Lexical page bodies, canonical media/link references, correct homepage relationship, footer navigation and site-derived install status. Shared globals are changed only for a single-site installation. Template upgrades resolve canonical references.
- `src/modules/starters/{contracts,definitions}.ts`: publication starter with home, three sample articles, archive/search destinations, signup, member directory, about/disclosure/contact/privacy/terms; real newsletter/community destinations, reserved example identities, local governed SVGs and truthful sample/contact/membership copy. The current shared source includes separately owned later starter improvements; those were preserved and reaccepted only within 04C.
- `src/app/(frontend)/api/admin/starters/route.ts`: owner policy, canonical site grants, filtered discovery, same-origin mutation, bounded JSON and valid starter IDs. Privileged installer/upgrade/rollback/preview services are never called for foreign sites or denied roles.
- `src/modules/core/transaction-payload.ts` and `src/collections/Publishing.ts`: bind global operations and indexing outbox writes to the installation transaction, preventing a self-wait and orphaned indexing events.
- `src/modules/admin/ThemeCenter.tsx`: visible links to identity, navigation, homepage/global composition and palette customization, with the empty-site install boundary explained.
- Public `page.tsx`: a selected homepage layout must belong to the resolved site. `search/page.tsx`: wrapping filters and bounded input widths fix mobile overflow. `subscribe/page.tsx` and `subscribe/confirm/page.tsx`: hydration-ready submission, preserved values after errors, busy/error feedback and retry. `src/modules/community/MemberDirectory.tsx`: hydration-ready controls, loading/error feedback and retry. `PublicNavigation.tsx`: native keyboard-operated mobile disclosure. `StarterShell.tsx`: skip link and focus target. `starter.css`: responsive article cards. `public-queries.ts`: article queries exclude unrelated legal/pages. Catch-all `page.tsx`: one main landmark with a named discussion section.
- Added `tests/unit/rc1-04c-starter.test.ts` and guarded runners/verifiers under `tests/rc1-04c/`; aligned the publication assertions in the existing starter integration suite with real stored originals/licensing. Existing migrations/fields are sufficient; no schema migration was introduced. Generated Next type references coexist with preexisting edits.

## Observed ordinary journey

On an empty site the owner discovers/selects the publication starter and installs through HTTP. The operator changes the publication name to `04C Civic Journal`, logo/description/footer, navigation and palette; publishes edited homepage blocks; creates a draft article, observes its public 404, then publishes it and reads its real persisted body anonymously.

The browser follows the homepage newsletter destination, fills email and consent, observes a pending disabled submit button, receives an injected transport error, retries with retained values, and creates a real pending subscriber. A repeated supported request creates no duplicate delivery. The actual operations worker captures the rendered confirmation; Chromium follows that link and confirms. Both subscriber and audience membership become active through the canonical confirmation service.

Home, article, archive, search, subscribe, members, contact, privacy, terms, about and disclosure return public output. At 1440px and 390px, required routes have visible content and no horizontal overflow; images load with alt text. The skip link moves keyboard focus into content and Enter opens the mobile menu. Actual public search/member-directory empty states are inspected. Final article checks prove one main landmark, the persisted body and resolved anonymous sign-in loading in both viewports. Screenshots: `desktop-home.png`, `mobile-home.png`, `desktop-article.png`, `mobile-article.png`.

Upgrade preserves the customized homepage; supported starter rollback restores revision 1; republishing restores customization without losing the canonical article. Invalid/reused installation, injected mid-install failure, foreign site read/install/upgrade/rollback/preview, staff/anonymous/cross-origin mutation, draft public access, invalid confirmation and foreign-site signup are denied. Failed installation leaves zero scoped content/media/layout/outbox rows and removes copied originals. No business status row is directly flipped to manufacture a workflow.

The web process and PostgreSQL are restarted. Exact publication/navigation, article, homepage blocks/history, subscriber, audience membership, complete Site Settings and palette match the saved values. Original image SHA-256 matches the repository asset before and after restart; home/article/privacy/contact still render. IDs and complete persistence snapshots are in [state.json](state.json).

## Commands, exits and counts

All commands run at the repository root. The checked-in PowerShell runner fixes disposable targets and disables test authentication.

| Command | Exit | Result |
| --- | ---: | --- |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-04c/run-isolated.ps1 start-db` | 0 | Dedicated container created; ready |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-04c/run-isolated.ps1 migrate` | 0 | 120 fresh migrations; second migration pass/schema assertions pass |
| `npx.cmd vitest run tests/unit/rc1-04c-starter.test.ts tests/unit/starter-definitions.test.ts tests/unit/rc1-04a-layout-media.test.ts tests/unit/rc1-04b-theme-boundaries.test.ts` | 0 | 4 suites, 54 passed / 0 failed / 0 skipped |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-04c/run-isolated.ps1 verify` | 0 | 82 passed / 0 failed / 0 skipped; current source reacceptance |
| Stop own port-38920 Next process, start `...run-isolated.ps1 serve`, then `powershell -NoProfile -ExecutionPolicy Bypass -File tests/rc1-04c/run-isolated.ps1 restart-check` | 0 | Web and DB restart; 12 passed / 0 failed / 0 skipped |
| `node tests/rc1-04c/verify-article.mjs` | 0 | Final landmark repair: 8 passed / 0 failed / 0 skipped |
| `npx.cmd tsc --noEmit -p tests/rc1-04c/tsconfig.json` | 0 | All-src plus scoped verifier/unit types; zero diagnostics |
| Focused ESLint command below; final catch-all/article verifier lint below | 0 | Zero errors/warnings |
| Focused Prettier check, plus Prettier write/check of final touched JSX/verifiers | 0 | Formatting clean |
| `npm.cmd run typecheck` | 1 | 7 preexisting diagnostics in `tests/rc1-03d/verify-import-and-build.ts`, first at line 31; preserved |

Current scoped assertions: **156 passed, 0 failed, 0 skipped; 0 mandatory scoped workflow groups unexecuted**. Earlier diagnostic failures and harness corrections are summarized in [repair-attempts.log](repair-attempts.log), not silently counted as passes. The broad typecheck failure is a separate failed quality command, not a scoped assertion pass.

Exact focused lint invocation:

```powershell
npx.cmd eslint src/modules/starters src/modules/core/transaction-payload.ts src/modules/presentation/public-queries.ts src/collections/Publishing.ts src/modules/admin/ThemeCenter.tsx src/modules/presentation/themes/StarterShell.tsx src/modules/public/PublicNavigation.tsx src/modules/community/MemberDirectory.tsx 'src/app/(frontend)/api/admin/starters/route.ts' 'src/app/(frontend)/subscribe/page.tsx' 'src/app/(frontend)/subscribe/confirm/page.tsx' 'src/app/(frontend)/page.tsx' 'src/app/(frontend)/search/page.tsx' tests/rc1-04c/verify.ts tests/unit/rc1-04c-starter.test.ts tests/integration/starter-experiences.integration.test.ts --max-warnings=0
npx.cmd eslint 'src/app/(frontend)/[...path]/page.tsx' tests/rc1-04c/verify-article.mjs --max-warnings=0
```

Receipts: `units-current.log`, `journey-accepted.log` / `journey-checks.json`, `restart-current.log` / `restart-checks.json`, `article-final.log` / `article-checks.json`, `migrations-accepted.log`, `types-final.log`, `lint-current.log`, `lint-article.log`, `full-types-current.log`.

Assets: four existing repository SVGs, no new raster generation or external image requests. [asset-identity.json](asset-identity.json) records exact SHA-256 and repository AGPL-3.0-or-later provenance. Media metadata no longer attributes ownership to fictional sample people or invents Creative Commons artwork provenance. The hero original is byte-equal through the canonical media route and restart.

Known bounded diagnostics: the injected signup 503 and anonymous community-auth 401 responses are expected negative paths. A native disclosure toggled before React hydration can emit an attribute warning; the keyboard action succeeds and no uncaught JavaScript exception was observed. No complete WCAG conformance or production bundle/image claim is made. Whole campaign integration execution, passkey enrollment and remote delivery are outside this subpass and unexecuted by this agent.

No open 04C functional blocker remains. Seven unrelated 03D type diagnostics and aggregate RC1 closure remain open. Disposable data/media and all valid historical evidence are preserved. Resources are stopped after evidence collection; no next subpass is executed.
