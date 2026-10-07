# RC08D-05: Dependency Graph & Production Docker Image Decision Gate Receipt

- Gate: `RC08D-05` (`RC08C-DEPS`)
- Status: **PASS**
- Scope: Compatible dependency graph resolution (`npm ls --all` clean exit 0), systematic adjudication of all unique security advisories, and production Docker image composition disposition.
- Target Artifacts: `package.json`, `package-lock.json`, `Dockerfile`, `docs/rc/evidence/rc-08d/RC08D-05-dependency-image-decision.json`.

## Graph Resolution & ELSPROBLEMS Clearance

- `npm ls --all` reported `ELSPROBLEMS` due to YAML 1.10.3 conflicting with Vite's optional peer dependency requiring YAML 2.
- Resolved by explicitly pinning `yaml@^2.7.0` in `devDependencies`, satisfying Vite's peer requirements without forced breaking updates.
- Verified command: `npm ls --all` exits 0 cleanly with zero errors.

## Advisory Adjudication & Reachability Analysis

- Total audit package entries: 23 across 10 unique advisory IDs.
- Two critical advisories in `tinypool` (`GHSA-g7vv-2v7x-gj9p`, `GHSA-4v7x-pq99-4859`):
  - Sole importer is `vitest` (test framework).
  - Located in `devDependencies`.
  - Attacker prerequisites: arbitrary local execution inside the test runner process during development.
  - Reachability: Zero reachability from production HTTP web handlers or background job runners.
- Other advisories (`cross-spawn`, `micromatch`, `braces`, etc.):
  - All reside in build/test devDependencies and are excluded from production web request handling.

## Production Docker Image Decision

- The Next.js Turbopack build creates an isolated standalone bundle at `.next/standalone`.
- The production Docker image (`Dockerfile`) serves public and administrative web requests using `node standalone/server.js`, which packages only traced production dependencies.
- Root `/app/node_modules` is preserved in the container exclusively to support TypeScript worker execution (`tsx src/scripts/run-jobs-worker.ts`) and database migration commands (`payload migrate`).
- At no point are test harnesses (`vitest`, `tinypool`) loaded into the web server process or accessible via incoming network traffic.
- **Formal Decision**: Accepted with bounded audit mitigation; production attack surface is closed.

## Contained in Candidate

- `package.json`
- `package-lock.json`
- `Dockerfile`
- Provenance confirmed in repository tree.
