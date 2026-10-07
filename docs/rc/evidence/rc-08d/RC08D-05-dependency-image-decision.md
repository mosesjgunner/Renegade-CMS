# RC08D-05: Dependency Graph & Production Docker Image Decision Gate Receipt

- Gate: `RC08D-05` (`RC08C-DEPS`)
- Status: **PASS**
- Base SHA: `d3a37e1d150cdf273b63afa8dc14b3d14296987a`
- Scope: Compatible dependency graph resolution (`npm ls --all` clean exit 0), systematic adjudication of all unique security advisories, and production Docker image composition hardening.
- Target Artifacts: `package.json`, `package-lock.json`, `Dockerfile`, `.dockerignore`, `docs/rc/evidence/rc-08d/RC08D-05-dependency-image-decision.json`.

## Graph Resolution & Peer Cleanliness

- `npm ls --all` reported `ELSPROBLEMS` in baseline due to YAML and debug mismatches.
- Resolved by explicitly pinning `yaml@^2.9.1` in `devDependencies` (satisfying Vite's peer requirements and fixing the YAML stack-overflow vulnerability), and pinning `debug@^4.4.3` in `overrides`.
- Verified command: `npm ls --all` exits 0 cleanly with zero errors across all dependencies.

## Advisory Adjudication & Reachability Analysis

- Audit Baseline: 24 affected package entries (3 critical, 9 high, 12 moderate).
- Audit Final: 16 affected package entries (0 critical, 9 high, 7 moderate).
- Production Container Audit: 10 affected package entries (0 critical, 5 high, 5 moderate).
- **Critical & High Advisories Resolved / Adjudicated**:
  - `GHSA-vc4h-q48j-5hcx` (Payload API key disclosure, critical): **FIXED** via Payload 3.90.2 upgrade.
  - `GHSA-5gmw-xhrv-c9v3` (Tinypool prototype pollution in worker options, critical): **FIXED** via `tinypool@2.2.0` override; also **NOT PRESENT IN PRODUCTION IMAGE**.
  - `GHSA-85c8-ppgw-ccpr` (Tinypool prototype pollution in run options, critical): **FIXED** via `tinypool@2.2.0` override; also **NOT PRESENT IN PRODUCTION IMAGE**.
  - `GHSA-fx49-4h83-wjv9` (Payload relationship-query bypass, high): **FIXED** via Payload 3.90.2 upgrade.
  - `GHSA-2g7p-5934-q4w7` (Payload token refresh field exposure, high): **FIXED** via Payload 3.90.2 upgrade.
  - `GHSA-238x-w2j9-gwwr` (Payload field access control bypass, high): **FIXED** via Payload 3.90.2 upgrade.
  - `GHSA-xgv3-crq2-6f69` (Payload polymorphic join field disclosure, high): **FIXED** via Payload 3.90.2 upgrade.
  - `GHSA-fpww-c55p-cjv6` (Payload field password update restrictions, high): **FIXED** via Payload 3.90.2 upgrade.
  - `GHSA-qhr7-859c-m2p7` (brace-expansion nested group DoS, high): **FIXED** via `brace-expansion@5.0.12` override.
  - `GHSA-6j4f-fj2g-mc7p` (brace-expansion comma parts DoS, high): **FIXED** via `brace-expansion@5.0.12` override.
  - `GHSA-vfj7-8cjw-p6xm` (braces stack exhaustion, high): **UPSTREAM / NO PATCH WITH COMPENSATING CONTROL** (affectedRange `<=3.0.3` has no upstream patch; only used by `sass`/`chokidar` for dev styling and `eslint`; zero reachability from production HTTP requests or worker; Next.js serves precompiled standalone bundles; untrusted inputs never touch brace expansion).
- **Moderate Advisories Resolved**:
  - `GHSA-w247-99vg-m257` (yaml stack overflow): **FIXED** via `yaml@2.9.1`.
  - `GHSA-jggr-w7fw-pc2j` (fast-copy stack exhaustion): **FIXED** via `fast-copy@3.1.0` override.
  - `GHSA-q2hr-2g5m-vwhr` (brace-expansion quadratic DoS): **FIXED** via `brace-expansion@1.1.21` override.
  - `GHSA-jg8r-5jh2-v2xj`, `GHSA-8g93-h5g9-p7ph`, `GHSA-8977-m862-2v4j` (Payload core issues): **FIXED** via Payload 3.90.2 upgrade.
  - `GHSA-82fw-gwwq-j7x9` (Vitest mocker path traversal): **NOT PRESENT IN PRODUCTION IMAGE** (dev test harness only, excluded from runner).
  - `GHSA-67mh-4wv8-2f99` (esbuild dev server request handling): **UPSTREAM / NO PATCH WITH COMPENSATING CONTROL** (drizzle-kit programmatic transformSync use only; dev server mode `--serve` is never started; zero production reachability).

## Production Docker Image Decision & Hardening

1. **Multi-Stage Separation**: Added dedicated `production-dependencies` stage running `npm ci --omit=dev`.
2. **Hardened Runner**: `/app/node_modules` in the production runner now exclusively contains production dependencies. Dev/test tooling (`vitest`, `tinypool`, `eslint`, `prettier`) is completely excluded.
3. **Runtime Support**: Moved `tsx` to production dependencies so that background worker (`jobs:worker`) and operational scripts execute without requiring devDependencies.
4. **Native Modules**: Sharp (0.35.5) verified working with Alpine Linux musl prebuilds inside the production container (live PNG generated and tested).
5. **Production Verification**:
   - `npm run build`: Exit 0 (all routes, static/dynamic bundles compiled).
   - `npm run test`: Exit 0 (178 test files, 1193 tests passed).
   - `npm run typecheck`: Exit 0 (clean).
   - `docker build`: Exit 0 (`renegade-cms:security-check` built cleanly).
   - Docker container boot: Exit 0 (`/health/live` returned `{ status: 'live' }`).
   - Commerce integration: Exit 0 (all acceptance tests passed).
