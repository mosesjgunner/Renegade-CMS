# Next subpass after 17B — cold pickup notes

Written at the end of the 17B run for whoever executes **17C**
(production image, workers and service isolation). Self-contained:
read this, then the 17C prompt in
`~/workspace/user/files/renegade-cms-18-final-rc1-passes-split.md`.

## Tree identity

- Start from branch `rc1-17b`: base `a09e581` (17A) + `3c62caf`
  (preliminary typecheck repair) + `b2771ac` (dependency upgrades,
  Discord + CGNAT fixes) + `0647fba` (17B harness/units) + `a3c1655`
  (Mastodon boundary fix) + the 17B evidence commit. Create branch
  `rc1-17c` from that head.
- Source containment at the 17B head: 1,613 files, SHA-256
  `a99a77fef638fe663e187c96707e9f32667a047cfed2abf3a65e359b15dc836b`
  (`docs/rc/evidence/rc1/18-pass/17B/source-tree.json`; re-freeze
  with `node --import tsx tests/rc1-17b/provenance.ts` after
  reverting `next-env.d.ts`/`tsconfig.json` dev-boot churn).
- 17B verdict: **PASS (bounded)** — two egress fixes, CGNAT boundary
  fix, three dependency lines upgraded; evidence in
  `docs/rc/evidence/rc1/18-pass/17B/` (`RESULT.md`, `advisories.json`,
  `audit-attempt.json`, this file).

## 17C's Docker dimension — read this first (explicit flag)

17C owns the **production image, workers and service isolation**.
**This VM has NO Docker** (`docker` not installed; no trivy, grype
or osv-scanner binaries either), and it never has had during the RC1
passes. Consequences, stated plainly:

- The **production image build and image advisory scan cannot run
  on this VM**. 17B's dependency refresh was source/lockfile-level
  (OSV over the npm lockfile); the image layer was only inventoried
  (Dockerfile pins: `node:24-alpine` ×4 stages, `golang:1.27.2-alpine`
  esbuild stage whose Dockerfile header carries an advisory
  disposition for building esbuild from patched Go sources).
- Options for 17C, in the order the evidence so far suggests:
  (1) run the image proof on a Docker-capable host — the user's
  Windows machine has Docker (noted in 17A planning; Codex's
  remaining budget was conserved for exactly this if needed);
  (2) install Docker on this VM only if the parent explicitly
  approves it — nested-virtualization support is **unverified** here,
  so do not promise it works; (3) if neither is available, 17C must
  land as a bounded/static result or NOT READY on the image-build
  item rather than claiming image proof it does not have.
- What CAN be proven on this VM without Docker: Dockerfile/compose
  static review, worker entrypoints and job-queue behavior under the
  dev harness (17B's harness already runs jobs in-process via
  `payload.jobs.run`), service-isolation code paths, fresh
  migrations, the production `npm run build` output (already green
  on Next 16.4.1), and the retained `verify:release` checklist items
  that do not need containers.

## Environment facts (verified in the 17B run; recheck — VMs get replaced)

- Node v24.22.1, npm 10.9.4. PostgreSQL **16.15 (Ubuntu
  16.15-0ubuntu0.24.04.1)** local at 127.0.0.1:5432,
  postgres/postgres (CI uses PG 17.6 — record it verbatim again).
  The cluster was online at 17B start; if the VM was replaced,
  reinstall per the 17A NEXT recipe before anything else.
- `npm audit` is **blocked from this VM** (registry audit endpoint:
  403 `policy_denied`, npm exit 1). Use the OSV querybatch route
  (script shape in the 17B scratch notes; dispositions in
  `docs/rc/evidence/rc1/18-pass/17B/advisories.json`). The npm
  *registry itself* (installs) works fine.
- ~7 GB RAM. Full unit suite ≈6–9 min; full journey ≈5–7 min;
  production build ≈15 min. Run suites once, output to a file, then
  inspect the file (never re-run to peek — AGENTS.md's ingest/score
  lesson generalizes).

## Closed items (do not redo)

- **Full-project typecheck is clean** (17A's carried item #1):
  preliminary repair `3c62caf` routed the two 16C portability casts
  through `unknown`. Portability suites 19/19. 16C's "clean" claim
  is now true of the full config.
- **Discord delete raw-fetch** (16C/17A carried item): fixed in
  `b2771ac`, proven in journey + units.
- Next.js is on **16.4.1** (exact pin); undici **7.30.1**;
  nodemailer **10.1.4**. Remaining advisories are dispositioned in
  `advisories.json` — do not re-litigate without new evidence.

## Harness mechanics for 17C (17B lessons, paid for)

- Copy the harness shape from `tests/rc1-17b/` (provenance.ts,
  tsconfig, run.sh). **Persist harness state with `await save()`
  before the fresh phase ends** — the restart phase reads state from
  disk; 17B lost a full run to a missing save (in-memory mutations
  are invisible after restart).
- Between journey re-runs, **drop/recreate the disposable DB and
  re-migrate** — fixture slugs are unique and re-runs collide.
- Production-posture trick: a second web process with `VITEST`
  scrubbed from env exercises real production gates
  (`isWebhookTestEnv` is the only `VITEST` consumer in `src/`).
- The file-write layer in this environment **redacted literal secret
  strings** in harness files once (replaced canary values with a
  placeholder). Verify harness secrets by length/hash, never by
  printing; build secret literals from fragments if a write looks
  mangled.
- Payload REST `findByID` returns the doc directly (no `doc`
  wrapper). Webhook delivery rows use field `state`; reconciliation
  counts live at `counts.{delivered,...}`.
- AI connection creation needs `AI_CREDENTIAL_KEY_BASE64URL` in env
  or the credential cipher throws and the API returns 400.

## Carried open items (unchanged ownership)

1. **15C record gap**: still no ledger row and no RESULT.md; its
   evidence artifacts (clean-room run on the user's Windows box:
   130 migrations, 31 unit tests, lint/format/typecheck exit 0)
   remain the only record. Clerical repair before Pass 18A.
2. **CI run #174** failed on `a7edf2d` (`verify:release` vs PG 17.6);
   the failing step is still unidentified. Note: 17B's Next 16.4.1
   upgrade lands in that pipeline too; `verify:release` remains
   Pass 18 scope — do not claim it from 17B/17C evidence.
3. Older **NOT READY** ledger rows 05C, 09D ("tag blocker FIXED"),
   14A — context only.
4. **License mismatch** (LICENSE GPL-3.0 vs README/package.json
   AGPL-3.0) — the user's call; do not reopen unprompted.
5. **Pass 18 independence**: Pass 18 was designed as independent
   acceptance; with Harbor having built 16+17, its sign-off cannot
   claim the same independence. Parent/user resolve before final
   acceptance (options recorded in memory: conserved Codex budget as
   18 sign-off, or Harbor's 18 labeled builder-run).
6. Advisory follow-ups if time allows (not blockers): dompurify
   3.4.17 patch exists (monaco-bundled copy only); fast-uri 3.1.9
   patch exists behind payload's bundled ajv (needs an override
   decision, not a blind bump); happy-dom fixes partially require
   the 21.x major.

## Social egress audit notes (17B, for the record)

- Discord + Mastodon operator-URL paths now route through
  `socialFetch` (fixed in 17B). Mastodon publish/media and Bluesky
  validate every endpoint with `validateOutboundUrl` first;
  Telegram validates its fixed `api.telegram.org` base; the other
  adapters (facebook/instagram/threads/x/linkedin/pinterest) build
  endpoints from fixed provider hosts. LinkedIn's media upload PUTs
  to a URL returned by LinkedIn's own API (provider-trust flow,
  standard for that API) — observed, not changed.
- `safeFetch` = DNS preflight + connect-time lookup pinning
  (anti-rebinding), same-origin-only redirects, bounded reads.
  Webhook targets are double-gated: creation-time `supportedTarget`
  policy + egress-time `assertSafeOutboundUrl` inside the delivery
  path.
