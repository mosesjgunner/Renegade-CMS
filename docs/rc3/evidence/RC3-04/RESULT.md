# RC3-04 (packaging core) — RESULT

**Scope of this run:** the lane-08 packaging fix only — cut the repository
documentation out of the shipped standalone artifact. The rest of RC3-04
(resource envelope, Docker measure, runtime caps, latency) is named
remaining work at the bottom, not claimed here.

**Baseline:** branch `rc3-04` from `2d4cb3ddf70db5b5f9570297e6bae0d7ff8774bf`
(the `rc2` tag / current main at pass start; fresh fetch confirmed the SHA
before the worktree was created). Tree clean at creation.

**Environment:** Node v24.22.1, npm 10.9.4, PostgreSQL 16 (local cluster),
acceptance DB `rc304_release_acceptance`. Builds used the one recipe that
has completed a build of this tree on this rig:
`RAYON_NUM_THREADS=4`, `NODE_OPTIONS=--max-old-space-size=4096`, launched
detached with an exit file, one build at a time.

## Baseline measurement (unmodified tree, build exit 0)

| Measure                  | Bytes         | MB (10⁶) | MiB (2²⁰) |
| ------------------------ | ------------- | -------- | --------- |
| `.next/standalone` total | 1,117,797,606 | 1,117.8  | 1,066.0   |
| `docs/` inside it        | 826,230,127   | 826.2    | 788.0     |
| `docs/` file count       | 4,051 files   |          |           |
| `tests/` inside it       | 8,681,518     | 8.7      | 8.3       |
| `fixtures/` inside it    | 194,966       | 0.2      | 0.2       |

The docs figure matches Sol's audit measurement exactly (826,230,127
bytes); the total differs slightly from the audit's 1,108,092,457
(build-to-build variance in copied trees). The mechanism is the one
RC3-00 confirmed: `src/proxy.ts` middleware dynamically imports the
Payload config, the standalone tracer spans the whole repository, and
the `outputFileTracingExcludes` entry in `next.config.ts` does not stop
`docs/` landing in the artifact.

## The change

`scripts/build.mjs` (+13/−1): after `next build` and the existing
standalone copies (theme-packages, static, public, provenance), prune the
non-runtime trees from `.next/standalone` at packaging time:

- `docs/`, `tests/`, `fixtures/` are removed with `rmSync`.
- Verified before pruning: no runtime code in `src/` reads those trees
  (literal path sweep, zero hits outside tests). Theme discovery
  (`src/modules/presentation/packages.ts`) reads `theme-packages/` from
  the process working directory — that tree is copied into the artifact
  by the same script and is **not** pruned.
- `src/` inside the standalone (16,407,355 bytes: migrations, modules,
  app sources the server bundle traces) was inspected and deliberately
  kept — Payload loads migrations from it at runtime.
- The Dockerfile's builder stage runs `npm run build`, so the pruned
  standalone is also what the Docker image copies. The image's own
  additional `src/`/`scripts/` copies are its separate composition;
  measuring the image is remaining work below.

## After measurement (fixed tree, build exit 0)

| Measure                  | Bytes       | MB (10⁶) | MiB (2²⁰) |
| ------------------------ | ----------- | -------- | --------- |
| `.next/standalone` total | 283,873,971 | 283.9    | 270.7     |
| `docs/`                  | absent      | 0        | 0         |
| `tests/`                 | absent      | 0        | 0         |
| `fixtures/`              | absent      | 0        | 0         |

**Removed: 833,923,635 bytes — the shipped artifact is 74.6% smaller.**
Zero repository docs/evidence trees in the deployed artifact, as RC3-04
requires.

Build history, stated plainly: the baseline build completed on the first
attempt. The fixed tree's build died silently at "Creating an optimized
production build …" three times under concurrent rig load (another
pass's suites were running; no VM replacement — uptime was continuous;
the edit cannot affect the compile phase, which runs before the changed
code). The fourth attempt, on a quiet rig, completed with exit 0
(compile 3.5 min). All after-numbers come from that completed build's
exit file and `.next/standalone/server.js`, not from a partial output.

## Artifact proof (pruned artifact, no source tree)

The standalone was copied byte-identical (283,873,971 bytes) to an
isolated directory outside the checkout and booted there with
`node server.js` against a freshly migrated + seeded acceptance DB
(fresh-migration acceptance and fixture seed both exit 0).

Boot configuration note: production-mode config validation intentionally
rejects this sandbox's dev credentials and loopback APP_URL (fail-closed
by design), so the artifact was booted in the repo's own local smoke
configuration (`LOCAL_E2E_TEST_MODE=true`, `PROXY_MODE=direct`, absolute
`MEDIA_DIR` inside the artifact copy) — the same mode family the
project's smoke and browser harnesses use.

- `GET /health/live` → `{"status":"live"}`
- `GET /health/ready` → `{"status":"ready","checks":{"database":"ok","migrations":"applied"}}`
- `GET /` → 200, renders the seeded "Demo Publication" content
- `GET /admin` → 200
- `GET /_next/static/…/_buildManifest.js` → 200; a static font
  (`_next/static/media/*.woff2`) → 200 `font/woff2`
- `GET /api/admin/themes` unauthenticated → 403 (route mounted, auth
  enforced). Theme roots are present in the artifact
  (`theme-packages/` with `neutral-starter-1.0.0`,
  `neutral-starter-1.1.0`, `renegade-party-1.0.0`, each with its
  `theme.json`) and discovery reads exactly that directory from the
  server's working directory. **Partial:** an authenticated discovery
  response was not exercised — staff auth is passkey-only and not
  scriptable in this pass.
- Media: `GET /api/media/<seeded id>` → 403 (auth-gated API);
  `GET /media/<seeded id>` → 404 from the route's own policy stack —
  the seeded asset carries a `published-use` delivery policy, so the
  route executes its full policy check against the DB and declines.
  No 500s and no missing-module failures anywhere. A positive
  byte-serving response for that fixture asset is blocked by the
  asset's own policy, not by the artifact; built static media serves
  (above).
- Jobs/worker: `npm run jobs:worker` from the tree (the worker's
  deployment layout — the Dockerfile ships it from `src/` + `scripts/`,
  not from the web standalone) started against the same DB, polled the
  queue ("Running 1 jobs"), and shut down cleanly on SIGTERM.

## Suites on the final tree

- `npm run format:check` (repo-wide, as CI runs it) — **pass** (exit 0)
- `npm run lint` — **pass** (exit 0)
- `npm run typecheck` — **pass** (exit 0)
- `npm run test` (unit) — **pass**: 343 files, 2,792 tests, 0 failed
- Integration suite — **not run.** The change is packaging-only
  (post-build file removal in `scripts/build.mjs`); no runtime code
  path changed, and the runtime surface was exercised directly by the
  artifact boot + smoke above against a migrated, seeded DB. GitHub CI
  remains the arbiter for the full gauntlet on this branch.

## Remaining RC3-04 work (not covered by this run)

- Docker production image byte measure (the prune covers its
  standalone; the image's own extra copies are unmeasured).
- Runtime envelope: idle/loaded web + worker + Postgres RSS, build
  peak RSS, per-workload latency, explicit 1 GB and 2 GB runtime caps
  with consistent traffic.
- Pinned source-install FFmpeg vs media-heavy Docker worker against
  the same fixture; ordinary web profile keeping optional media work
  off it.
- Decide whether an artifact regression gate (docs-bytes budget in
  release verification) is worth adding — the prune makes the artifact
  correct by construction, but nothing yet fails a future build that
  reintroduces a non-runtime tree under a new name.
