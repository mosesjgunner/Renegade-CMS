# Analytics/privacy runtime evidence

Validated with `npm run typecheck` and `npx vitest run tests/unit/analytics-contracts.test.ts tests/unit/analytics-privacy-runtime.test.ts tests/unit/payload-domains.test.ts`.

The browser-state tests assert: first visit has necessary-only defaults; reject and withdrawal leave analytics false; selective acceptance enables only selected categories; a signed current-version choice survives a returning visit; and GPC suppresses analytics. Contract tests cover bot detection, deduplication, bounded rollups, and retention candidate selection. The collection endpoint additionally rejects disabled analytics, missing/stale/tampered consent, unknown sites, unsupported events, bot/internal traffic, and invalid paths before persistence.

The Playwright browser suite is registered as `npm run test:browser` and seeds an isolated active site plus enabled privacy policy. It asserts browser-network, cookie, and storage behavior for first visit, rejection, selected acceptance, returning visit, withdrawal, and Do Not Track. Chromium uses the installed Google Chrome channel, avoiding an untracked browser download.
