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

Copy `.env.production.example` to `.env.restore`, set fresh secrets and an isolated URL/port, then build or obtain the same image tag. `compose.restore.yaml` has distinct volumes and binds web to port 3300 by default.

```powershell
npm run restore:operational -- --archive D:\renegade-backups\renegade-backup-... --isolated --authorize-restore --env-file .env.restore
```

Restore refuses any Compose filename not containing `restore`, requires both explicit acknowledgements, verifies every manifest checksum before touching the target, and refuses a database or media target that is not empty. It runs native `pg_restore`, restores media, runs forward Payload migrations, boots web and worker, waits for Compose health, then checks `/health/ready`.

For a rehearsal, seed fixture data and one uploaded/generated file, run backup, remove the isolated volumes, restore, then confirm the fixture through the application and inspect the media file. Test corruption by altering either component or removing an entry from `manifest.json`: restore must fail before mutation.
