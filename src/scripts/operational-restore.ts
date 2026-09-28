import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { assertRestoreSafety, verifyOperationalBackup } from '../modules/operations/backup'
import { assertRestoreVersionCompatibility } from '../modules/operations/lifecycle'
import { assertOperationalEnv } from './operational-env'
import { projectNameFromEnvFile } from './operational-compose'

const args = process.argv.slice(2)
const value = (name: string, fallback?: string) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const archive = value('--archive')
const targetVersion = value('--target-version')
const compose = value('--compose-file', 'compose.restore.yaml')!
const envFile = value('--env-file', '.env.restore')!
if (!archive || !targetVersion)
  throw new Error(
    'Usage: restore:operational -- --archive <directory> --target-version <semver> --isolated --authorize-restore',
  )
assertRestoreSafety({
  isolated: args.includes('--isolated'),
  authorized: args.includes('--authorize-restore'),
  composeFile: compose,
})
const root = path.resolve(archive)
const composeArgs = [
  'compose',
  '--project-name',
  projectNameFromEnvFile(envFile, 'RENEGADE_RESTORE_INSTANCE', 'renegade-cms-restore'),
  '--env-file',
  envFile,
  '-f',
  compose,
]
await assertOperationalEnv(envFile)
function run(commandArgs: string[], inputFile?: string, quiet = false) {
  return new Promise<void>((resolve, reject) => {
    const input = inputFile ? createReadStream(inputFile) : undefined
    const child = spawn('docker', commandArgs, {
      stdio: [inputFile ? 'pipe' : 'ignore', quiet ? 'pipe' : 'inherit', 'inherit'],
    })
    if (quiet) child.stdout!.resume()
    if (input) {
      input.on('error', reject)
      child.stdin!.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EPIPE' && commandArgs.includes('--section=data')) return
        if (error.code !== 'EPIPE') reject(error)
      })
      input.pipe(child.stdin!)
    }
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`docker ${commandArgs.join(' ')} failed (${code})`)),
    )
  })
}
function capture(commandArgs: string[]) {
  return new Promise<string>((resolve, reject) => {
    let text = ''
    const child = spawn('docker', commandArgs, { stdio: ['ignore', 'pipe', 'inherit'] })
    child.stdout.on('data', (chunk) => (text += String(chunk)))
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0
        ? resolve(text.trim())
        : reject(new Error(`docker ${commandArgs.join(' ')} failed (${code})`)),
    )
  })
}

const manifest = await verifyOperationalBackup(root)
assertRestoreVersionCompatibility({
  archiveVersion: manifest.renegade.version,
  targetVersion,
})
// Validate both archive formats before Compose creates a target volume or starts
// PostgreSQL. Checksums catch accidental corruption; these readers also catch a
// deliberately malformed archive whose manifest was regenerated incorrectly.
const images = (await capture([...composeArgs, 'config', '--images']))
  .split(/\r?\n/)
  .filter(Boolean)
const appImage = images.find((image) => !image.startsWith('postgres:'))
if (!appImage) throw new Error('Restore could not determine the isolated application image.')
await validateArchiveFiles()
const running = await capture([...composeArgs, 'ps', '--status', 'running', '--services'])
if (
  running
    .split(/\r?\n/)
    .some((service) => service === 'renegade-web' || service === 'renegade-worker')
)
  throw new Error('Restore refuses an isolated target with an application service already running.')
await run([...composeArgs, 'up', '-d', '--wait', 'postgres'])
const tableCount = await capture([
  ...composeArgs,
  'exec',
  '-T',
  'postgres',
  'psql',
  '-U',
  'renegade',
  '-d',
  'renegade',
  '-Atc',
  "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'",
])
if (Number(tableCount) !== 0)
  throw new Error('Restore refuses a database target that is not empty.')
const mediaFiles = await capture([
  ...composeArgs,
  'run',
  '--rm',
  '--no-deps',
  '--entrypoint',
  'sh',
  'renegade-web',
  '-c',
  'find /app/media -mindepth 1 -print -quit',
])
if (mediaFiles) throw new Error('Restore refuses a media target that is not empty.')
const restorePostgres = await capture([...composeArgs, 'ps', '-q', 'postgres'])
await run(['cp', path.join(root, 'database.dump'), `${restorePostgres}:/tmp/renegade-restore.dump`])
await run(
  [
    ...composeArgs,
    'run',
    '--rm',
    '--no-deps',
    '--entrypoint',
    'sh',
    'renegade-web',
    '-c',
    'cat > /tmp/renegade-restore-media.tar.gz && tar -xzf /tmp/renegade-restore-media.tar.gz -C /app/media',
  ],
  path.join(root, 'media.tar.gz'),
)
await run([
  ...composeArgs,
  'exec',
  '-T',
  'postgres',
  'pg_restore',
  '-U',
  'renegade',
  '-d',
  'renegade',
  '--section=pre-data',
  '--no-owner',
  '--no-privileges',
  '/tmp/renegade-restore.dump',
])
await run([
  ...composeArgs,
  'exec',
  '-T',
  'postgres',
  'pg_restore',
  '-U',
  'renegade',
  '-d',
  'renegade',
  '--disable-triggers',
  '--exit-on-error',
  '--section=data',
  '--no-owner',
  '--no-privileges',
  '/tmp/renegade-restore.dump',
])
const orphanSiteIDs = await capture([
  ...composeArgs,
  'exec',
  '-T',
  'postgres',
  'psql',
  '-U',
  'renegade',
  '-d',
  'renegade',
  '-Atc',
  'SELECT DISTINCT e.site_id FROM activity_events e LEFT JOIN sites s ON s.id = e.site_id WHERE e.site_id IS NOT NULL AND s.id IS NULL',
])
const missingSiteIDs = orphanSiteIDs.split(/\r?\n/).filter(Boolean)
async function validateArchiveFiles() {
  await run(
    [
      'run',
      '--rm',
      '--entrypoint',
      'sh',
      '-v',
      `${root}:/backup:ro`,
      'postgres:17.6-alpine',
      '-c',
      'pg_restore -l /backup/database.dump >/dev/null && tar -tzf /backup/media.tar.gz >/dev/null',
    ],
    undefined,
    true,
  )
}
if (missingSiteIDs.length)
  throw new Error(
    `Restore stopped: ${missingSiteIDs.length} distinct activity-event site references have no matching site. Repair the source records and take a fresh backup before restoring.`,
  )
const orphanUserCheck = await capture([
  ...composeArgs,
  'exec',
  '-T',
  'postgres',
  'psql',
  '-U',
  'renegade',
  '-d',
  'renegade',
  '-Atc',
  'SELECT (SELECT count(*) FROM admin_auth_audit_events e LEFT JOIN users u ON u.id=e.user_id WHERE e.user_id IS NOT NULL AND u.id IS NULL), (SELECT count(*) FROM admin_sessions s LEFT JOIN users u ON u.id=s.user_id WHERE s.user_id IS NOT NULL AND u.id IS NULL AND s.revoked_at IS NULL), (SELECT count(*) FROM admin_sessions s LEFT JOIN users u ON u.id=s.user_id WHERE s.user_id IS NOT NULL AND u.id IS NULL AND s.revoked_at IS NOT NULL)',
])
const [orphanAuditUsers, activeOrphanSessions, revokedOrphanSessions] = orphanUserCheck
  .split('|')
  .map(Number)
if (orphanAuditUsers > 0 || activeOrphanSessions > 0 || revokedOrphanSessions > 0)
  throw new Error(
    `Restore stopped before constraints: ${orphanAuditUsers} audit rows reference missing users, ${activeOrphanSessions} active sessions reference missing users, and ${revokedOrphanSessions} revoked sessions reference missing users. Repair the source records and take a fresh backup; restore will not remap audit history or discard sessions.`,
  )
if (activeOrphanSessions > 0)
  throw new Error(
    `Restore stopped: ${activeOrphanSessions} active admin session rows reference missing users. Repair the source records before backup; active sessions are never discarded by restore.`,
  )
await run([
  ...composeArgs,
  'exec',
  '-T',
  'postgres',
  'pg_restore',
  '-U',
  'renegade',
  '-d',
  'renegade',
  '--exit-on-error',
  '--section=post-data',
  '--no-owner',
  '--no-privileges',
  '/tmp/renegade-restore.dump',
])
await run([...composeArgs, 'run', '--rm', 'migrate'])
await run([...composeArgs, 'up', '-d', '--wait', 'renegade-web', 'renegade-worker'])
await run([
  ...composeArgs,
  'exec',
  '-T',
  'renegade-web',
  'node',
  '-e',
  "fetch('http://127.0.0.1:3000/health/ready').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))",
])
console.log(`Operational restore verified: ${root}`)
