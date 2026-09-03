# Operational backup and restore

This procedure is an appliance recovery backup, not the portable content export described in `IMPORT_EXPORT.md`. It captures the PostgreSQL custom-format dump and the complete local `MEDIA_DIR` tree (uploads plus generated derivatives). Extension, capability, job, release, installation, and migration state are canonical PostgreSQL data. No `.env` file, database password, Payload secret, provider credential, or encryption key is archived.

## Backup

Schedule a short maintenance window. Stop new writes (the command stops web and worker), then run:

```powershell
npm run backup:operational -- --output D:\renegade-backups --maintenance-window-confirmed --env-file .env.production
```

The command uses `pg_dump -Fc` inside the PostgreSQL 17 container and archives `/app/media`. It writes `database.dump`, `media.tar.gz`, and `manifest.json`. The manifest records format, application/build and PostgreSQL versions, timestamp, included components, checksums, sizes, counts, and the migration ledger. Success requires checksums plus `pg_restore -l` and `tar -tzf` verification. A failure removes the incomplete archive and records only a non-sensitive failure timestamp in media diagnostics.

Keep the resulting directory off the VPS according to your retention policy. If encryption at rest is needed, encrypt the completed directory externally; retain keys separately from the archive.

## Isolated restore rehearsal

Build or obtain the same image tag, then create isolated restore credentials (the command refuses to overwrite an existing file). `compose.restore.yaml` has distinct volumes and binds web to port 3300 by default.

```powershell
npm run restore:prepare-env -- --env-file .env.restore --app-url http://127.0.0.1:3300 --image-tag local --app-version 0.1.0
```

This generates fresh restore-only PostgreSQL and Payload secrets; it never copies production secrets. Both backup and restore now preflight their environment file and name missing or placeholder variables before Compose is invoked.

```powershell
npm run restore:operational -- --archive D:\renegade-backups\renegade-backup-... --target-version 0.1.0 --isolated --authorize-restore --env-file .env.restore
```

Restore refuses any Compose filename not containing `restore`, requires both explicit acknowledgements, verifies every manifest checksum before touching the target, and refuses a database or media target that is not empty. It runs native `pg_restore`, restores media, runs forward Payload migrations, boots web and worker, waits for Compose health, then checks `/health/ready`.

For a rehearsal, seed fixture data and one uploaded/generated file, run backup, remove the isolated volumes, restore, then confirm the fixture through the application and inspect the media file. Test corruption by altering either component or removing an entry from `manifest.json`: restore must fail before mutation.

The repeatable rehearsal command performs that fresh-volume reset, restore, readiness check, and anonymous byte comparison. Supply one published path that exercises content, navigation, redirect, and metadata, plus one public media byte path:

```powershell
npm run restore:rehearsal -- --archive D:\renegade-backups\renegade-backup-... --target-version 0.1.0 --env-file .env.restore --source-url https://cms.example.test --restored-url http://127.0.0.1:3300 --public-path /a-published-post --media-path /api/media/<asset-id>
```

It destroys only the named `renegade-cms-restore` Compose volumes before the run, then requires identical anonymous HTML and media SHA-256 values. The public fixture should include the navigation and a redirect target so the one request proves rendered content, metadata, navigation, and redirect behavior together. Restore now also runs `pg_restore -l` and `tar -tzf` against the archive before Compose creates a target volume; checksums alone are not treated as archive-format proof.

## Lifecycle commands

All commands use the production Compose topology; they do not introduce another deployment system. They emit machine-readable JSON where status or preflight information is useful.

```powershell
# Current Compose services, PostgreSQL, migration ledger, application version, and readiness.
npm run status:operational -- --env-file .env.production

# Inspect an upgrade without changing the running installation.
npm run upgrade:operational -- --target-image-tag 0.1.1 --target-version 0.1.1 --backup D:\renegade-backups\renegade-backup-... --preflight --env-file .env.production

# Pull the selected image, take the supplied pre-upgrade backup or create one, stop writers,
# run migrations once, start web/worker, and verify their health.
npm run upgrade:operational -- --target-image-tag 0.1.1 --target-version 0.1.1 --backup-output D:\renegade-backups --maintenance-window-confirmed --env-file .env.production
```

Use an immutable release tag (or a tag controlled by your release process) and pass the matching SemVer release as `--target-version`. Renegade does not claim zero-downtime upgrades: the command intentionally stops web and worker while it protects data and applies migrations. A preflight validates Compose, captures the current ledger/service state, validates an existing backup when supplied, and prints the single migration-phase plan; it never pulls, stops, or migrates.

The migration ledger is the rollback boundary. Image rollback is permitted only if the ledger still exactly matches the pre-upgrade backup; it never runs down migrations. If the upgrade added a migration, restore the pre-upgrade archive into the isolated recovery target instead of attempting an image rollback.

```powershell
# Only safe when the migration ledger is unchanged.
npm run rollback:operational -- --pre-upgrade-backup D:\renegade-backups\renegade-backup-... --target-image-tag 0.1.0 --target-version 0.1.0 --allow-image-rollback --maintenance-window-confirmed --env-file .env.production

# Intentional maintenance mode stops web and worker while PostgreSQL remains available.
npm run maintenance:operational -- --enable --maintenance-window-confirmed --env-file .env.production
npm run maintenance:operational -- --disable --env-file .env.production
```

Operational archives deliberately exclude `.env` files, `PAYLOAD_SECRET`, PostgreSQL passwords, provider/OAuth credentials, and archive keys. Keep those in the operator's secret manager and provide fresh appropriate values to an isolated restore environment. Portable user exports are a separate AES-GCM interchange format and reject secret-shaped fields, including provider secrets; they are never a substitute for an appliance backup.

## Validation evidence

Recorded 2026-08-29 in this checkout:

- `npm test` passed: 38 test files, 147 tests. This includes manifest construction, corrupted database/media checksum rejection, unsupported/secret-shaped manifests, isolated-target guards, version compatibility, destructive-operation confirmation, and the one-migration upgrade plan.
- `npm run typecheck` passed.
- Docker Engine `29.3.1` and Docker Compose `v5.1.0` were available. A disposable rehearsal was not run because the fixed `renegade-cms` Compose project already contained a running PostgreSQL service; the operational scripts intentionally address that project and running them would have risked the existing installation. No existing service, volume, or archive was changed. The two temporary test environment files were removed.
