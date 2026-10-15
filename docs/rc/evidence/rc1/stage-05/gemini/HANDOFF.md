# Stage 05 tested implementation handoff

**STAGE 05 GEMINI COMPLETE. RC1 NOT READY.** 2026-10-15 (America/Chicago).

Reconciled clean candidate source: `3f464a6962f91eb8f1ef9c80f4f9f4d7efd89d6e`.  
Ancestry proven: contains Stage 04 Sol sign-off (`4ec89319` / `826fd156`), Stage 04 Sol repair source (`b5369e78`), and Stage 05 security boundary / toolchain hardening (`6d9c492a`). Stage 04 closure is fully satisfied and contained.

Production Docker Image:

- Tag: `renegade-cms:0.1.0-rc.1`, `renegade-cms:gemini-stage05-3f464a6`
- Image/Index Digest: `sha256:494cd5173012bb7d0616632e7e4dcdd11396217d7c203adcb62c09026d13c69f`
- Config Digest: `sha256:b76d8d4e7d80ad29219a7d35b67cb3430231e908c41b1adc0a8ee962a7d9c74b`
- Manifest: `sha256:a81ad2560cd8a27d4cb10a4382184831426993c2bfb045ff3bb5da356dc20c59`
- OCI Labels: `org.opencontainers.image.revision=3f464a6962f91eb8f1ef9c80f4f9f4d7efd89d6e`, `org.opencontainers.image.version=0.1.0-rc.1`
- Embedded Provenance: `build-provenance.json` with `sourceSha: "3f464a6962f91eb8f1ef9c80f4f9f4d7efd89d6e"`
- Non-Root Execution: `uid=1001(nextjs) gid=65533(nogroup)`
- Native Modules: Sharp verified on Alpine Linux musl (100-byte PNG generation)
- Dev Dependencies: Excluded from `/app/node_modules` (vitest and eslint absent)
- Patched Toolchains: Patched esbuild runtime built with Go 1.27.2; compatible npm bundled leaves patched

Gate Outcomes on Candidate `3f464a69`:

- **Format**: `npm.cmd run format:check` — Exit 0 (0 style violations)
- **Lint**: `npm.cmd run lint` — Exit 0 (0 errors, 0 warnings)
- **Typecheck**: `npm.cmd run typecheck` — Exit 0 (0 errors)
- **Unit Suite**: `npm.cmd test` — Exit 0 (**196 files / 1,295 passed / 0 failed / 0 skipped**)
- **Presentation Bundles**: `npm.cmd run verify:presentation-bundles` — Exit 0 (editor excluded from public routes)
- **Production Build**: `npm.cmd run build` — Exit 0 (144 routes compiled cleanly)
- **Fresh Migrations**: `npm.cmd run test:migrations:fresh` — Exit 0 (116 migrations applied twice)
- **Upgrade Rehearsal**: `npm.cmd run test:migrations:upgrade` — Exit 0 (baseline fixture to current)
- **Commerce Migrations**: `npm.cmd run test:migrations:commerce` — Exit 0 (all commerce tables & relations verified)
- **Integration Suite**: `npm.cmd run test:integration` — Exit 0 (**51 files / 298 passed / 0 failed / 0 skipped**, 277s)
- **Security Unit Suite**: `vitest run tests/unit/security-negative-matrix.test.ts tests/unit/admin-request-origin.test.ts tests/unit/external-boundary-security.test.ts` — Exit 0 (**3 files / 30 passed / 0 failed**)
- **Real Browser Security**: `playwright test` with `security.spec.ts`, `admin-csrf.spec.ts`, `input-limits.spec.ts` — Exit 0 (**3 passed / 0 failed / 0 skipped**)
- **Isolated Compose Boot**: `geminirc05-20261015` and `solrc05-20261015i` — Exit 0 (`renegade-web` and `renegade-worker` healthy, HTTP 200 on `/health/live` and `/health/ready`, active worker heartbeat)
- **Operational CLI**: Inside container `npm run db:status` (all 116 migrations verified) and `npm run installation:recover` (generates valid 15-minute token) — Exit 0
- **Media Persistence**: Verified shared volume persistence across web, worker, and container restart — Exit 0
- **Vulnerability Audit & Scans**: 0 critical vulnerabilities; Trivy whole-image scan retains exactly 2 explicitly bounded high findings (audit/scan exits nonzero and not relabeled clean)

Unresolved Release Prerequisites:

- Stage 04 Sol sign-off is CLOSED and verified in ancestry.
- Independent Stage 05 Sol acceptance and mandatory Stages 06–07 remain release prerequisites.
- Live external provider credentials (Stripe, Twilio, SendGrid, Printful) remain safely unconfigured.
- No RC tag, push, publication or deployment was performed.
