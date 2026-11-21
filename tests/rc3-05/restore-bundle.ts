/**
 * RC3-05 operational restore preflight + restore, following the exact
 * order of `src/scripts/operational-restore.ts`: verify the bundle with
 * the product's own `verifyOperationalBackup` and version-compatibility
 * check, prove both archive formats (`pg_restore -l`, `tar -tzf`), refuse
 * a non-empty database or media target — all before any target mutation —
 * then `pg_restore --no-owner --no-privileges` and untar the media.
 * Host binaries stand in for the script's `docker compose exec/run`
 * transport (no Docker daemon in this sandbox); migrations afterwards
 * run through the product's `npm run db:migrate`.
 *
 * Env: DATABASE_URL (target), MEDIA_DIR (target), RC305_BUNDLE,
 * RC305_TARGET_VERSION, RC305_TIMING_OUT.
 */
import { spawnSync } from 'node:child_process'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { Client } from 'pg'

import { verifyOperationalBackup } from '../../src/modules/operations/backup'
import { assertRestoreVersionCompatibility } from '../../src/modules/operations/lifecycle'

const databaseUrl = process.env.DATABASE_URL
const mediaDir = process.env.MEDIA_DIR
const bundle = process.env.RC305_BUNDLE
const targetVersion = process.env.RC305_TARGET_VERSION
const timingOut = process.env.RC305_TIMING_OUT
if (!databaseUrl || !mediaDir || !bundle || !targetVersion || !timingOut)
  throw new Error(
    'Set DATABASE_URL, MEDIA_DIR, RC305_BUNDLE, RC305_TARGET_VERSION and RC305_TIMING_OUT.',
  )

const startedAt = new Date()
const root = path.resolve(bundle)

const run = (command: string, args: string[]) => {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} failed (${result.status ?? result.signal})`)
}

// 1-2. Product preflight: checksums + version compatibility, before mutation.
const manifest = await verifyOperationalBackup(root)
assertRestoreVersionCompatibility({
  archiveVersion: manifest.renegade.version,
  targetVersion,
})

// 3. Archive-format proof for both components.
run('pg_restore', ['-l', path.join(root, 'database.dump')])
run('tar', ['-tzf', path.join(root, 'media.tar.gz')])

// 4. Empty-target refusals, mirroring the shipped restore script.
const client = new Client({ connectionString: databaseUrl })
await client.connect()
const tableRows = await client.query(
  "SELECT count(*)::int AS count FROM pg_tables WHERE schemaname = 'public'",
)
await client.end()
if (Number(tableRows.rows[0].count) !== 0)
  throw new Error('Restore refuses a database target that is not empty.')
await mkdir(mediaDir, { recursive: true })
if ((await readdir(mediaDir)).length !== 0)
  throw new Error('Restore refuses a media target that is not empty.')

// 5. Restore database + media.
run('pg_restore', [
  '--no-owner',
  '--no-privileges',
  '-d',
  databaseUrl,
  path.join(root, 'database.dump'),
])
// --no-same-owner: this sandbox runs as root but denies chown, and tar
// exits 2 on the ownership restore alone (contents extract intact). In
// the shipped container flow tar runs as the image user; ownership
// mapping is a transport concern, the bytes are what the manifest checks.
run('tar', ['--no-same-owner', '-C', mediaDir, '-xzf', path.join(root, 'media.tar.gz')])

const finishedAt = new Date()
await writeFile(
  timingOut,
  `${JSON.stringify(
    {
      bundleRoot: root,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      manifestTotals: manifest.totals,
    },
    null,
    2,
  )}\n`,
)
console.log(`RC305-RESTORE-OK ${root}`)
process.exit(0)
