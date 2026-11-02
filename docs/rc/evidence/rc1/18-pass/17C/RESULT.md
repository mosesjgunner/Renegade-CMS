# RC1 SUBPASS 17C — RESULT

**STATUS: NOT READY** (2026-11-02) — production image, workers and
service isolation.

**First reproducible blocker:** the production image cannot be built
in this sandbox, so the mandatory image acceptance (image digest,
packaged-file proof, non-root container restart) is unexecuted. Base
images cannot be pulled: every Go TLS client (daemon pull, CLI
manifest, BuildKit metadata) stalls with
`Get "https://registry-1.docker.io/v2/": net/http: TLS handshake
timeout` through the sandbox egress proxy while OpenSSL clients
succeed; a standard daemon additionally cannot start (no
CAP_NET_ADMIN for bridge NAT) and rootless mode cannot reassociate
namespaces. The full investigation — exact commands, three daemon
modes, GODEBUG attempts, and the mid-run VM replacement that wiped
the install — is recorded in `docker-investigation.md`. The complete
Docker-host reproduction is in NEXT.md; the committed harness under
`tests/rc1-17c/` runs it end-to-end there.

Everything in 17C that does not require the image was executed for
real against the exact production artifact and service commands, and
passed (below). No product-code defect was found in scope; no product
code was changed by this subpass beyond the preliminary repair.

## Preliminary repair (separate commit `905c53a`, not 17C scope)

17B's new `tests/unit/rc1-17b-security.test.ts` re-broke full-project
typecheck with 4 TS2540 errors (direct `process.env.NODE_ENV`
assignments at lines 94/99/240/246). Routed through an
`env = process.env as Record<string, string | undefined>` alias (the
repo-consistent pattern from
`dist-01-security-and-contracts.test.ts`), no assertion weakened.
Proof: full-project `npx tsc --noEmit` exits 0; the rc1-17b security
suite still passes 16/16.

## What was validated (local production-equivalent run)

Candidate tree: branch `rc1-17c`, HEAD
`43e9e77047086b8143f43703dd8d166b1a675013` (harness commit on
preliminary repair `905c53a` on 17B PASS `cb99a20`). Containment:
1,624 files, source-tree SHA-256 (treeHash)
`69a80793243768214a9240a59fb69a3d838054add0bd9f4f4fabcc3529772755`
(`source-tree.json`).

- **Production build succeeds.** `BUILD_SHA=<HEAD> APP_VERSION=0.1.0
npm run build` (Next 16.4.1, the exact command the Dockerfile
  builder stage runs) exits 0. Embedded provenance verified locally:
  root and standalone `build-provenance.json` agree, `sourceSha` =
  candidate HEAD, `clean: true`, `lockfileSha256` matches the shipped
  `package-lock.json` (`provenance-check.txt`). Wall time ~17 min on
  this 4-core/7GB VM.
- **Runtime proof, 21/21 checks** (`local-journey-trace.json`,
  `local-restart-trace.json`, `local-stack-b-trace.json`) using the
  exact service commands the image runs — `npm run db:migrate`,
  `node .next/standalone/server.js` (standalone tree assembled as the
  Dockerfile runner stage does), `npm run jobs:worker` — as separate
  processes against disposable PostgreSQL 16.15 database
  `rc117c_release_acceptance`:
  - Floor stack (Standard profile, no optional modules): migrations
    exit 0; web ready over HTTP; floor collections present
    (sites/users/media-assets/payload-jobs) with
    commerce/newsletter collections absent; anonymous media upload
    refused; site-Alpha staff upload into site Beta 403; owner upload
    201 with byte-identical served media (sha256 recorded); the
    separate worker process drained a durable
    `operations-heartbeat` job to completion; `npm run db:status`
    operational CLI exit 0; `docker/worker-healthcheck.mjs` passes
    against the live heartbeat file.
  - Restart: a job queued 75s before a full web+worker restart
    completed afterwards (queue state not lost); the pre-restart
    owner session still authenticated; persistent media bytes
    unchanged; runtime configuration identical (floor registration
    byte-identical collection list).
  - Module stack (Lean profile, `RENEGADE_MODULES=commerce,newsletter`):
    products and subscribers registered; community's forum-sections
    absent; adding a `WORKER_PROFILE=media-heavy` worker process did
    not change web feature registration.
- **Focused units:** the five production-image/compose/module suites
  pass 25/25 (`production-module-config`, `operational-compose`,
  `operational-image-provenance`, `module-registry`,
  `operational-backup`).
- **Full unit suite:** 2040 passed / 5 failed — exactly the
  pre-existing baseline set at `cb99a20` (`flow-04-acceptance`,
  `payload-domains`, `rc1-04d-campaign-commerce`,
  `shop-08-command-center-boundaries` ×2). Zero regressions.
  (One earlier run of bare `npx vitest run` swept in
  integration/browser spec trees outside the `npm test` scope and is
  not comparable; the recorded figure is `npm test` =
  `vitest run tests/unit`, the baseline command.)
- **Secret sweep of the curated shipped-source set** (src, docker,
  package.json, next.config.ts, tsconfig.json, theme-packages — the
  non-standalone files the runner image copies): no secret-pattern
  hits, no packaged `.env`.

## Finding: standalone tracing pulls repository material into the artifact

The local build's `.next/standalone` output contains traced copies of
`docs/rc/evidence/**` harness records (including TLS-generation
harness text that trips secret-pattern matching on code, not live
keys) and, locally, `scratch/rc02-tls/key.pem` (an old disposable
test key). The Docker context excludes `scratch/`, so the in-image
set will differ; `docs/` is **not** excluded from the Docker context,
so the Docker-built standalone is expected to carry the docs material
too. Whether the shipped image is clean on this axis is decided by
the inspector run on the Docker host (`inspect-image.mjs` sweeps the
whole packaged `/app`). Candidate one-line mitigation for the Docker
host to validate: add `docs` to `.dockerignore` if the build proves
not to need it (context was 776MB, mostly docs), or add
`outputFileTracingExcludes` for docs/scratch/tests. Not changed here:
the artifact under proof must stay the tree as shipped.

## Bounded / unexecuted (named honestly)

- **Production image build, digest, packaged-file inspection,
  non-root container execution, and container restart: UNEXECUTED**
  (blocker above). The committed harness performs all of it on a
  Docker-capable host (NEXT.md has the exact steps).
- **Compose orchestration: UNEXECUTED.** Bridge networking is
  impossible in this sandbox (no CAP_NET_ADMIN), so
  `compose.production.yaml` service wiring, compose healthchecks and
  service-name DNS are unproven; the health endpoints and scripts
  themselves were exercised locally. Isolated-project behavior was
  proven at process level (two stacks, distinct ports/profiles,
  shared disposable database) instead.
- **Media-heavy image (ffmpeg): UNEXECUTED.** Only the
  `WORKER_PROFILE=media-heavy` worker boot and heartbeat were proven
  locally; ffmpeg exists only in the image target.
- Fixture passkey sessions (15E–17B convention) — no genuine passkey
  ceremony claimed. PostgreSQL 16.15 locally; CI/Compose use 17.6 —
  not exercised. `verify:release` remains Pass 18 scope.
- The Docker installation performed during the investigation was
  wiped by a mid-run VM replacement and is not durable; the repo,
  commits and this evidence were unaffected.
