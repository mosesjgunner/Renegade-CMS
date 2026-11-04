# R-08-SOCIAL — Reconcile old 08D and finish actual social 08A–08C

## STATUS (independent per subpass — never blended)

- **08A (provider setup & capability truth): PASS**
- **08B (composer / approval / scheduling): PASS**
- **08C (dispatch / retry / acceptance): PASS**
- **R-08-SOCIAL: PASS** (2026-11-03, local production processes on
  this Docker-less host; the frozen 2026-10-19/20 records are
  preserved in `docs/rc/evidence/rc1/18-pass/08A|08B|08C/`).

One genuine product defect was reproduced and repaired (see FIRST
FAILURE / CHANGES): on the production build, the documented
local-harness mode could not be used at all, because the SSRF
validator's dev/test-only HTTP/loopback gate silently overrode the
operator's explicit `SOCIAL_LOCAL_ADAPTER_ORIGINS` allowlist. The
frozen acceptances never saw it — they ran a Next.js **dev** server.

## LEGACY 08D CROSSWALK (what "08D" actually was)

- The current 70-subpass plan has **no 08D**. No 08D ledger row was
  created or updated by this repair.
- The only social "08D" reference in the repo is
  `docs/rc/evidence/rc1/18-pass/08C/PRIOR-NEXT-20261020.md`, which
  named the *next planned* subpass "08D/70 — SOCIAL FEDERATION,
  INBOX & MENTIONS". It was never executed, has no RESULT or
  evidence, and is not part of the current plan. **No status is
  claimed for federation/inbox/mentions here** — it remains an
  unexecuted, out-of-plan item, not a PASS and not a defect found.
- The October 6–8 "RC08D" receipts (`RC08D-01`…`RC08D-07`: site
  settings lock, staff enrollment, tenant authorization,
  fulfillment, dependency/Docker image, acceptance verification)
  are an earlier release-gate series, superseded as NOT READY on
  2026-10-07. They are **not social-distribution items**, do not
  map to 08A–08C, and were left untouched.
- What this repair reconciles is the frozen social trio: 08A PASS
  bounded (2026-10-19), 08B PASS bounded (2026-10-20), 08C PASS
  bounded (2026-10-20) — all on dirty-tree overlays, dev servers and
  Windows/Docker. All three are re-executed below on the current
  tree, on production processes, with independent verdicts.

## TESTED SOURCE

- Branch `rc1-repair-08-social`, created from `rc1-repair-03d` @
  `d80365c`.
- Base parity: the social-scoped `src/` diff between the corrected
  union `rc1-union` @ `604e940` and this branch's base is **empty**
  (`src/modules/social`, `src/collections/Social.ts`, the social
  admin/API routes and `SocialCommandCenter.tsx` are byte-identical
  to the union). The full `src/` diff vs the union is exactly the
  eight accepted files from R-03A / 17E / R-05C / R-03D.
- Tested tree: production build of `c52f211` — `npm run build`
  exit 0, `build-provenance.json` sourceSha
  `c52f211faaebdcde4891ace5a70c76e83355faf3`, `clean: true`, version
  `0.1.0`, lockfileSha256
  `db6f9bbcca7ec4232a72af85e9e13762429bb3f1dbce09fd20f120ce1e3ccc33`
  (same lockfile hash as the R-03B/R-03C/R-03D/R-05C builds). The
  one product-fix commit under test is `c52f211`. Four later commits
  are harness-only (`tests/rc1-r08-social/`); `git diff
  c52f211..HEAD -- src/` is empty.
- Runtime: production standalone server (`.next/standalone/server.js`)
  + `npm run jobs:worker` as local processes behind a local HTTPS
  proxy (`https://rc1-08s.test:38792`), disposable PostgreSQL
  database `rc1r08s_main`, PostgreSQL **16.15**, **131 migrations**
  via `npm run db:migrate`. Profile Standard, `RENEGADE_MODULES=all`.
  Test authentication DISABLED (`ENABLE_TEST_ROUTES=false`,
  `LOCAL_E2E_TEST_MODE=false`). A disposable locally generated
  `RENEGADE_ENCRYPTION_KEY` is supplied under `scratch/rc1r08s/`
  (production fails closed without one — see run history).
- Provider mode: **local sinks only**. One loopback receiver on
  `127.0.0.1:3141` serves both the AT Protocol (Bluesky) and
  Mastodon protocol shapes and is the sole origin in
  `SOCIAL_LOCAL_ADAPTER_ORIGINS`; `127.0.0.1:3142` is a deliberately
  **unapproved** origin that must never receive a request. No real
  provider API, real credential or real external post was involved.
  Claims are kept distinct throughout: *unconfigured safety* (08A
  absent-credential state) ≠ *adapter-harness success* (everything
  proven here) ≠ *remote sandbox* (not claimed) ≠ *real-world
  outcome* (not claimed).
- Harness: `node tests/rc1-r08-social/run-local.mjs` — journey ->
  web+worker process restart AND PostgreSQL cluster restart ->
  restart re-verification. The owner is created by the real
  installer WebAuthn ceremony (CDP virtual authenticator, the
  R-03D pattern); staff/foreign negative actors use labelled
  fixture sessions (the frozen 08A–08C pattern), never claimed as
  WebAuthn proof.

## FIRST FAILURE

**Reproduced product defect (run 4, production build, 08A check 3):**
connecting the local-harness Bluesky account through the supported
admin API returned `success: false`, `credentialHealth: revoked`,
with diagnostics `lastError: "SSRF Blocked: Disallowed protocol:
http:. HTTPS is required."` — truthful failure, no fake success, but
the designed local-harness path was unusable in production:

- `src/modules/social/security.ts` `validateOutboundUrl` computed
  the HTTP/loopback permission as `allowHttpInDev && (NODE_ENV is
  development|test)`. In production the permission was always false.
- The social design contradicts a dev-only reading: the Bluesky and
  Mastodon adapters pass `allowHttpInDev: true` unconditionally,
  `src/modules/social/dispatch-boundary.ts` gates local origins on
  the operator allowlist `SOCIAL_LOCAL_ADAPTER_ORIGINS` (no NODE_ENV
  condition, and its error message presents the allowlist as *the*
  authorization), and `socialRequestSignal` provides a
  local-adapter timeout with no NODE_ENV gate. The allowlist was
  dead code in production.
- Why prior passes missed it: the frozen 08A/08B/08C runs used a
  Next **dev** server; 17B's allowlisted-loopback Discord journey
  likewise ran its adapter child with `NODE_ENV: 'development'`
  (`tests/rc1-17b/journey.ts:140`); 16C's loopback conformance ran
  in-process under test env. No prior pass exercised local-harness
  social from a production process.

Harness-era findings on the way (none a product change): (1) a
newly created member is auto-granted `contributor` on the existing
site and `(site, member)` is unique, so fixture grants must upsert;
(2) production requires `RENEGADE_ENCRYPTION_KEY` for the secret
envelope (the frozen `run-isolated.ps1` supplied a test key; the
supervisor now generates a disposable one); (3) the composer's
all-targets validation gate correctly blocks when revoked /
unconfigured accounts exist on the site, so the 08A
revoked/unconfigured checks run after the 08B composer journey;
(4) the dedicated crash-web process must send the canonical
`APP_URL` Origin, not its loopback transport origin.

## CHANGES

Product (commit `c52f211`), one file, no schema changes:

- `src/modules/social/security.ts` (`validateOutboundUrl`): the
  HTTP/loopback permission is now `allowHttpInDev && (dev/test ||
  the URL origin is explicitly allowlisted in
  SOCIAL_LOCAL_ADAPTER_ORIGINS)`. Scope is deliberately narrow:
  callers that do not pass `allowHttpInDev` are unaffected;
  non-allowlisted loopback stays blocked in production; the cloud
  metadata and RFC1918/CGNAT/link-local blocks below still apply
  even to allowlisted origins (proven by a regression test). Every
  adapter network path additionally re-checks the allowlist through
  `socialFetch` → `assertSocialEndpoint`, so the allowlist remains
  the single authorization for local origins.

Tests (in `c52f211`): new
`tests/unit/rc1-r08-social-local-origins.test.ts` — 6 tests
(production allowlisted permitted; production non-allowlisted
blocked; no-opt-in blocked; allowlist cannot rescue a metadata
endpoint; dispatch boundary accept/reject in production; dev/test
behavior unchanged). No existing assertion changed or loosened.

Harness only (`tests/rc1-r08-social/`): `run-local.mjs` supervisor,
`verify-local.ts` (frozen assertion families retargeted; checks
counted independently per subpass).

## REAL WORKFLOW

Definitive supervisor run exit **0** — journey **105 checks**
(setup 3 + **08A 26 + 08B 35 + 08C 41**), restart **20 checks**
(08A 1 + 08B 2 + 08C 17), 0 failed.

- **Setup** — fresh DB -> real installer (virtual WebAuthn) creates
  the owner + `08S Operator Social` site -> a real article is
  authored and published through the native API and is anonymously
  reachable.
- **08A** — anonymous and foreign-operator connect attempts denied
  (403) -> Bluesky connect through the admin API against the local
  AT harness: healthy, mode truthfully `local-harness`, text limit
  300, harness received a real `createSession` -> DB holds only an
  `enc:` AES envelope (decrypts via the diagnostic path), API output
  contains no secret -> invalid credentials fail truthfully
  (revoked + sanitized diagnostic, harness saw the bad-auth call) ->
  absent credentials report `not-configured` with manual-handoff
  capability state (unconfigured safety, not upgraded) -> capability
  truth keeps local-harness / remote-sandbox / live / manual-handoff
  distinct -> non-publishing test ping succeeds and stamps
  `lastVerifiedAt` -> disconnect sets revoked and clears the
  connection reference -> integrations dashboard reflects the
  healthy account with true `social.publish.text` scope -> Social
  Command Center displays the account (screenshot).
- **08B** — anonymous/bogus/foreign draft reads denied (403) ->
  adapter pre-flight rejects 350-char Bluesky copy (400) -> through
  the UI: per-platform drafts from the published article (canonical
  URL = the article URL), tailored Bluesky and Mastodon copy,
  validation gate passed, saved, submitted for review -> staff
  approval denied (403) and in-review scheduling denied (400) ->
  owner approval pins a `sha256:` approvalHash + approvedBy on
  every variant -> staff scheduling denied (403) -> owner schedules
  through the UI: exactly 2 queue items, status scheduled,
  deterministic idempotency keys naming the draft -> a second draft
  bound to the article via `sourceContentId` is edited through
  `update-draft` (edit persists), submitted and declined: draft and
  variants cancelled, exactly 0 queue items, scheduling the
  cancelled draft rejected (400) -> queued records persist after a
  browser reload.
- **08C** — due work executes through the real worker path
  (durable operations job + jobs-worker outbox sweep): a
  two-destination draft settles published (Bluesky) + failed
  (Mastodon 500), parent truthfully `partially-published`, receiver
  holds the exact Bluesky text, receipt persisted -> future work is
  never sent early -> failed-only retry publishes the failure
  without resending the success (Bluesky sends unchanged, Mastodon
  sends = 2), parent reaches published -> real 429 persists
  rate-limit kind + future retry time; early manual retry is
  refused (attempt count stays 1, zero record sends); after expiry
  exactly one successful send -> always-failing delivery is bounded
  at exactly 3 sends / 3 attempts -> lost response (socket destroyed
  after acceptance) persists `unknown`; failed-only retry excludes
  it; read-only reconciliation finds the accepted post with no
  resend -> real adapter timeout stays `unknown` quarantined;
  unsupported Mastodon reconciliation does not replay it and no
  receipt exists for it -> a provider revoked *before* scheduling is
  never called (0 sends) and persists `reconnect-required` -> the
  unapproved origin fails as validation with **zero** requests
  received and no retry scheduled -> worker interruption: the
  supervisor's jobs worker is stopped (deterministic claim, as the
  frozen run owned its worker), dispatch runs through a dedicated
  web process that is SIGKILLed after the receiver accepts the post;
  the queue row persists `publishing` with a real lease and a
  `started` attempt; a fresh jobs worker recovers it after the
  natural 60-second lease expiry — published, exactly 1 send, 1
  attempt — and a browser reload presents the recovered publication
  -> final integrity: no duplicate `(account, remoteId)` receipts;
  every published attempt's receipt identifies `local-harness`.

## TESTS

- Supervisor acceptance: **journey 105 + restart 20 checks,
  0 failed**, both phases exit 0 (counts above).
- Focused social units (final tree): the frozen 7-file set
  (`rc1-08a-social-providers`, `rc1-08b-social-composer`,
  `rc1-08c-social-dispatch`, `rc1-08c-current`, `social-contracts`,
  `dist-03-social-command-center`, `dist-05-social-api-routes`) —
  **51 passed / 0 failed**; the new regression file adds **6 passed**;
  the security suites re-run with the fix (`dist-01-security-and-
  contracts`, `security-negative-matrix`, `rc1-17b-security` plus
  the 08A/08C files) — **89 passed / 0 failed** in that combined run.
- Full unit suite (`npm test`, final tree): **2065 passed /
  5 failed (2070)** — the baseline was 2059/5; the delta is exactly
  the 6 new regression tests. The 5 failures are the named
  pre-existing set (flow-04-acceptance x1, payload-domains x1,
  rc1-04d-campaign-commerce x1, shop-08-command-center-boundaries
  x2). **The shop-08 failures are commerce command-center
  boundaries, not social**: nothing in this repair's evidence
  implicates them, and they did not contaminate the 08A–08C
  verdicts (all social suites pass).
- Production build: `npm run build` exit **0** (provenance above).
- Final-tree typecheck: `npx tsc --noEmit` exit **0**.
- Scoped ESLint on the product file, the regression test and the
  harness: exit **0**.

## NEGATIVES + RESTART

- 08A: anonymous 403; foreign operator connect 403; invalid
  credentials truthful failure; absent credentials not-configured.
- 08B: anonymous/bogus-session/foreign draft reads 403; over-limit
  copy 400; staff approve 403; staff schedule 403; in-review
  schedule 400; cancelled-draft schedule 400; declined draft has 0
  queue items.
- 08C: foreign worker dispatch-item/retry-failed/reconcile 403;
  anonymous dispatch 403; cross-origin dispatch 403; native API
  cannot forge queue completion (403) or a provider receipt (403);
  native staff PATCH cannot forge variant approval/publication or
  parent publication state (persisted values unchanged); denied
  writes preserve the future queue item with 0 attempts and no
  forged external post exists; single-item dispatch enforces future
  due time.
- Restart: web + worker **process** restart **and PostgreSQL
  cluster** restart executed between phases; all 20 restart checks
  green — every queue row's status/attempt count, exact external
  post and attempt counts, the scheduled 08B draft, the future queue
  item (still scheduled, 0 attempts), the healthy local-harness
  account; a post-restart dispatch replays nothing and adds no
  attempt; the public article is unchanged.

## REMAINING BLOCKERS

None for 08A, 08B or 08C. Bounded / unexecuted items, named
honestly — none is relabeled as passed:

- **Remote sandbox and real-world provider delivery are unexecuted
  and unclaimed.** Everything proven is adapter-harness success
  against a local protocol receiver, plus unconfigured safety. No
  real external post was made (hard safety line held).
- **Federation / inbox / mentions (the legacy planned "08D")** is
  unexecuted — it is not in the current 70-subpass plan and no
  status is recorded for it.
- Staff/foreign negative actors use labelled fixture sessions (the
  frozen 08A–08C pattern); the only WebAuthn claim is the owner's
  real installer ceremony. No passkey login claim is made for the
  fixture actors.
- Production image / Compose proof is unexecuted — Docker cannot
  run on this host (established in 17C). The local-process
  production build is the strongest proof available here.
- The 08B UI draft is created from the published article by its
  canonical URL (the UI's own binding); the `sourceContent`
  attribution binding is proven on the API-created second draft
  against the same article.
- Run history: run 1 stopped on fixture member-grant shape (3
  checks); run 2 on the member auto-join unique grant (3 checks);
  run 3 on the missing production encryption key (5 checks); run 4
  reproduced the SSRF/allowlist defect (5 checks, 08A); the build
  for run 5 was interrupted by a VM replacement (PostgreSQL
  reinstalled, 16.15); run 5 stopped on a Playwright strict-mode
  card collision (35 checks); run 6 on the composer all-targets
  gate (36 checks); run 7 on the source-binding response shape (46
  checks); run 8 reached 99 checks and stopped in the crash
  scenario on the dedicated web process's Origin; run 9 is the
  definitive run reported here. Intermediate artifacts are retained
  under `scratch/rc1r08s/`.

## NEXT

R-08-SOCIAL is complete. Do not start another repair automatically;
R-09A is next only on the parent's instruction (see NEXT.md).
