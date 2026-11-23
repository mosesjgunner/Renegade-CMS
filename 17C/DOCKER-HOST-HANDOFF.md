# 17C Docker-host continuation — 2026-11-02

Status: NOT READY. This is a new Docker packaging blocker; the earlier host-launch and transport blockers were worked around. Harbor owns any RESULT/ledger update. Those files are unchanged.

Candidate: rc1-17c, 92954d7b3fad85b50528b0eb596e6c4ef7152d5d. `git diff --exit-code` exits 0. No product code, Dockerfile, .dockerignore, harness or Compose changes.

## Executed command and final failure

Command: `C:\Program Files\Git\bin\bash.exe tests/rc1-17c/run.sh build`
Process environment: NODE_OPTIONS preloads the retained windows-transport.cjs (removes only unavailable VM proxy settings from Docker commands); BUILDX_BUILDER=rc117c-bounded-20261102. Resource setup and previous failures are recorded separately.

Phase exit: 1. Docker build subprocess exit: 1. Full output: docker-host-build-swap.log.
BuildKit build ID: pm5iejah5vpq03b47rklb3c0q; duration 5m29s.

The actual production build passed: compile in 108s, TypeScript in 2.1min, 149 static pages generated, builder stage completed in 273s. The runner target then failed at Dockerfile:65, runner step 18/18:

```text
RUN node docker/install-runtime-esbuild.mjs && rm /tmp/runtime-esbuild
Error: ENOENT: no such file or directory, copyfile '/tmp/runtime-esbuild' -> '/app/standalone/node_modules/esbuild/bin/esbuild'
    at copyFileSync (node:fs:3210:11)
    at visit (file:///app/docker/install-runtime-esbuild.mjs:21:7)
    at visit (file:///app/docker/install-runtime-esbuild.mjs:14:30)
    at file:///app/docker/install-runtime-esbuild.mjs:28:1
Node.js v24.22.2
```

The installer verifies /tmp/runtime-esbuild by executing it before copying, then traverses production and traced standalone esbuild packages. Its copy at line 21 assumes the standalone destination is usable. The observed failure is in this product packaging step. It is not the conditional docs secret-sweep finding: inspection was never reached, so the authorized .dockerignore change was not triggered. No packaging workaround or assertion weakening was applied.

## Acceptance boundaries

- Runner image build: FAILED at final packaging step.
- Media-heavy build: NOT REACHED.
- inspect / stack-a / restart-a / stack-b / down: NOT RUN (no acceptance containers were created).
- Shipped Compose orchestration / health / upload / job / restart proof: NOT RUN. Only scratch setup was prepared; no Compose acceptance claim.
- Final runner image digest: UNAVAILABLE; the image did not finish building. Base-image digests in logs are not a final application image digest.
- Windows source containment: all 1,624 original manifest paths checked; 1,338 raw differences are exclusively CRLF line endings, zero differences beyond CRLF. Full current byte hashes retained in windows-source-containment.json. No original manifest was overwritten.

## Cleanup

- Dedicated builder stopped, cache retained under rc117c-bounded-20261102 for a later authorized retry.
- Temporary swap disabled successfully; /proc/swaps returned to its original /dev/sdc entry. Dedicated volume rc117c-swap-20261102 removed.
- Dedicated PostgreSQL container rc117c-hostpg-20261102 and its anonymous data volume removed; no acceptance database had been created by the harness.
- Nine previously running containers lacking restart policies were explicitly restarted after Docker Desktop recovery; other original running containers restarted through their policies. No pre-existing container or volume was removed.
- Docker info reports Engine 29.8.0 after cleanup.
- Only evidence files were added to the checkout. Original RESULT, NEXT, source-tree manifest and ledger remain unchanged.
