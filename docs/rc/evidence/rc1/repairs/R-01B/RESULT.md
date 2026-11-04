# R-01B — Ordinary first-run owner setup and account recovery

**Status: PASS (2026-11-03, union-tree re-verification, local production processes)**
Supersedes nothing: the 2026-11-02 container run remains the container proof and is
preserved verbatim in `RESULT-2026-11-02-container.md`. This run re-executes the
identical journey on the union tree on a Docker-less host and confirms the same
outcome. Aggregate RC1 remains NOT READY (other subpasses/repairs outstanding).

## Tested source

- Branch `rc1-repair-01b`, from union base `rc1-repairs` @ `8cd1993` (Harbor Pass 17
  line 17B–17F + Matthew's 17A product fixes from GitHub main + ChatGPT-side Docker
  fixes).
- Production build: sourceSha `903c117b206b510ef0cfef3055be5a86f30ece41`,
  `build-provenance.json` records `clean: true`, version `0.1.0`. `npm run build`
  exit 0.
- Harness commits on this branch: `903c117` (local-process variant) and `e9a3f38`
  (supervisor fixes found while reproducing — see First failure). Harness files are
  not part of the production build.
- Base caveat: the parent later corrected the union to `rc1-union` @ `604e940`. The
  scoped identity/setup/recovery code is byte-identical between `8cd1993` and
  `604e940` (verified: `git diff` over `src/modules/operations/{installation,
  onboarding,passkey-auth}.ts`, `src/modules/identity`, `src/collections/{Identity,
  Sites,Users}.ts`, `src/modules/operations/operator-grants.ts`, the setup/auth API
  routes and pages, and `scripts/recover-installation.ts` is empty; the only `src/`
  diff between the bases is `src/modules/commerce/tasks.ts`, the 17E stale-lease
  fix, outside R-01B scope). This verification therefore carries over to the
  corrected union unchanged.
- Runtime: production standalone server (`.next/standalone/server.js`, the image CMD
  equivalent) + `npm run jobs:worker`, as local processes behind a local HTTPS
  reverse proxy (self-signed TLS, `https://rc1-01b.test:38756`, trusted-proxy hop) —
  the 17C/17D local-process precedent. **Docker is unavailable on this host (17C
  docker-investigation); no container proof is claimed by this run.**
- PostgreSQL **16.15** local (CI uses 17.6 — recorded verbatim), disposable database
  `rc1r01b_main`, 131 migrations applied via `npm run db:migrate`.
- Deployment profile: Standard. Provider mode: local only (`EMAIL_MODE=disabled`,
  `STORAGE_DRIVER=local`); no external sends, charges, or posts.
- Test authentication DISABLED for the normal path: `ENABLE_TEST_ROUTES=false`,
  `LOCAL_E2E_TEST_MODE=false`, `NEXT_PUBLIC_LOCAL_TEST_AUTH=false`,
  `RENEGADE_LOCAL_TEST_AUTH=false`. (The last two names exist only in evidence text
  in this tree; the operative switches are the first two — all four were set false.)
- Browser: Chromium (Chrome for Testing 151.0.7922.34) via Playwright, CDP WebAuthn
  virtual authenticator (ctap2 / internal / resident key / user verified) — the
  repo's established 15E/17A approach: genuine WebAuthn protocol against the real
  web process, not a test login API and not a forged session.

## First failure

- Original R-01B product failure (from the 2026-11-02 run, preserved in
  `RESULT-2026-11-02-container.md`): `POST /api/setup/complete` → 400,
  `HierarchyError` — `provisionStarterContent` created the starter Home page
  published but without a Lexical `body`. The repair (export `toLexicalDocument`
  from `src/modules/starters/service.ts`; pass `body:` in
  `src/modules/operations/onboarding.ts`) **is present in the union tree**
  (`onboarding.ts:399,421`; `starters/service.ts:16`) and is exercised green by
  this run. No product defect reproduced on the union tree; **no product-code
  changes were required**.
- The failures reproduced on THIS host were all in the new local harness, each
  diagnosed from traces/logs and fixed in harness code only (commit `e9a3f38`):
  1. Chromium routed `rc1-01b.test` through the sandbox egress proxy →
     `ERR_TUNNEL_CONNECTION_FAILED`. Fixed: browser child runs with proxy env
     stripped + `--no-proxy-server`.
  2. Supervisor warm-up used blocking `spawnSync` in the same process that hosts
     the HTTPS proxy → the warm-up deadlocked against its own proxy. Fixed:
     async warm-up.
  3. The journey itself ran under `spawnSync`, freezing the proxy and the restart
     watcher for the whole run → first navigation stalled
     (`net::ERR_TIMED_OUT`, document request never answered). Fixed: async spawn.
  4. Restart race: the spec probed health for "up" only, and the still-running old
     process answered before the supervisor restarted it, so the post-restart
     passkey login ran against a process about to be killed (in the container
     spec, `docker restart` is synchronous, so the race does not exist there).
     Fixed: the local spec waits for a down-then-up transition. Assertions
     unchanged.

## Real workflow (all in one Playwright journey, 1 passed, 48.4s)

Fresh production stack, empty DB → browser opens `/setup`, setup token issued to
the web log → bad token denied (400), expired/reused token denied (410) →
interrupted setup recovered through the supported operator CLI
(`npm run installation:recover`) → setup completed through the real UI with a real
passkey registration (WebAuthn virtual authenticator): first owner created,
starter content provisioned (incl. the repaired Lexical body), first site created,
10 emergency recovery codes issued → dashboard reached → logout + cookie clear →
fresh-page passkey login (credential copied to a second virtual authenticator) →
emergency recovery-code login → replay of the used code denied (400) → web process
restarted by the supervisor (old process SIGTERM/exit 143, new process ready) →
persisted state re-asserted identical → post-restart passkey login → logout →
revoked session denied access to `/admin` (redirected to `/login`).

## Database assertions (`db-assertions-local.json`)

Identical in shape and values to the 2026-11-02 container run: installation
`complete` (singleton, bootstrap token hash/expiry null — token consumed); exactly
1 user (`owner@rc1-01b.test`, role `owner`); exactly 1 passkey (counter 3,
transports `["internal"]`, `backed_up` false); recovery codes 10 total / 1 used /
9 unused; exactly 1 site (`R-01B Owner Site`, slug `rc1-r01b-owner`, lifecycle
`active`); exactly 1 `member_site_roles` grant (`community-manager`).

## Tests

- Browser journey: `node tests/rc1-r01b/run-local.mjs` → Playwright
  `tests/rc1-r01b/owner.local.spec.ts` — **1 passed, 0 failed** (48.4s).
- Focused unit tests: **57/57 passed** — `owner-recovery.test.ts` (3),
  `installation-readiness.test.ts` (7), `rc06-auth-attacks.test.ts` (6,
  WebAuthn challenge/origin/RP-ID attack negatives), `authorization-matrix.test.ts`
  (28), `rc1-17a-user-scope.test.ts` (13, Matthew's 17A tests).
- Full unit suite on the union tree (baseline measurement): **2052 passed /
  11 failed** (2063). The 5 named pre-existing failures are present
  (flow-04-acceptance, payload-domains, rc1-04d-campaign-commerce, shop-08 ×2).
  **6 additional failures, all media site-scope, not in Harbor's line baseline:**
  `rc1-05a-media-lifecycle.test.ts` ×3 and `med-01-upload-sessions.test.ts` ×3,
  all `Site scope access denied` from `assertMediaPermission` /
  `checkOperatorSiteAccess`. Plausible interaction with Matthew's 17A
  operator-grant scoping on the union tree; **out of R-01B scope (media is R-05C
  territory), not repaired here — flagged for R-05C / Pass 18 reconciliation.**
- Final-tree typecheck: `npx tsc --noEmit` on `e9a3f38` — **exit 0** (re-run as
  the last check on the committed tree).
- Production build: exit 0 (see Tested source).

## Negatives + restart (all executed, none skipped)

Journey-level: bad setup token 400; expired/reused setup token 410; recovery-code
replay 400 with `used_codes` still 1; revoked session redirected from `/admin` to
`/login`. Unit-level: WebAuthn challenge/origin/RP-ID attack set and the
authorization matrix (see Tests). Restart: real web-process restart (not a
container restart — bounded by this host's lack of Docker); state identical
afterwards per DB assertions and post-restart passkey login succeeded. The
2026-11-02 run holds the container-restart proof for the same code path.

## Evidence (this folder)

`RESULT.md` (this file), `NEXT.md`, `db-assertions-local.json`,
`setup-local.png`, `login-local.png`, `recovery-local.png`,
`post-restart-local.png`, `trace-local.zip` (passing run), `web-local.log`,
`worker-local.log`. Prior container-run evidence preserved alongside:
`RESULT-2026-11-02-container.md`, `NEXT-2026-11-02-container.md`,
`db-assertions.json`, `setup.png`, `login.png`, `recovery.png`,
`post-restart.png`, `trace.zip`.

## Remaining blockers

None for R-01B. Carried items (not R-01B blockers): the 6 media site-scope unit
failures for R-05C / Pass 18; container/Compose proof on the union tree awaits any
Docker-capable host (the journey's container variant `tests/rc1-r01b/owner.spec.ts`
+ `playwright.r01b.config.ts` already exists and passed on 2026-11-02).
