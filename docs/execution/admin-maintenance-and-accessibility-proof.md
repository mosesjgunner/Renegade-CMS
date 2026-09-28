# Admin maintenance, backup, restore, and accessibility evidence

**Execution date:** 2026-09-26  
**Workspace:** `C:\Projects\RENEGADE CMS\Renegade-CMS`  
**Runtime candidate:** application `0.1.0`, image `renegade-cms:local`, image build SHA `unknown` (not an immutable release candidate)  
**Authorization:** Capability Center checks `owner` at the custom view; server-backed maintenance APIs retain their own access checks. The screen and its restore instructions are not exposed to `staff`.

## Runtime and operations surfaced

The Capability Center now reads and displays the running app version, deployment profile, registered module profile, job backend, injected build SHA (or unavailable), schema version, migration ledger, DB health, worker heartbeat, queued/running/failed jobs, recent sanitized failures, backup record and isolated restore command. Runtime values are not inferred from source code. An archive location is shown only when the backup utility recorded one. Credentials and provider secrets are not shown.

Backup contains the PostgreSQL custom-format dump and local media/generated asset volume, plus non-secret manifest metadata (application/PostgreSQL versions, image tag, module and job profile, migration list, checksums, and sizes). It excludes `.env` and environment values, DB password, Payload secret, provider credential values, archive encryption keys, `.upload-sessions`, rebuildable caches and worker lease locks. Encrypted credentials held as application DB records are included as DB data. Restore requires separate isolated target configuration and does not copy the source environment.

## Actual backup evidence

Command executed from the workspace:

```powershell
npm.cmd run backup:operational -- --output 'C:\Projects\RENEGADE CMS\Renegade-CMS\tmp-backups' --maintenance-window-confirmed --manifest-output 'C:\Projects\RENEGADE CMS\Renegade-CMS\docs\execution\admin-operations-backup-2026-09-26.json'
```

The command stopped web and worker during the DB/media snapshot and restored both services in its `finally` path. The utility verified the manifest checksums, listed the PostgreSQL archive and media tar, and wrote operational status. Evidence is in [admin-operations-backup-2026-09-26.json](./admin-operations-backup-2026-09-26.json).

| Component       |      Bytes | SHA-256                                                            |
| --------------- | ---------: | ------------------------------------------------------------------ |
| `database.dump` | 14,284,910 | `9bf08bd57bfec65c09093556aa91306f11375e34790e866c2da6e35d6f0f1585` |
| `media.tar.gz`  |        279 | `e5cd16cb3d88569695da024f28a389a08b8a1a55ae45f7816f3acf6bbf488be6` |

Archive directory: `tmp-backups/renegade-backup-2026-09-26T03-59-08-302Z`. The manifest timestamp is `2026-09-26T03:59:26.070Z`; total component bytes `14,285,189`; migration ledger entries `111`; PostgreSQL `17.6`; media is effectively empty (279-byte compressed tar). PowerShell `Get-FileHash -Algorithm SHA256` independently matched both manifest digests. The status command below reported ready after backup; Compose showed PostgreSQL, web, and worker healthy. The configured database was queried read-only for integrity counts; no rows were changed.

## Isolated restore rehearsal and integrity blocker

Command executed against `.env.restore` / `compose.restore.yaml` only:

```powershell
npx.cmd tsx --env-file=.env src/scripts/operational-restore.ts -- --archive 'C:\Projects\RENEGADE CMS\Renegade-CMS\tmp-backups\renegade-backup-2026-09-26T03-59-08-302Z' --target-version 0.1.0 --isolated --authorize-restore --env-file .env.restore
```

The archive and component formats validated; an isolated PostgreSQL volume was started; DB schema/data and media were loaded. The restore stopped before post-data constraints after it found a missing referenced site. A separate read-only query of the source DB found:

| Integrity defect                                               | Rows |
| -------------------------------------------------------------- | ---: |
| Activity event site references without a matching site         |   31 |
| Admin auth audit event user references without a matching user |   37 |
| Active admin sessions referencing missing users                |  125 |
| Revoked admin sessions referencing missing users               |    0 |

The restore tool now fails closed before constraints, preserving audit and active-session data instead of remapping/deleting records. The trial is **not a successful restore**: no post-data constraints, app boot, route check, or restored-media read was reached. The isolated Compose project was removed with `docker compose --project-name renegade-cms-restore --env-file .env.restore -f compose.restore.yaml down --volumes --remove-orphans`; no restore containers/volumes remain. Production services were healthy after cleanup. Repair referential integrity at source, then take a fresh archive and rerun restore before treating backup/restore as accepted.

Post-backup runtime check:

```powershell
npx.cmd tsx --env-file=.env src/scripts/operational-status.ts -- --env-file .env.production
```

Result: `ready`, app `0.1.0`, PostgreSQL `17.6`, 111 applied migrations; production PostgreSQL, web and worker healthy.

## Admin empty/loading/success/warning/error review

- Capability Center uses actual database migration and queue reads. Missing migrations and worker heartbeat provide an action; unavailable core diagnostics are labelled unavailable instead of claiming zero/healthy.
- Schedule Health Center has a loading announcement, fetch/action error with retry direction, empty-filter guidance, labeled refresh/reconcile/retry/cancel controls, status text as well as color, and confirmation before reconcile/cancel.
- Editorial Workflow Center announces loading and errors, uses named tab/tablist roles and exposes unknown worker state as `Unknown`, not healthy.
- Job error samples are bounded and redacted; the admin view links to owning job records. Existing dashboard metrics remain query-backed, not seeded production counts.
- Backup screen distinguishes no recorded archive, failed status, and archive metadata. Status states checksum validation occurred at backup time; it does not continuously re-read the archive to reverify it.

## Keyboard, screen reader, and visual review

Code review covered admin landmarks, navigation, status controls, error/status announcements, the schedule table, workflow tabs, dialog confirmations, focus visibility, touch target sizing, color-independent status text and reduced motion. The shared admin shell provides a visible-on-focus skip link, main landmark, visible focus outlines and reduced-motion overrides. Schedule actions have descriptive names and at least 44px minimum height; its table has a caption and scoped headers; filters expose `aria-pressed`. Workflow tabs expose `tablist`/`tab` semantics and selected state. Status copy spells out healthy/degraded/unknown states.

This was a source-level keyboard/screen-reader-oriented review. No authenticated browser session or NVDA/VoiceOver session was available for live focus-order, contrast-ratio measurement, dialog behavior, or touch-device validation. Those remain unverified; this document does not claim WCAG conformance.

## Defects found and repairs

1. Backup failed on a nonexistent output parent: backup now creates the parent directory.
2. Backup diagnostics previously depended on an externally configured manifest path, so the admin screen could not report a just-created archive: the backup utility now records archive path, timestamp, file count, and bytes in the media-volume operational status; diagnostics expose it only after a successful verified backup record.
3. Restore had an unsafe opt-in orphan repair path that could rewrite audit relations/delete expired session rows and was advertised even though active sessions still blocked restore: removed the repair path and made source repair plus a new backup the only supported resolution.
4. Workflow showed a missing worker field as healthy: now displays `Unknown`.
5. Schedule reconciliation had no confirmation, controls were undersized, empty/loading/error messages lacked next steps, and status relied on color: added a confirmation, keyboard focus, touch-sized controls, state guidance, and explicit text.
6. Admin shell lacked a main-content skip target and reduced-motion/focus rules: added the skip link, main landmark, focus styles, and reduced-motion rules.

## Commands and results

```powershell
npx.cmd prettier --write src/modules/operations/diagnostics.ts src/modules/operations/backup.ts src/modules/admin/CapabilityCenter.tsx src/modules/admin/ScheduleHealthCenter.tsx src/modules/admin/EditorialWorkflowCenter.tsx src/scripts/operational-backup.ts src/scripts/operational-restore.ts tests/unit/operations-diagnostics.test.ts
npx.cmd eslint src/modules/operations/diagnostics.ts src/modules/operations/backup.ts src/modules/admin/CapabilityCenter.tsx src/modules/admin/ScheduleHealthCenter.tsx src/modules/admin/EditorialWorkflowCenter.tsx src/scripts/operational-backup.ts src/scripts/operational-restore.ts tests/unit/operations-diagnostics.test.ts
npx.cmd tsc --noEmit
npx.cmd vitest run tests/unit/operational-backup.test.ts tests/unit/operations-diagnostics.test.ts tests/unit/admin-maintenance-and-accessibility.test.ts
```

ESLint passed; TypeScript passed; focused unit tests passed (3 files, 14 tests). No full unit/browser/assistive-technology run is claimed for this execution.

## Limitations

- Restore cannot be accepted until source orphan relations are repaired and the complete isolated restore reaches app health plus representative authenticated reads and media checksum comparison.
- Backup covers local media storage. Remote object storage, external provider state, email delivery history outside this DB, and source environment secret values are not separately captured.
- The build SHA is `unknown`; this worktree/image is not an immutable candidate.
- Screen-reader and actual keyboard traversal were not exercised in a browser. Contrast values and physical touch targets were reviewed in code but not measured on rendered pages/devices.
