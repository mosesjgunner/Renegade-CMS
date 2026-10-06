# RC-06 Pass 2 — BLOCKED

Date: 2026-10-05 (America/Chicago). Inspected HEAD: `e25f1b554eeae6e898d754822c64181f4b8040cc`, with pre-existing source, dependency and evidence changes. This is a working-tree assessment, not an immutable candidate PASS. Existing changes and local databases were preserved.

AGENTS.md, RC_SCOPE, README, HANDOFF, BLOCKERS, SECURITY_LEDGER and current RC evidence were read. No identifiable RC-06 Pass 1 commit, report or acceptance harness exists in the inspected local branches/worktrees. The uncommitted package upgrades were retained, not recreated. [RC-05 Pass 3](RC-05-PASS3.md) records FAIL and missing Pass 1/2 implementation/acceptance; its hardened integrated money paths cannot be reused as proved work. The explicit RC-06 request authorizes this assessment but does not turn those missing prerequisites into evidence.

## Dependency state and decisions

`npm ci` exits 0. The final, post-install `npm audit --json` exits 1 and reports 21 affected packages: 9 high, 12 moderate, 0 critical, covering 7 distinct advisory IDs. `npm outdated --json` exits 1 and records current/wanted/latest separately. Install-script warnings remain in the receipt; no `audit fix --force`, framework downgrade or new script approval was performed.

The [per-package adjudication](rc-06-pass2/dependency-adjudication.json) records installed versions, dependency paths, upstream advisories, patch information, scope, preconditions, mitigation, evidence and the decision for all 21 packages. [Dependency graph](rc-06-pass2/dependency-graph.json), [audit](rc-06-pass2/npm-audit.json), [outdated](rc-06-pass2/npm-outdated.json) and [standalone dependency inventory](rc-06-pass2/standalone-dependencies.json) are retained.

- **DEV/TEST-ONLY:** eslint-config-next, @next/eslint-plugin-next, vitest and @vitest/mocker. Lint/test entry points are in package.json; none is deployed in the standalone tree. The Vitest mock-server advisory does not describe `vitest run` in the configured Node environment.
- **NONBLOCKING-NOT-REACHABLE:** braces, brace-expansion, micromatch, fast-glob, chokidar, sass, esbuild, @esbuild-kit/core-utils, @esbuild-kit/esm-loader and drizzle-kit. Dependency graph and source search place these in build, development watching or migration tooling. The affected packages are absent from standalone; the application's source does not invoke their pattern parsers on request data. The esbuild-kit caller invokes transform/transformSync rather than the vulnerable development server. Payload's withPayload configuration excludes drizzle-kit from production tracing. This decision does not authorize exposing development/migration servers or adding runtime glob parsing.
- **NONBLOCKING-NOT-REACHABLE:** payload and affected @payloadcms framework ancestors. Only Users configures Payload collection authentication, and sets `disableLocalStrategy: true`. The actual installed `unlockOperation` is executed with a staff actor in the new attack suite; it returns Forbidden/403 before requiring a database. This denies the affected account-unlock path. Inherited Sass/loader findings have the tooling evidence above. This is a narrowly supported dependency decision, not proof of all Payload authorization behavior.

Primary references: [Payload account unlock](https://github.com/advisories/GHSA-jg8r-5jh2-v2xj), [braces stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [Vitest redirect mock](https://github.com/advisories/GHSA-82fw-gwwq-j7x9), [esbuild development server](https://github.com/advisories/GHSA-67mh-4wv8-2f99). Payload and braces advisory pages list no patched version; npm's suggestion to update a parent package is not equivalent to a confirmed patched vulnerable package. The Next 14 ESLint downgrade suggestion is incompatible with the retained Next 16 line and was not applied.

## Executed proof

Focused existing suites: **63 files / 473 tests passed**, no failures or skips. New admin attack suite: **1 file / 6 tests passed**, no failures or skips. Total: **64 files / 479 tests**. Actual JSON receipts are authoritative; Vitest's suite count includes nested describe blocks and is not a file count.

The existing suites exercise member link reuse, suspension/revocation, CSRF helper contracts, community access/private relationships, moderation, attachment contracts, consent/retention, provider envelope authentication/redaction, uploads, SSRF private-target/redirect rejection, relative redirect safety, webhook forgery/misbinding/staleness and commerce tampering/scope/idempotency helpers. These are helper/adapter or mocked-route tests, not integrated browser/DB proof of each named surface. No XSS, distributed abuse, production delivery or full tenant matrix claim is inferred.

The new suite executes current owner/administrator/staff authority resolution, denies validly signed cookies with no persisted active session, rejects forged/expired/wrong-collection/missing-session tokens before database access, and executes the installed upstream unlock denial. Database/session results are mocked in this unit suite; successful passkey ceremonies, real revocation races, session rotation and setup-token expiry/reuse remain unexecuted.

[Operational harness](../../../scripts/rc06-operational-acceptance.mjs) starts the newly built standalone artifact with NODE_ENV=production, production-valid configuration, disabled email and both test bypass flags false. It creates and migrates a new copy of the disposable RC-02 publication, never the ordinary local database. No business status rows are edited to synthesize workflow success. Operational corruption probes temporarily remove one migration ledger entry and rename a critical schema column only in that isolated copy, then restore both in finally blocks.

[Eleven observations](rc-06-pass2/operational-results.json) prove liveness 200; baseline readiness 200; pending migration readiness 503; critical-schema corruption readiness 503; restored readiness 200; anonymous denial on commerce dashboard, AI connections and social accounts (403); anonymous member identity denial (401); real Chromium login rendering without page errors or checked environment-secret matches; and anonymous /connections redirect to /login. [Screenshot](rc-06-pass2/anonymous-login.png) and redacted server/migration logs are retained. Transport is loopback HTTP behind a production-configured HTTPS origin; external TLS/proxy interoperability is not claimed.

The first copied template had 108 of 110 migrations and returned 503. That initial harness failure is preserved as `initial-unmigrated-*`. A new copy was migrated before rerunning. Subsequent API-only and browser-extended runs are separately retained. No product assertion was weakened.

Typecheck, zero-warning lint and production build pass. The final added files also pass typecheck/lint. Production standalone boot and focused operational/API/browser smoke pass. The full final RC suite was not run.

## Secrets and privacy limits

The credential primitive really uses AES-256-GCM, a random IV, an authentication tag and 32-byte keys; the executed connection-runtime tests prove round-trip, tamper denial and projection omission. AI storage persists the envelope in a hidden, native-access-denied ai-credentials collection and requires a configured key. This does not claim encryption of all provider credentials, all application data or messages. The operational harness checks responses/rendered login for its environment-secret values and redacts its captured logs; it does not establish an exhaustive unredacted worker-log/client-bundle/backup audit.

Consent, suppression, relationship privacy and analytics retention contracts pass their focused unit tests. Previously recorded RC-04 runtime proof remains historical evidence. Current authenticated export, deletion/deferral, private bytes, cross-member/cross-site reads, backup/export contents and raw-IP retention acceptance were not executed here and remain release gates.

## Blocking findings and remaining work

1. **RC06-BASELINE:** Missing identifiable completed RC-06 Pass 1 changes/evidence and no frozen integrated candidate. Preserve the current diff and bind the next run to an actual candidate.
2. **RC06-MONEY:** Missing RC-05 integrated checkout/order/payment/webhook/race acceptance. The source-confirmed fabricated Printful file and mockup outcomes and default approved sample mapping remain shipping blockers under the existing provider ledger; this pass neither repairs nor deliberately disables them. Unit tests cannot clear that gate.
3. **RC06-BOUNDARIES:** The required authenticated browser/API role/object/site/publication/tenant/space matrix, successful passkey/member ceremonies, stale-session actions, setup attacks, CORS/CSRF state changes, rendered XSS/protocol attacks, remote-ingestion inventory/probes, real MIME/sniff/size/private-byte attacks and implemented abuse limits remain incomplete.
4. **RC06-PRIVACY-SECRETS:** Full runtime/worker/browser/client-JS/provider status/backup secret inspection and authenticated privacy/export/deletion acceptance remain incomplete.
5. **RC06-REGRESSION:** Payload generation and full focused infrastructure/browser integration regression remain unexecuted. No aggregate release or absence-of-application-vulnerability claim is supported.

Verdict: **BLOCKED**. The dependency decisions and bounded operational checks permit further acceptance work; release cannot proceed. The remaining work is substantive hard-pass acceptance, not only formatting or low-cost cleanup. Do not hand off unresolved boundary proof as cleanup.
