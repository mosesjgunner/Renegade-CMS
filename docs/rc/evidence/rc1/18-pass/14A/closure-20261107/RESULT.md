# RC1 14A closure — PASS

2026-11-07 (America/Chicago). Scope: execute the six mandatory runtime
groups left unexecuted by the original 14A run (see `../RESULT.md`,
NOT READY 2026-11-01) against the current tree. No product code changed:
no genuine defect was reproduced by a failing case. Aggregate RC1 status
is decided outside this closure.

## Verdict

**14A closure: PASS.** All six mandatory runtime groups were executed end
to end through the product's own UI/API paths with persisted state
observed in the database and in a real headless browser: 24 harness
checks passed / 0 failed / 0 skipped (phase 1: 15, phase 2: 9), plus the
43 focused AI unit cases still pass (5 files, exit 0).

## Tested tree and environment

- Tree: branch `rc1-closures`, HEAD `80414cff9f88d80436c37d81c67acf5d13333fa6`
  before this closure's own harness/evidence commit. The only files this
  closure adds are `tests/rc1-14a/closure-journey.ts` and this evidence
  directory.
- PostgreSQL 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1) on x86_64-pc-linux-gnu —
  recorded verbatim; the original 14A run used a PostgreSQL 17 container.
  Disposable database `rc114a_release_acceptance` created for this closure;
  all 132 migrations applied, exit 0. Admin was performed only via
  `sudo -u postgres psql`.
- Web: the app from this tree under `next dev --webpack` on
  127.0.0.1:39047, exactly as the original 14A harness specified, with a
  dedicated `RENEGADE_NEXT_DIST_DIR=.next-rc114a-closure` so the shipped
  `.next` production build is untouched. Substitution, stated plainly:
  the production server (`next start`) was tried first and refuses this
  loopback HTTP topology by design — `src/modules/core/config.ts`
  requires an https, non-loopback `APP_URL`, an explicit `PROXY_MODE` and
  an absolute `MEDIA_DIR` in production, and `LOCAL_E2E_TEST_MODE` must
  stay `false` (it was kept `false`; test routes disabled). Production
  build/image behavior for this tree is covered by the packaged 17C/18C
  proofs; this closure proves the runtime journey — persistence,
  encryption, HTTP negatives, restart — at the API/UI level. The
  historical `/admin/ai` compile failure does not reproduce here: the
  page compiled and rendered in the dev server and the production build
  is green on this tree (parent-verified).
- Browser: real headless Chromium via Playwright (repo devDependency) —
  no API-for-browser substitution was needed. Sessions are
  canonical-service fixture sessions created by `createPasskeySession`
  (the harness pattern from the original run), not passkey ceremonies.
- Provider: a local stand-in on 127.0.0.1:39048 implementing the Ollama
  contract (`GET /api/tags`, non-streaming `POST /api/generate`,
  optional Bearer auth, `format: 'json'` honored). It is a loopback
  Ollama HTTP protocol harness — NOT an Ollama engine, proves no real
  model inference, and is labeled as such in both trace JSONs. It
  rejects a wrong bearer with 401 (echoing the credential in its own
  error body, which is what makes the product-side redaction assertions
  meaningful), returns 503 in outage mode, and returns plain text for
  JSON-mode requests in text-only mode.

## Group-by-group proof

### Group 1 — Owner configuration, advertised models, probes, persisted success
Phase 1 checks 1–4 and 6 (`closure-journey.json`):
owner UI shows the safe no-provider state; UI "Discover models" returns
the advertised `14a-model` with nothing persisted and no capabilities
invented (connections list still empty); "Save and test connection"
persists an `active` connection whose models include `14a-model` and
whose capabilities are exactly `ai.text.rewrite` + `ai.text.structured`
after the selected-model text and JSON-object probes (provider call
count exactly 4: 1 discovery + discovery/text/JSON on save); the
database row matches the UI; the form clears the API key after saving.

### Group 2 — Rejected credentials, degraded status, outage, recovery, redaction
Phase 1 checks 7, 13, 14, 15: saving with a wrong key persists a
`degraded` connection with no capability claims and the exact redacted
`lastError` ("Connection test failed. Check endpoint, credentials,
model, and provider health.") after exactly one upstream 401; a
text-only provider retest keeps only `ai.text.rewrite` (no invented
structured compatibility); in outage mode a retest clears capabilities
and persists the degraded state with the same redacted error; after the
provider recovers, a retest restores both probed capabilities.
Redaction is asserted on **every** admin API response the harness
receives (the `api()` helper fails if the secret appears in any body),
and the persisted `lastError` never contains the credential even though
the stand-in's 401 body echoes it.

### Group 3 — Wrong-site/foreign-object, staff/anonymous, CSRF, native-collection negatives
Phase 1 checks 8–12, all real HTTP requests against the running server:
owner GET on the foreign site, administrator POST on the foreign site,
owner PATCH against a mismatched site, staff POST, and an owner PATCH
trying to disconnect the other site's connection all return 403;
anonymous GET returns 403; the provider call counter proves every denial
happened **before** any provider I/O. The foreign connection's credential
and `active` status are verified unchanged afterward. A cross-origin
PATCH (`Origin: https://foreign.example`) returns 403 and the saved
connection remains `active`. Native Payload collection GETs for
`ai-credentials` and `ai-connections` with the owner cookie expose
neither the secret nor the saved connection id.

### Group 4 — Saved encrypted secret, server decryption, denied native reads
Phase 1 check 5 plus direct SQL inspection: exactly one credential row
exists for the saved connection; the stored envelope is AES-256-GCM
(`{"iv": …, "tag": …, "keyId": "v1", "version": 1, "algorithm":
"aes-256-gcm", "ciphertext": …}`); a SQL `LIKE` search for the plaintext
secret across all `ai_credentials` rows returns 0; the server-side
`connectionCredential()` decryption returns the exact secret. Denied
native secret reads are group 3 checks 11–12 above.

### Group 5 — Real PostgreSQL/web/browser restart, saved status in UI, retest with persisted credential
Phase 2 checks 1–5 (`closure-restart.json`). Between phases the web
server and browser were stopped, PostgreSQL was restarted for real
(`systemctl restart postgresql`; postmaster start time moved
2026-11-07 23:26:11 UTC → 2026-11-08 00:08:09 UTC), and the harness
itself asserts the postmaster start time changed before proceeding. A
fresh browser then shows the persisted `active` connection with its
model and `ai.text.structured` capability in the Connection health UI;
the degraded rejected-credentials record and its redacted error survive;
the encrypted secret still decrypts server-side; and an ordinary UI
"Test connection" click succeeds using only the persisted credential
(provider call count exactly 3: discovery + text probe + JSON probe).

### Group 6 — Disable/disconnect, transactional credential removal, blocked post-disconnect I/O
Phase 2 checks 6–9: UI "Disable" persists `disabled` while retaining the
encrypted credential (reconnect key); UI "Disconnect and remove
credentials" leaves the connection `disconnected` with models and
capabilities cleared and the credential row deleted in the same flow;
a subsequent retest attempt is rejected with HTTP 400 and the provider
call counter proves zero post-disconnect provider I/O; after a page
reload the UI still observes the durable disconnected state
("Credentials removed." / `disconnected` in Connection health).

## Commands and exits

| Command | Exit / outcome |
| --- | --- |
| `sudo -u postgres psql -c "CREATE DATABASE rc114a_release_acceptance OWNER renegade;"` (+ drop of the two aborted attempts' copies) | 0 |
| `python3 ~/workspace/with-env.py <closure env> npm run db:migrate` | 0; 132 migrations applied |
| `node --import tsx tests/rc1-14a/closure-journey.ts` (phase 1, via with-env) | 0; 15 passed / 0 failed / 0 skipped (`closure-journey.json`, `journey.png`, `web.log`) |
| `sudo systemctl restart postgresql` | 0; postmaster start time changed (asserted in phase 2) |
| `node --import tsx tests/rc1-14a/closure-journey.ts restart` (phase 2) | 0; 9 passed / 0 failed / 0 skipped (`closure-restart.json`, `restart.png`, `restart-web.log`) |
| `npx vitest run tests/unit/ai-adapters.test.ts tests/unit/ai-gateway.test.ts tests/unit/ai-workflows.test.ts tests/unit/connection-runtime.test.ts tests/unit/external-boundary-security.test.ts` | 0; 5 files, 43 passed |
| `npx eslint tests/rc1-14a/closure-journey.ts` / `npx prettier --check` (after `--write`) | 0 |

## Attempt history (kept, not hidden)

1. First attempt used `next start` (production): the server refused the
   loopback HTTP configuration (see substitution note above) and the
   readiness probe timed out. No checks ran. Database reset afterward.
2. Second attempt (dev server) failed at the discovery step: under the
   browser's concurrent first-hit route compilation, the passkey
   strategy's first user lookup threw (`TypeError: Cannot read
   properties of undefined (reading 'id')` at
   `passkey-auth.ts:32`) and admin API calls returned 403 until the
   server warmed. Reproduced in isolation afterward: the same session
   mechanism, grant resolution and connections GET all succeed against
   a standalone dev server, including on first compiled requests made
   sequentially. The harness was therefore given an authenticated
   warm-up (poll the real owner connections GET until 200, before the
   browser starts) — no assertion was weakened or removed, and phases 1
   and 2 then passed completely on the next runs. The anomaly is
   recorded as a dev-server cold-start/compilation artifact; it was not
   reproduced against the warmed server or sequentially, and no product
   fix was made for it.
3. Generated-file churn from the dev server (`next-env.d.ts`,
   `tsconfig.json`, `src/app/(payload)/admin/importMap.js` — dist-dir
   reference changes only) was restored to HEAD; the closure commit
   contains no product or generated-file diffs.

## Containment and cleanup

All work ran against the disposable `rc114a_release_acceptance`
database and loopback ports 39047/39048 created for this closure.
Fixture sites/users/grants and the post-journey database state are
retained in that disposable database for inspection. All servers,
browsers and provider processes started by the harness were stopped
(verified: no `next-server`, Chromium or harness processes remain).
No external provider, remote sandbox, real Ollama engine, live charge,
external post or unsolicited message occurred. The ledger, final RC
report and banners were not touched by this closure.
