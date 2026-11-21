/**
 * RC3-05 operational backup, driven through the product's own code where
 * the product has code: the bundle layout, manifest construction and
 * checksum verification are `src/modules/operations/backup.ts`, used
 * unmodified — the same functions `src/scripts/operational-backup.ts`
 * calls. The only substitution is transport: the shipped script shells
 * out to `docker compose exec` (no Docker daemon exists in this sandbox),
 * so host `pg_dump`/`tar` binaries produce the two components with the
 * exact flags and excludes the script uses inside the containers.
 *
 * Env: DATABASE_URL, MEDIA_DIR, APP_VERSION, BUILD_SHA,
 * RC305_BACKUP_PARENT, RC305_TIMING_OUT.
 */
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { Client } from 'pg'

import {
  createOperationalBackupManifest,
  verifyOperationalBackup,
} from '../../src/modules/operations/backup'

const databaseUrl = process.env.DATABASE_URL
const mediaDir = process.env.MEDIA_DIR
const parent = process.env.RC305_BACKUP_PARENT
const timingOut = process.env.RC305_TIMING_OUT
if (!databaseUrl || !mediaDir || !parent || !timingOut)
  throw new Error('Set DATABASE_URL, MEDIA_DIR, RC305_BACKUP_PARENT and RC305_TIMING_OUT.')

const startedAt = new Date()
const backupRoot = path.resolve(
  parent,
  `renegade-backup-${startedAt.toISOString().replace(/[:.]/g, '-')}`,
)

const run = (command: string, args: string[]) => {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} failed (${result.status ?? result.signal})`)
}

await mkdir(parent, { recursive: true })
await mkdir(backupRoot, { recursive: false })

run('pg_dump', ['-Fc', '-d', databaseUrl, '-f', path.join(backupRoot, 'database.dump')])
run('tar', [
  '-C',
  mediaDir,
  '--exclude=./.upload-sessions',
  '--exclude=.upload-sessions',
  '--exclude=./.renegade/backup-status.json',
  '--exclude=.renegade/backup-status.json',
  '-czf',
  path.join(backupRoot, 'media.tar.gz'),
  '.',
])

const client = new Client({ connectionString: databaseUrl })
await client.connect()
const versionRows = await client.query('SHOW server_version')
const migrationRows = await client.query('SELECT name FROM payload_migrations ORDER BY name')
await client.end()

const manifest = await createOperationalBackupManifest(backupRoot, {
  createdAt: new Date().toISOString(),
  renegade: {
    version: process.env.APP_VERSION ?? '0.1.0',
    buildSha: process.env.BUILD_SHA ?? null,
  },
  postgresql: { version: String(versionRows.rows[0].server_version) },
  consistency: { mode: 'maintenance-window', confirmedAt: new Date().toISOString() },
  includedComponents: [
    'postgresql-data',
    'media-and-local-generated-assets',
    'db-extension-and-capability-state',
    'non-secret-installation-metadata',
  ],
  destination: { kind: 'local-disk' },
  migrationState: migrationRows.rows.map((row) => String(row.name)),
  installation: { storageDriver: 'local', mediaDir, imageTag: null },
})
await writeFile(path.join(backupRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
  mode: 0o600,
})
await verifyOperationalBackup(backupRoot)
run('pg_restore', ['-l', path.join(backupRoot, 'database.dump')])
run('tar', ['-tzf', path.join(backupRoot, 'media.tar.gz')])

const status = JSON.stringify({
  status: 'healthy',
  lastSuccessfulAt: new Date().toISOString(),
  backupFormat: 'renegade-operational-backup',
  verified: true,
  destinationKind: 'local-disk',
  coverage: manifest.coverage ?? null,
})
await mkdir(path.join(mediaDir, '.renegade'), { recursive: true })
await writeFile(path.join(mediaDir, '.renegade', 'backup-status.json'), status)

const finishedAt = new Date()
await writeFile(
  timingOut,
  `${JSON.stringify(
    {
      bundleRoot: backupRoot,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      totals: manifest.totals,
    },
    null,
    2,
  )}\n`,
)
console.log(`RC305-BACKUP-OK ${backupRoot}`)
process.exit(0)
