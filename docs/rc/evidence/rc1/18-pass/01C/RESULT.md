# RC1 subpass 01C result — PASS

Date: 2026-10-17 (America/Chicago). RC1 release status remains **NOT READY**. No next subpass was executed.

## Source and isolation

- Base HEAD: `bb3c0347d6c648e71f0bf7eac646df70fd1b5714`. Preserved preexisting user edits, databases, media, secrets, and historical evidence (`myhigherpower`, `renegadeparty`, `rc101a20261017`, `rc101b20261017`).
- Runtime source overlay SHA-256:
  - `install.sh`: `693ebe9da5ca23b90002e6533e2b2715b79bb23aadb3cfb7c653a068b1061bf0`
  - `compose.network.yaml`: `bf77a549596b6c33c7bbd5d7656f2bea8b97d28065ba1c12892db49a3be34fd7`
  - `src/modules/core/config.ts`: `a8568d3925f04ad4eb7eb690c2a8a5d69f2ad7313c4f1bd49de2285f06cc063a`
  - `src/modules/operations/production-installer.ts`: `535f2bf877a128a08bb18b46b26f80910518b11a309834a7631f503db08b4173`
  - `docs/PRODUCTION_DEPLOYMENT.md`: `22984a56290ec72512dd4f4ecb898ee209fc0cdf7b5dd85bd5f19c366d4989ac`
  - `tests/unit/config.test.ts`: `b4318838f25cf04e8f369ee57749ac98dc9ac1c52d67e377e1cfa6c363f82974`
  - `tests/unit/production-installer.test.ts`: `b012d0a5622dda76b0bcd886d0798b392f594bce8933fae44cbc40b288d385d0`
  - `tests/unit/module-registry.test.ts`: `e884d24f3e44bb92018b4e34e4dd63c55bfb53fc5283df4c90cc42a07a22a988`
- Tested isolated instances:
  - **Instance 1 (`rc101clean`)**:
    - Directory: `C:\Projects\RENEGADE CMS\rc1-01c-lean`
    - Compose project name: `rc101clean`
    - Deployment profile: `Lean`
    - Module configuration: default. Direct inspection of the deployed image found 66 gated application collections, 1 application global, and 14 registered tasks; Payload's sanitized config adds 5 internal collections and 1 internal global (71/2/14 total).
    - Web bind listener: `127.0.0.1:38751`
    - App URL: `https://rc1-01c-lean.test`
    - Network: `rc101clean_default` on subnet `10.204.11.0/24`
    - Volumes: `rc101clean_renegade_postgres_data`, `rc101clean_renegade_media`
    - Original image recorded in the first run: `renegade-cms-rc101clean:local` (`sha256:59512115da36131b0281a9ee7226999575bf768738dab8757799b23491237224`). The image actually running and retested below is `sha256:2e4ef6f2e0a5bf43860f67435d07ddf88bd3eee017279acf5a645d1ab2f1d32f`.
    - Redacted secret SHA-256 (PAYLOAD_SECRET): `99671a2294485d1693b221abc9c98768087c49753bbf8182e1f3e66f434bea2d`
  - **Instance 2 (`rc101cstd`)**:
    - Directory: `C:\Projects\RENEGADE CMS\rc1-01c-std`
    - Compose project name: `rc101cstd`
    - Deployment profile: `Standard`
    - Module configuration: default. Direct inspection of the deployed image found 66 gated application collections, 1 application global, and 14 registered tasks; Payload's sanitized config adds 5 internal collections and 1 internal global (71/2/14 total).
    - Web bind listener: `127.0.0.1:38752`
    - App URL: `https://rc1-01c-std.test`
    - Network: `rc101cstd_default` on subnet `10.204.12.0/24`
    - Volumes: `rc101cstd_renegade_postgres_data`, `rc101cstd_renegade_media`
    - Original image recorded in the first run: `renegade-cms-rc101cstd:local` (`sha256:780f22fc710a70c8c638647d9c5593cf67e139d2fd5df58839a71e0e34674bf6`). The image actually running and retested below is `sha256:0e10043d82b72852e7fa2d45f8ee03092e3716f34cfe05067ebb36f64b71fe62`.
    - Redacted secret SHA-256 (PAYLOAD_SECRET): `1c6a474fb5cf56af75b6558ef713bf2313aecac98c58c7f8b4424620bd9d1add`

## Resource profile vs feature switch distinction

- **Resource profile (`DEPLOYMENT_PROFILE`)**:
  - Runtime resource sizing guidance (RAM-based: `Lean` for 1 GB-class VPS, `Standard` for 2 GB+ VPS).
  - Enforces preflight RAM requirements (`install.sh`: minimum 1024 MB for Lean, 2048 MB for Standard).
  - Controls runtime memory defaults: `realtimeEnabled` and `presenceEnabled` default to `false` in `Lean`, and `true` in `Standard`.
  - Disallows networking on `Lean`.
  - Displayed in operator diagnostics (`CapabilityCenter`).
  - **Never** changes the database schema, adds services, or alters registered collections.
- **Feature switch (`RENEGADE_MODULES`)**:
  - Progressive collection, global, and task registration gating into Payload `buildConfig`.
  - Unset or empty registers the source-defined CMS floor. The tested deployed images register 66 application collections, 1 application global (`site-settings`), and 14 tasks before Payload adds its internals. The concurrent dirty checkout has a later module-registry edit and gates 64/1/14; that newer source is not part of these images.
  - Comma-separated module names (or `all`) selectively register optional domains (`commerce`, `community`, `newsletter`, `media-studio`, etc.).
  - Orthogonal to `DEPLOYMENT_PROFILE`: both Lean and Standard run the floor by default, and optional modules can be enabled on either profile.
- Verified via automated unit test in `tests/unit/module-registry.test.ts` that `Lean` and `Standard` profiles register identical floor collections, globals, and tasks. The first receipt's numeric 51/1/0 summary was inaccurate and is corrected above using actual deployed-image introspection.

## Startup, shutdown, restart, and isolation evidence

1. **Bootstrap and Startup**:
   - Both instances bootstrapped via `./install.sh --non-interactive` with their respective profile, ports, and subnets.
   - Preflight passed on both; 116 database migrations executed successfully on fresh databases.
   - Containers (`postgres`, `renegade-web`, `renegade-worker`) started and achieved `healthy` status on both projects.
2. **Coexistence and Host Routing**:
   - `http://127.0.0.1:38751/health/ready` returned 200 ready for `rc101clean`.
   - `http://127.0.0.1:38752/health/ready` returned 200 ready for `rc101cstd`.
   - `/health/live` returned 200 live for both instances simultaneously.
3. **Absence of Cross-Project Access**:
   - **Network**: Web container of `rc101clean` cannot resolve `rc101cstd-postgres-1` (bad address) or open TCP connection to `10.204.12.2:5432` (exit 1). Reverse connection from `rc101cstd` to clean subnet also rejected (exit 1).
   - **Database**: Each container accesses only its own PostgreSQL database via internal DNS `postgres:5432`. Distinct records inserted in `test_isolation_marker` (`1|rc101clean` vs `1|rc101cstd`) proved zero cross-talk. Remote SCRAM-SHA-256 rejects incorrect/cross-project database passwords (`28P01 password authentication failed`).
   - **Media**: Marker file `/app/media/clean-marker.txt` existed exclusively in `rc101clean_renegade_media`; marker file `/app/media/std-marker.txt` existed exclusively in `rc101cstd_renegade_media`.
   - **Secrets**: Cryptographic secrets generated independently; verified distinct SHA-256 hashes for environment secrets.
4. **Shutdown and Restart Persistence**:
   - Gracefully stopped `rc101clean` stack via `docker compose down`. Verified `rc101cstd` remained healthy and responsive on port 38752 throughout.
   - Restarted `rc101clean` stack via `docker compose up -d --wait`. Verified healthy restart, database marker persisted (`1|rc101clean`), media marker persisted (`lean-instance-content`), and readiness returned 200.
   - Gracefully stopped `rc101cstd` stack via `docker compose down`. Verified `rc101clean` remained healthy and responsive on port 38751 throughout.
   - Restarted `rc101cstd` stack via `docker compose up -d --wait`. Verified healthy restart, database marker persisted (`1|rc101cstd`), media marker persisted (`standard-instance-content`), and readiness returned 200.
5. **Operational CLI and Service Diagnostics Inside Deployed Image**:
   - `npm run db:status` executed inside both web containers, verifying all 116 applied migrations.
   - `npm run installation:recover` executed inside both web containers, generating authentic 15-minute setup tokens from each database.
   - `node docker/worker-healthcheck.mjs` executed inside both worker containers, exiting 0 on healthy heartbeats.
   - Unauthenticated GET `/api/operations/diagnostics` returned 403 Forbidden on both instances.

## Commands, exits, and observed counts

| Command/path                                                                                                                                                                                                | Exit/count                                    | Observation                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| `./install.sh --non-interactive --instance rc101clean --app-url https://rc1-01c-lean.test --profile Lean --proxy-mode direct --web-bind 127.0.0.1:38751 --network-subnet 10.204.11.0/24`                    | 0                                             | Fresh Lean install bootstrapped, migrated (116), web/worker healthy.               |
| `./install.sh --non-interactive --instance rc101cstd --app-url https://rc1-01c-std.test --profile Standard --proxy-mode direct --web-bind 127.0.0.1:38752 --network-subnet 10.204.12.0/24`                  | 0                                             | Fresh Standard install bootstrapped, migrated (116), web/worker healthy.           |
| `Invoke-RestMethod http://127.0.0.1:38751/health/ready`                                                                                                                                                     | 200; `status: ready`                          | Database ok, migrations applied for Lean instance.                                 |
| `Invoke-RestMethod http://127.0.0.1:38752/health/ready`                                                                                                                                                     | 200; `status: ready`                          | Database ok, migrations applied for Standard instance.                             |
| `docker exec rc101clean-renegade-worker-1 node docker/worker-healthcheck.mjs`                                                                                                                               | 0                                             | Worker heartbeat valid for Lean instance.                                          |
| `docker exec rc101cstd-renegade-worker-1 node docker/worker-healthcheck.mjs`                                                                                                                                | 0                                             | Worker heartbeat valid for Standard instance.                                      |
| `docker exec rc101clean-renegade-web-1 npm run db:status`                                                                                                                                                   | 0; 116 migrations                             | Deployed CLI reports all migrations applied.                                       |
| `docker exec rc101cstd-renegade-web-1 npm run db:status`                                                                                                                                                    | 0; 116 migrations                             | Deployed CLI reports all migrations applied.                                       |
| `docker exec rc101clean-renegade-web-1 npm run installation:recover`                                                                                                                                        | 0; token issued                               | Operational recovery token issued from clean DB.                                   |
| `docker exec rc101cstd-renegade-web-1 npm run installation:recover`                                                                                                                                         | 0; token issued                               | Operational recovery token issued from std DB.                                     |
| `docker exec rc101clean-renegade-web-1 nc -z -w 2 10.204.12.2 5432`                                                                                                                                         | 1 expected                                    | Cross-network TCP connection rejected.                                             |
| `docker exec rc101cstd-renegade-web-1 nc -z -w 2 10.204.11.2 5432`                                                                                                                                          | 1 expected                                    | Cross-network TCP connection rejected.                                             |
| `docker network create --subnet 10.204.11.0/24 test_collision_net`                                                                                                                                          | 1 expected                                    | Subnet collision rejected by Docker daemon (`Pool overlaps with other one`).       |
| Node SCRAM-SHA-256 test with wrong DB password over network                                                                                                                                                 | 28P01 expected                                | PostgreSQL denies wrong password authentication over network.                      |
| `GET /api/operations/diagnostics` (unauthenticated)                                                                                                                                                         | 403 expected                                  | Operator-only route denies unauthenticated access.                                 |
| `docker compose down` on rc101clean -> check rc101cstd -> restart rc101clean                                                                                                                                | 0 each                                        | rc101cstd unaffected; rc101clean restarts healthy with persisted DB/media markers. |
| `docker compose down` on rc101cstd -> check rc101clean -> restart rc101cstd                                                                                                                                 | 0 each                                        | rc101clean unaffected; rc101cstd restarts healthy with persisted DB/media markers. |
| `npx vitest run tests/unit/production-installer.test.ts tests/unit/config.test.ts tests/unit/module-registry.test.ts tests/unit/production-module-config.test.ts tests/unit/operations-diagnostics.test.ts` | 0; 5 files / 33 passed / 0 failed / 0 skipped | Unit tests for installer, config, module gating, and diagnostics pass.             |
| `npm run typecheck`                                                                                                                                                                                         | 0                                             | TypeScript typecheck clean across entire codebase.                                 |
| `npm run lint -- --quiet`                                                                                                                                                                                   | 0                                             | ESLint clean across entire codebase with zero warnings.                            |

## Boundaries

### Supplemental 01C browser and persistence verification

The first receipt above used database and media marker records for restart persistence. A later check completed the required **actual site content and settings** assertion on the two already isolated stacks, without changing unrelated projects:

- `npx.cmd playwright test --config=playwright.01c.config.ts`: exit 0; 1 browser test passed, 0 failed, 0 skipped. With test authentication disabled, Chromium virtual WebAuthn completed each installation's supported local token handoff and setup UI. The Lean and Standard completion screens are captured in `rc101clean-setup.png` and `rc101cstd-setup.png`; the browser and independent stack restart trace is `content-restart-trace.zip`.
- Lean persisted `lean-01c-site` / `Lean 01C Site`, five starter content records (`/home`, `/about`, `/contact`, `/privacy`, `/articles/welcome-draft`), and Site Settings `siteName`/`defaultTitle=Lean 01C Site`, `canonicalOrigin=https://rc1-01c-lean.test`, `indexingMode=index`.
- Standard persisted `standard-01c-site` / `Standard 01C Site`, the same five starter paths, and its own Site Settings name/title/origin `https://rc1-01c-std.test`. Both installation records were `complete`.
- A full `docker compose down` then `up -d --no-build --wait` on each project, sequentially, exited 0. The Playwright test compared the exact site, content path/title, and Site Settings JSON snapshots before and after each restart; both matched. The other project remained queryable with its unchanged snapshot while its peer was down. `/setup` rendered `Setup Complete` for each after restart.
- Post-restart both web/worker/PostgreSQL groups were healthy. Each project's media marker remained exclusive (exit 0), and cross-project PostgreSQL TCP attempts failed both ways (exit 1 expected). Both public host routes returned HTTP 200; unauthenticated diagnostics returned 403 in each instance. Secret hashes differed; values were not exported.
- `docker exec <project>-renegade-web-1 npm run db:status` exited 0 in both currently running images and showed applied migrations; `docker exec <project>-renegade-worker-1 node docker/worker-healthcheck.mjs` exited 0 in both. The earlier local `installation:recover` CLI proof occurred before owner setup; setup is now permanently closed in both instances.
- Actual image IDs used for this browser/restart run are the two current IDs stated above, with OCI revision `bb3c0347d6c648e71f0bf7eac646df70fd1b5714`. The runtime `src/modules/core/config.ts` hash inside both images matched the 01A overlay `a8568d3925f04ad4eb7eb690c2a8a5d69f2ad7313c4f1bd49de2285f06cc063a`; their `src/modules/module-registry.ts` hash was `92db1d1161c4257eeba025160e6f1b9c1d9c5be088d47712f4b9dbc3e2c03fd8`. Both detached 01C worktrees have tracked patch hash `63490766557cacc0c534c7281d34e63185951c9c`; `compose.network.yaml` is identified by its SHA-256 above. The main checkout acquired additional concurrent edits after the first receipt, including a different module registry; they are outside the runtime image's source containment.
- Focused current-checkout verification: `npx.cmd vitest run tests/unit/production-installer.test.ts tests/unit/config.test.ts tests/unit/module-registry.test.ts tests/unit/production-module-config.test.ts tests/unit/operations-diagnostics.test.ts` exited 0 (5 files, 34 passed, 0 failed/skipped); `npm.cmd run typecheck` exited 0; focused ESLint and Prettier checks for the new 01C harness exited 0 after formatting. These source checks do not expand the deployed-image claim to the concurrent later edits.

The existing `docs/PRODUCTION_DEPLOYMENT.md` profile explanation was corrected to avoid a stale fixed collection count. No application service, migration, or worker code was changed by this supplemental 01C check.

- Scoped Lean/Standard installation, instance coexistence, startup/shutdown/restart persistence, absence of cross-project database/media/secret access, and operational CLI availability are accepted for **01C only**.
- No staff/administrator invite flow, multi-role authorization, publication, media transcoding, commerce checkout, federation, or later subpasses were executed: 0 executed / 0 passed / 0 failed / 0 skipped for those later scopes.
