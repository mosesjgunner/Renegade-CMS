# UXI-11 — Make operating the site survivable

Done: OPERATOR_RECOVERY_RUNBOOK.md (status, safe rerun, owner recovery, rotation, HTTPS boundary, backup/update discipline) written against verified commands only. Installer rerun safety (UXI-03) is the load-bearing piece and is harness-proven. Guided in-product backup/restore UX was not built in this pass; the existing operational engines remain operator-invoked.

---

## Continuation (Stage 6) — guided in-product health / backup / restore / update

Built on the existing engines (diagnostics, backup, lifecycle); no engine
was rewritten and nothing shells out from the web app. New code:
`src/modules/operations/guided-operations.ts` (translation, destination
config, update preflight, bundle allowlist),
`src/modules/admin/GuidedOperationsPanel.tsx` (on `/admin/operations`,
below the task-readiness panel), and operator-gated routes
`GET /api/operations/guided`, `GET|POST /api/operations/backup-destination`,
`POST /api/operations/restore-fixture`, plus `?preview=1` on the existing
support-bundle route.

### 1. Health in task terms

`translateDiagnosticsToHealthItems` maps the real diagnostics snapshot to
task language — e.g. a missing worker heartbeat renders as "Scheduled
tasks are paused — new posts will not publish on schedule" — each item
with state (`healthy` / `attention` / `broken`), impact, and next action.
Dismissals are honoured only for healthy tips: a dismissed item that is
still broken or needs attention stays visible with its real state and
`dismissedButUnresolved: true`. A dismissal never renders a failure
healthy.

### 2. Backup status with real coverage labelling

The backup manifest gained two additive, optional fields recorded at
creation (`createOperationalBackupManifest` fills them; the backup CLI
accepts `--destination-kind` / `--destination-remote-type` and records
both in `backup-status.json`):

- `destination: { kind, remoteType? }` — `local-disk` |
  `operator-configured-remote` | (absent/`unknown` on legacy records).
  The kind is recorded explicitly, never inferred from a path string.
- `coverage` — derived from what was actually captured: database, media,
  configuration (`non-secret-only`), encryption keys (**false** — keys
  are excluded by design), version metadata.

Labelling rule, applied everywhere the status is shown (panel,
diagnostics `backup.destinationLabel`, support bundle):
`local-disk` and `unknown` → **"same-disk snapshot — not an off-host
backup"**; `operator-configured-remote` → **"off-host backup — \<type\>"**
with the operator-named destination type. Legacy records default to
`unknown`, i.e. they are treated as same-disk.

### 3. Guided backup destination

The engine supports local paths only, so the guided flow configures the
local backup folder and — for off-host — records the operator's own sync
destination type; the panel states plainly that off-host requires the
operator's own sync (rsync/rclone/host snapshots) of that folder. No S3
or uploader was invented. The choice is stored in
`<mediaDir>/.renegade/backup-destination.json` (mode 0600) via the
operator-gated route, with validation (absolute path; remote requires a
named type so the label stays truthful). The panel also carries the
key-custody explanation in plain language: backups never contain
encryption keys/passwords/secrets; keys live in `.env.production` + the
operator's password manager; losing them means restored content works
but encrypted provider credentials must be reconnected.

### 4. Restore verified on a separate fixture

`restoreBackupToFixtureTarget` (backup.ts) verifies the source backup,
copies it into a **separate, empty** fixture target (refusing the source
itself or a non-empty target), and verifies the copy: component
checksums and totals against its manifest, every digest equal to the
source's, plus version and migration count. The panel wraps the
test-restore in the Stage 5 `ConfirmDestructive` pattern (scope +
consequence stated; live data explicitly untouched), shows the
verification, and only then offers the live restore — as the exact
isolated CLI command (`restore:operational -- --isolated
--authorize-restore`), never as an in-app action, with a version
compatibility check (`assertRestoreVersionCompatibility`) gating the
offer. Proof: unit fixture test plus
`tests/integration/uxi11-guided-operations.integration.test.ts` —
snapshots live `content` data into a backup, restores to a separate
target, verifies contents match, and asserts the live count is
unchanged.

### 5. Update flow — honest endpoint: verified-ready + operator command

`evaluateUpdatePreflight` runs three checks, each shown pass/fail with
its fix: compatible artifact (valid SemVer, newer, same major line),
a recoverable backup that is recent (healthy within 7 days, with its
destination label shown), and ≥10 GB free disk (`statfs` on the media
dir). The surface states expected downtime and the version change
(old → new). **Executing an update from the web app is not safe in this
architecture, so there is deliberately no "Update now" button and no
Docker socket access**: when — and only when — every check passes, the
surface ends at verified-ready plus the one exact operator command
(`npm run upgrade:operational -- --target-image-tag … --target-version …
--backup <verified-backup-directory> --maintenance-window-confirmed`).

### 6. Support bundle — allowlist by construction, previewable

`createSupportBundle` was rebuilt from a dump-and-redact into an
explicit allowlist pick (`SUPPORT_BUNDLE_ALLOWLIST` in
guided-operations.ts): job error text, provider labels/keys, config
warnings, file paths, and every secret-shaped field are never copied
in, so they cannot appear in the output. `GET
/api/operations/support-bundle?preview=1` returns the exact bundle
inline; the panel lists the included fields, shows the preview, and
only then offers the download. The unit test plants a secret value in
job errors, provider label/key, config password, and config warnings
and asserts it appears nowhere in the bundle.

### UNVERIFIED / not claimed

- A real off-host restore and a real upgrade execution on a populated
  host were not performed; the fixture restore is proven at the
  backup-component level and the live restore/upgrade remain the
  existing isolated CLI flows.
- The guided panel's routes are covered by the shared operator gate and
  unit/integration tests of the underlying functions; no browser E2E of
  the panel was run in this stage.
