# RC3-06 — Beginner install and admin recovery rehearsal — RESULT

**This was an operator-run rehearsal, not user testing.** UXI-14
(recruiting real beginners) is CLOSED by owner decision (Nov 20, 2026)
until the owner is ready for people to see the product. Nobody was
recruited, nobody was simulated, and nothing here is a participant
result. One operator (this agent) walked the documented beginner and
recovery paths with fresh eyes and a checklist, using the repo's own
browser technique (Playwright + a CDP virtual WebAuthn authenticator —
the same harness shape as `tests/browser/first-run-setup.spec.ts`).

**Baseline:** branch `rc3-06` from `2d4cb3ddf70db5b5f9570297e6bae0d7ff8774bf`
(the `rc2` tag; a fresh fetch confirmed main still resolves to that SHA
before the worktree was created).

**Environment:** Node v24.22.1, PostgreSQL 16.15 local cluster (the
Compose topology targets PG 17; the app and all prior RC passes run on
this cluster), acceptance DB `rc306_release_acceptance`. Production
build of the unmodified tree: exit 0, provenance "Built source
2d4cb3d…; clean source: true", standalone 1,117,797,606 bytes —
byte-identical in size to RC3-04/RC3-05's measurement of the same tree.

**Sandbox caveats (apply wherever noted):**

- **No Docker daemon** exists in this sandbox (same wall as RC3-04/05),
  so `install.sh`'s Compose stages cannot execute here. The installer
  was rehearsed against a logging Docker stub that answers the
  availability probes and stops dead at `compose up`; nothing past
  that wall is claimed. With the real client the installer fails
  cleanly: "Docker is installed but unavailable to this user."
- Serving used the repo's `LOCAL_E2E_TEST_MODE` smoke configuration
  (production validation intentionally rejects this sandbox's loopback
  APP_URL and dev credentials — same caveat as RC3-03/04/05).
- `/etc/hosts` is read-only here, so a public-hostname browser origin
  could not be simulated; leg 3 used the raw-IP origin and
  configuration-level probes instead.

## Per-leg verdicts

### Leg 1 — Fresh install from the documented entry point — PASS

Path rehearsed: documented installer command (leg 2 has the installer
evidence) → production build → `npm run db:migrate` (156 migrations,
13.6 s) → boot → the `/setup` wizard in a real browser → first public
page → Admin Studio → log out → returning-owner passkey login.

- Wizard: 5 steps (Secure owner, Site identity, Brand & starter,
  Features, Finish), completed in ~6.5 s of screen time; the full
  journey including admin, public homepage and re-login took 11.1 s.
  10 recovery codes issued, shown once.
- The Features step's live checks matched the readiness API exactly:
  PostgreSQL "Verified — Connected. Schema migrations applied
  (156/156)", storage verified, audio engine verified, optional
  connections honestly labelled skippable/unconfigured.
- First public page: HTTP 200 with the starter site rendered under the
  chosen name ("Make this space yours", article list, newsletter CTA).
- Timing on this rig: installer preflight <1 s (to the Docker wall),
  production build ~7 min, migrations 13.6 s, boot ~5 s, wizard ~7 s.
- The one docs/product disagreement on this path is F-01 below (the
  beginner quick start's own command could not start a new install).

### Leg 2 — Interrupted setup and resume — PASS

- **Installer level:** a fresh run generated `.env.production` with new
  secrets, passed preflight, and stopped at container start with the
  documented recovery message ("Fix the reported issue and rerun
  ./install.sh; configuration and volumes were preserved."). Two
  further bare `./install.sh` runs (the runbook's resume command)
  recognized the installation — "Restarting the existing
  installer-managed deployment; configuration is unchanged." — and the
  config file's SHA-256 was identical after every run: no secret
  regeneration, no wipe, repeat-interrupt safe.
- **Tab closed mid-wizard** (kit task card 8 shape): reopening
  `/setup` in the same browser resumed at the interrupted step under
  the banner "Resumed from your saved progress — your earlier answers
  were restored from this installation." A fresh browser profile
  started at step 1 and saw none of the draft — the draft stays scoped
  to the claiming browser, as designed.
- **Server killed mid-wizard** (hard kill, then restart): same resume
  banner, same step, no corruption.
- **Cancelled passkey prompt** (kit task card 5): enrolling with no
  authenticator available left the wizard on the review step showing
  "Passkey creation was cancelled. Your answers are still here — press
  the button again when you are ready." — the quick start's promise,
  verbatim in behavior. The second attempt completed with no data
  re-entry and issued 10 recovery codes.

### Leg 3 — Blocked DNS/HTTPS state — PASS-WITH-FINDINGS

- The setup completion screen carries a "Production HTTPS boundary"
  panel: Renegade listens on its loopback port, a reverse proxy
  terminates TLS, and "Public HTTPS is only reported ready when the
  DNS, certificate, and proxy checks actually pass — a failed check is
  shown as a failure, never as ready."
- The readiness API carries a dedicated `setup.https` task ("Public
  HTTPS & proxy") whose next action is "Fix the DNS, certificate, or
  proxy finding and re-check". The operator runbook's HTTPS section is
  actionable (proxy duties; passkeys bind to the exact domain; recovery
  codes are the bridge across a domain change).
- Raw-IP origin probe (the address an operator actually reaches before
  DNS/HTTPS works): the site and the login page render, and the login
  page offers the **Emergency Recovery Code** tab next to Passkey —
  the documented fallback sits on the page a locked-out owner lands on.
- Production config validation fails closed in this area: a public
  HTTPS `APP_URL` combined with `LOCAL_E2E_TEST_MODE` is refused with a
  `ConfigurationError` naming the key (observed while probing; correct
  guard behavior).
- Finding F-05 (low): on a completed installation the HTTPS task sits
  at "not-started / Not checked yet" — nothing prompts the operator to
  run the check, and the login page gives no hint when the serving
  origin is not the configured public URL.

### Leg 4 — Missing provider — PASS

The default install posture is `EMAIL_MODE=disabled` with no AI,
analytics, social or commerce credentials. Measured against the
sovereign-first invariant (degrade gracefully, never fake success):

- Readiness API and the setup Features step agree exactly: required
  providers verified; email/AI/analytics "unconfigured" (optional),
  each with the message "Not configured (skippable, configurable later
  in Admin Studio)". The audio engine (system ffmpeg 8.1.2 here) is
  reported "validated" — accurate.
- Degraded action: a public newsletter subscribe with email disabled
  returned `202 {"status":"pending"}` and recorded the subscriber as
  `pending`. No crash, no claim of delivery — double opt-in simply
  waits for a mail capability that is not configured yet.

### Leg 5 — Maintenance pause and recovery — PASS-WITH-FINDINGS

- `npm run maintenance:operational -- --enable` **without**
  `--maintenance-window-confirmed` refuses before touching Docker:
  "upgrade requires --maintenance-window-confirmed before application
  services are stopped." With the flag it proceeds to the install
  directory's `.env.production`, as designed. The script's Docker
  transport itself is NOT RUN here (no daemon).
- The pause state the command produces (web + worker stopped,
  PostgreSQL up) was rehearsed at the serving layer: web stopped →
  public site connection-refused, data intact (site row present);
  web restarted → `/health/ready` ready, homepage 200.
- Finding F-06 (low): the guard message says "upgrade requires…" even
  when invoked through the maintenance command — a shared lifecycle
  guard whose wording names the wrong operation. Unambiguous about
  what to do, but off-context.

### Leg 6 — Health and readiness in three states — PASS-WITH-FINDINGS (one defect fixed)

| State                | `/health/live` | `/health/ready`         | `/api/setup/readiness`                                                                        |
| -------------------- | -------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| Healthy              | 200 `live`     | 200 ready, 156/156      | `ready: true`                                                                                 |
| Migrations pending   | **500** → 200  | **500** → 503           | correct: `uninitialized`, recoveryAction names `npm run db:migrate`                           |
| Database unreachable | **500** → 200  | **500** → 503 by design | correct: `disconnected`, recoveryAction "Start PostgreSQL container and verify DATABASE_URL." |

- Root cause of the 500s: `src/proxy.ts` resolved the site from the
  database for every non-API path, so any database failure killed the
  probes (and `/setup`) before their own handlers could answer. A
  liveness probe that dies with the database defeats its purpose — an
  orchestrator would restart-loop the container instead of waiting.
- **Fix (this branch):** `/health` is exempt from proxy site
  resolution, like `/api` and `/admin` — `/health/live` is a static
  answer and `/health/ready` runs its own database/migration checks.
  Regression test `tests/unit/proxy-health-paths.test.ts`: on the
  baseline it fails 2 of 4 (both health cases throw "database
  unavailable" out of the proxy); with the fix it passes 4 of 4,
  including the guard that ordinary public paths still resolve sites
  from the database.
- **Live proof on the fixed build:** DB down → live 200
  `{"status":"live"}`, ready 503
  `{"status":"not_ready","checks":{"database":"unavailable"}}`;
  unmigrated → live 200, ready 503 same body; healthy → unchanged
  (live 200, ready 200, homepage 200, unknown path 404).
- **Open remainder of F-02:** `/setup` still returns 500 against an
  unmigrated database. The failure now sits in the page/layout path,
  not the proxy. The readiness API names the fix, and the documented
  install flow runs migrations before the web tier starts, so a
  doc-following beginner never lands there. Proposed owner: platform.

### Leg 7 — Admin recovery, keyboard only, narrow viewport — PASS-WITH-FINDINGS

Viewport 360×740 throughout; keyboard = Tab/Enter only for the
recovery tasks themselves.

- No horizontal overflow at 360 px on `/login`, `/admin`, or
  `/admin/security` (scrollWidth == innerWidth on all three).
- Keyboard login: email field reached in 6 Tab stops, the passkey
  button in 1 more, Enter → `/admin`. Focus showed a solid 2 px
  outline on links and buttons throughout.
- The Security Center is linked from the admin navigation. On
  `/admin/security`, **Generate new recovery codes** is 3 Tab stops
  into the view; Enter (plus the native confirm, accepted) produced a
  fresh code set — the documented "lost your codes" path (kit task
  card 6) completed keyboard-only at phone width.
- Finding F-07 (low, observation): in the harness capture, the login
  email input's computed focus style showed `outline-style: none` and
  no box-shadow at the moment of focus — every other stop showed a
  clear outline. Recorded with its computed values for the
  accessibility owner (RC3-03 owns ledger row #87; UXI-12's axe run
  passed 12/12 in PR #112, so this is a focus-visibility nuance, not
  an axe-class defect).
- Harness honesty note: Ctrl+L address-bar navigation cannot be
  simulated in headless Chromium (there is no omnibox to focus), so
  reaching the Security Center was proven via its nav link and direct
  route; the recovery task on the page was then performed
  keyboard-only. An earlier attempt that assumed Ctrl+L worked
  produced a false dead-end on the dashboard and was discarded.

## Findings

| ID   | Severity | Status                             | Summary                                                                                                                                                              |
| ---- | -------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-01 | High     | **Fixed in this branch**           | `BEGINNER_QUICK_START.md`'s install command omitted the required `--instance`, so the beginner document's own command failed 100% of new installs.                   |
| F-02 | Moderate | **Fixed (probes); remainder open** | Health probes died with the database because the proxy resolved sites from the DB for every page path. `/setup` on an unmigrated DB remains 500 (page/layout layer). |
| F-05 | Low      | Open                               | HTTPS readiness check is unprompted after setup ("not-started"); no origin-mismatch hint on the login page. Proposed owner: install-UX.                              |
| F-06 | Low      | Open                               | Maintenance guard message says "upgrade requires…" for the maintenance command (shared lifecycle guard wording). Proposed owner: operations.                         |
| F-07 | Low      | Open (observation)                 | Login email input's focus indicator computed as outline-none / no shadow in the harness capture. Proposed owner: accessibility (RC3-03 row #87).                     |

### F-01 fix detail

- `docs/rc/install-ux/BEGINNER_QUICK_START.md`: the command is now
  `./install.sh --instance your-site --app-url https://your-domain.example`
  with a one-line explanation of what an instance is; the token
  paragraph now describes the claim link the installer actually prints
  (15 minutes, single use) instead of a retrieval command; step 3
  matches the claim-link flow.
- `install.sh`: the failure now explains itself —
  "--instance is required for a new installation. It is a short name
  for this installation on this server, for example: --instance my-site."
- Re-run proof (stub transport): the old command now stops at the new
  self-explanatory error; the new documented command, verbatim, passes
  every gate the sandbox can execute and stops only at the container
  start wall, exactly like the README's command in leg 2.

## Changes in this branch

- `src/proxy.ts` — exempt `/health` from database site resolution.
- `tests/unit/proxy-health-paths.test.ts` — new regression test
  (baseline 2 failed / 2 passed → fixed 4 passed).
- `install.sh` — self-explanatory `--instance` failure message.
- `docs/rc/install-ux/BEGINNER_QUICK_START.md` — working command +
  claim-link handoff description.
- `tests/rc3-06/` — the rehearsal harness (`lib.mjs`,
  `complete-setup.mjs`, `interrupt-resume.mjs`,
  `interrupt-serverkill.mjs`, `cancel-passkey.mjs`,
  `keyboard-recovery.mjs`, `keyboard-security.mjs`, `leg3-probe.mjs`).
- This RESULT.

## Gauntlet (final tree, in the brief's order)

| Stage                                | Result                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Migrations fresh (`db:migrate`)      | exit 0 (156 migrations)                                                                                                                    |
| Seed (`db:seed`, fixture flag)       | exit 0                                                                                                                                     |
| `format:check` (repo-wide)           | exit 0 — "All matched files use Prettier code style!"                                                                                      |
| Lint (`eslint . --max-warnings=0`)   | exit 0                                                                                                                                     |
| Typecheck                            | exit 0                                                                                                                                     |
| Unit suite (`vitest run tests/unit`) | exit 0 — 344 files / 2,796 tests (baseline 343 / 2,792 + 4 new)                                                                            |
| Focused integration                  | exit 0 — 6 files / 31 tests: installation, installation-resume, setup-draft, setup-first-run, discoverability-acceptance, uxi13-wrong-site |
| Production build                     | exit 0 twice (unmodified tree, then fixed tree)                                                                                            |
| Smoke (`test:smoke`)                 | exit 0 — "Next.js public/admin routes and Payload PostgreSQL persistence are operational."                                                 |

`format:check` and smoke were run last, on the final tree; this table
was updated with their outcomes and formatting re-verified afterwards.

**Named NOT RUN:** the Compose/Docker stages of `install.sh` and of
the operational scripts (no daemon in this sandbox — stubbed transport,
named at each leg); the repo's Playwright spec suite (`test:browser`)
— RC3-03 recorded a pre-existing harness failure there, and this pass
drove the same browser engine through its own scripts instead;
`npm run verify:release` (the clean-clone verifier CI runs) — the
local gauntlet above stands in its place for this rehearsal.

**Ledger rows served:** #76 Guided installation (primary), #11
Starter-site generator (the fresh-install starter journey), #87
Accessibility infrastructure (supporting evidence only — RC3-03 owns
the row). No level changes are claimed by this rehearsal alone.
