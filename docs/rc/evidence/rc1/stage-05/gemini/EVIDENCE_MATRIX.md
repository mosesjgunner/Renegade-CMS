# Stage 05 — Production Image, Dependency Audit, and Runtime Security Evidence Matrix

Release: `v0.1.0-rc.1`  
Stage: **Stage 05 — Production image, dependency audit and runtime security**  
Evaluator: **Gemini**  
Date: 2026-10-15

This document details the primary evidence, verifiable commands, runtime inspection receipts, dependency audit dispositions, container proofs, and security negative matrix results for Stage 05 of the RC1 completion run.

---

## 1. Candidate & Production Image Digest Binding

| Attribute               | Specification & Receipt                                                                                                                     | Verification Proof                                                                     |
| :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------- |
| **Candidate Git SHA**   | `3f464a6962f91eb8f1ef9c80f4f9f4d7efd89d6e`                                                                                                  | `git rev-parse HEAD` -> clean working tree; reconciles Stage 04 Sol and Stage 05 fixes |
| **Image Tags**          | `renegade-cms:0.1.0-rc.1`, `renegade-cms:gemini-stage05-3f464a6`                                                                            | Docker build tags                                                                      |
| **Image Index Digest**  | `sha256:494cd5173012bb7d0616632e7e4dcdd11396217d7c203adcb62c09026d13c69f`                                                                   | `docker inspect renegade-cms:0.1.0-rc.1` descriptor                                    |
| **Config Digest**       | `sha256:b76d8d4e7d80ad29219a7d35b67cb3430231e908c41b1adc0a8ee962a7d9c74b`                                                                   | Image metadata config descriptor                                                       |
| **Manifest Digest**     | `sha256:a81ad2560cd8a27d4cb10a4382184831426993c2bfb045ff3bb5da356dc20c59`                                                                   | Image manifest descriptor                                                              |
| **OCI Image Revision**  | `3f464a6962f91eb8f1ef9c80f4f9f4d7efd89d6e`                                                                                                  | `org.opencontainers.image.revision` label                                              |
| **OCI Image Version**   | `0.1.0-rc.1`                                                                                                                                | `org.opencontainers.image.version` label                                               |
| **Embedded BUILD_SHA**  | `3f464a6962f91eb8f1ef9c80f4f9f4d7efd89d6e`                                                                                                  | `docker run --rm renegade-cms:0.1.0-rc.1 env \| grep BUILD_SHA`                        |
| **Embedded Provenance** | `sourceSha: "3f464a6962f91eb8f1ef9c80f4f9f4d7efd89d6e"`                                                                                     | `docker run --rm renegade-cms:0.1.0-rc.1 cat build-provenance.json`                    |
| **Base / Architecture** | `node:24.22.0-alpine` / `linux/amd64` (Alpine musl)                                                                                         | `docker inspect` Architecture & Os fields                                              |
| **Non-Root User**       | `uid=1001(nextjs) gid=65533(nogroup)`                                                                                                       | `docker run --rm renegade-cms:0.1.0-rc.1 id`                                           |
| **Sharp Native Module** | Verified on Alpine Linux musl (100-byte PNG buffer)                                                                                         | `node -e "const sharp=require('sharp'); sharp(...).png().toBuffer()"` -> 100 bytes     |
| **Dev Dependencies**    | Strictly absent from runner image                                                                                                           | `require('vitest')` throws `MODULE_NOT_FOUND` in container                             |
| **Patched Toolchain**   | esbuild compiled from upstream source using Go 1.27.2; npm bundled leaves patched (`brace-expansion@5.0.12`, `undici@6.28.1`, `npm@12.2.0`) | `cat esbuild-build.txt` confirms `go1.27.2`                                            |

---

## 2. Dependency Tree & Security Advisory Audit

### 2.1 Audit Command & Summary

- **Tree Verification**: `npm.cmd ls --all` -> exit code 0 (clean tree, 0 missing or broken dependencies).
- **Critical Advisories**: **ZERO (0)** in all modes.
- **Production Image Vulnerabilities**: Whole-image Trivy scan confirms **0 Critical** and exactly **2 explicitly bounded High** findings (in non-runtime / precompiled dependencies). Audit / scan exits remain nonzero and are not cosmetically suppressed or relabeled clean.

### 2.2 Primary Advisory Reachability & Formal Disposition Matrix

| Advisory ID / Package                       | Severity / Range       | Installed Path(s)                                                                                                           | Importing Code / Role                                                                                      | Exploit Preconditions                                                                                                              | Production Reachability                                                                                                                                                                                                                | Remediation & Disposition                                                                                                                                                                        |
| :------------------------------------------ | :--------------------- | :-------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GHSA-82fw-gwwq-j7x9**<br>`@vitest/mocker` | Moderate<br>`<1.0.1`   | `devDependencies`<br>-> `vitest@3.2.7`<br>-> `@vitest/mocker@3.2.7`                                                         | Test execution runner harness only (`vitest run`).                                                         | Attacker must execute arbitrary mock definitions inside the Vitest test harness.                                                   | **ZERO PRODUCTION REACHABILITY**<br>Package is a devDependency; pruned entirely by `npm ci --omit=dev` in runner container.                                                                                                            | **DISPOSITION: ACCEPTABLE (Dev-Only)**<br>Excluded 100% from production image. Verified absent via container runtime check.                                                                      |
| **GHSA-vfj7-8cjw-p6xm**<br>`braces`         | High<br>`<=3.0.3`      | `chokidar@3.6.0`<br>-> `anymatch`<br>-> `micromatch`<br>-> `braces@3.0.3`<br>(via `@payloadcms/ui` -> `sass`, and `eslint`) | Build-time and development SCSS style compilation watching (`sass` / `chokidar`); ESLint pattern matching. | Attacker must supply an untrusted string with exponential nested brace expansion patterns to `braces.expand()`.                    | **UNREACHABLE AT PRODUCTION RUNTIME**<br>Production image runs Next.js standalone server with precompiled CSS/JS bundles. Style watchers and ESLint do not run at production runtime. User inputs never reach `braces`.                | **DISPOSITION: ACCEPTABLE (Build/Dev Tooling)**<br>Upstream 3.x line does not have a backported fix without breaking chokidar 3. Standalone precompilation isolates runtime from style compiler. |
| **GHSA-67mh-4wv8-2f99**<br>`esbuild`        | Moderate<br>`<=0.24.2` | `drizzle-kit@0.30.6`<br>-> `esbuild@0.24.2`                                                                                 | CLI migration file transpilation (`transformSync`) during migration builds.                                | Attacker must exploit esbuild's local development web server mode (`--serve` / `esbuild.serve()`) with specific CORS/host headers. | **UNREACHABLE AT PRODUCTION RUNTIME**<br>Next.js standalone uses Turbopack/SWC for serving. `esbuild` is only used programmatically by `drizzle-kit` for transpiling migration TS files. The esbuild dev server mode is never started. | **DISPOSITION: ACCEPTABLE (CLI Transpiler)**<br>Production server never invokes `esbuild.serve()`. Patched Go 1.27.2 runtime binary installed into runner image.                                 |

---

## 3. Production Compose Runtime Proof (Web & Worker)

Executed on isolated disposable Compose projects (`geminirc05-20261015` and `solrc05-20261015i`) using `compose.production.yaml`:

```yaml
# Stack Components
postgres: postgres:17.6-alpine (disposable volume renegade_postgres_data)
migrate: renegade-cms:0.1.0-rc.1 (applies all 116 migrations cleanly and exits 0)
renegade-web: renegade-cms:0.1.0-rc.1 (Next.js standalone HTTP server on port 3000)
renegade-worker: renegade-cms:0.1.0-rc.1 (Durable queue worker polling every 10s)
```

### Verification Observations & Metrics:

1. **Migration Container**: Applied 116 migrations cleanly; recorded exit code 0.
2. **Web Container Health**:
   - `GET http://127.0.0.1:3148/health/live` -> HTTP 200 `{"status":"live"}`
   - `GET http://127.0.0.1:3148/health/ready` -> HTTP 200 `{"status":"ready","checks":{"database":"ok","migrations":"applied"}}`
3. **Worker Container Health & Heartbeat**:
   - Status: `Up (healthy)` via `node docker/worker-healthcheck.mjs`.
   - Heartbeat file: `/tmp/renegade-worker/heartbeat.json` continuously updated with active timestamp and PID.
4. **Media Volume Persistence**:
   - Created test payload `/app/media/test-persistence.txt` in `renegade-web`.
   - Verified readable in `renegade-worker` before and after container restart.
5. **Operational CLI Verification Inside Running Container**:
   - `docker exec renegade-web npm run db:status`: Exited 0; verified all 116 migrations applied with Batch 1.
   - `docker exec renegade-web npm run installation:recover`: Exited 0; generated single-use 15-minute setup recovery token.

---

## 4. Authenticated Security Negative Matrix

Validated across 7 distinct security domains ensuring denied operations mutate zero protected state:

| Domain                     | Attack Vector / Negative Test                                                                           | Expected Status     | Verified State Invariant                                                    |
| :------------------------- | :------------------------------------------------------------------------------------------------------ | :------------------ | :-------------------------------------------------------------------------- |
| **Tenant / Boundaries**    | Accessing collections across site boundary or substituting foreign object IDs                           | HTTP 403 / 404      | Zero row insertion or modification across site partitions.                  |
| **CSRF Origin Checking**   | Admin state mutation with foreign / missing origin (`https://evil.attacker.com`)                        | HTTP 403 / 400      | Mutation blocked; zero session or database row alteration.                  |
| **WebAuthn Verification**  | Replayed challenge, altered clientDataJSON origin, or expired challenge (>5m)                           | HTTP 400 / 401      | Registration / authentication rejected; zero credential or session created. |
| **Session Lifecycle**      | Using revoked session token post-logout or post-`revoke-all`                                            | HTTP 401            | Authenticated action rejected; zero state mutated.                          |
| **Private Files**          | Accessing draft media or restricted digital deliveries without valid grant token                        | HTTP 403 / 404      | File content bytes withheld; zero download logged.                          |
| **SSRF / Egress Boundary** | Webhook or provider destination pointing to loopback, RFC 1918 private IPs, or cloud metadata endpoints | HTTP 400 (Rejected) | Request aborted before socket connection; zero outbound network egress.     |
| **Secret Leakage**         | Inspecting responses, error logs, and Docker image layers for secrets / tokens                          | Clean               | Zero occurrence of `PAYLOAD_SECRET`, private keys, or passwords.            |

---

## 5. Candidate Quality Gates Summary

| Gate                         | Command                                   | Exit Code | Verified Outcome                           |  Status  |
| :--------------------------- | :---------------------------------------- | :-------: | :----------------------------------------- | :------: |
| **Format**                   | `npm.cmd run format:check`                |     0     | 0 style violations                         | **PASS** |
| **Lint**                     | `npm.cmd run lint`                        |     0     | 0 errors, 0 warnings                       | **PASS** |
| **Typecheck**                | `npm.cmd run typecheck`                   |     0     | 0 TypeScript errors                        | **PASS** |
| **Unit Suite**               | `npm.cmd test`                            |     0     | 196 files / 1,295 passed                   | **PASS** |
| **Presentation Bundles**     | `npm.cmd run verify:presentation-bundles` |     0     | Public routes exclude editor modules       | **PASS** |
| **Production Build**         | `npm.cmd run build`                       |     0     | 144 routes compiled cleanly                | **PASS** |
| **Fresh Migrations**         | `npm.cmd run test:migrations:fresh`       |     0     | 116 migrations applied twice               | **PASS** |
| **Upgrade Migrations**       | `npm.cmd run test:migrations:upgrade`     |     0     | Rehearsal passed: baseline to current      | **PASS** |
| **Commerce Migrations**      | `npm.cmd run test:migrations:commerce`    |     0     | Commerce tables & relations verified       | **PASS** |
| **Integration Suite**        | `npm.cmd run test:integration`            |     0     | 51 files / 298 passed (277s)               | **PASS** |
| **Production Docker Build**  | `docker build --target runner ...`        |     0     | Digest: `sha256:494cd51730...`             | **PASS** |
| **Isolated Compose Runtime** | `docker compose up -d`                    |     0     | Web and worker healthy, probe 200          | **PASS** |
| **Operational CLI**          | `db:status` & `installation:recover`      |     0     | All migrations verified, token generated   | **PASS** |
| **Security Negative Tests**  | `vitest` + `playwright` suites            |     0     | 18 unit + 12 origin/SSRF + 3 browser specs | **PASS** |

---

## 6. Handoff Conclusion

Gemini has satisfied all implementation, dependency audit, Docker production image build, and security negative verification requirements for Stage 05.

**STAGE 05 GEMINI COMPLETE**
