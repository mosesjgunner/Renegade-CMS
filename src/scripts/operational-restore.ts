import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { assertRestoreSafety, verifyOperationalBackup } from '../modules/operations/backup'
import { assertRestoreVersionCompatibility } from '../modules/operations/lifecycle'
import { assertOperationalEnv } from './operational-env'

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
const composeArgs = ['compose', '--env-file', envFile, '-f', compose]
await assertOperationalEnv(envFile)
function run(commandArgs: string[], inputFile?: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('docker', commandArgs, {
      stdio: [inputFile ? 'pipe' : 'inherit', 'inherit', 'inherit'],
    })
    if (inputFile) createReadStream(inputFile).pipe(child.stdin!)
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
await run(
  ['run', '--rm', '-i', 'postgres:17.6-alpine', 'pg_restore', '-l'],
  path.join(root, 'database.dump'),
)
await run(
  ['run', '--rm', '-i', '--entrypoint', 'tar', appImage, '-tzf', '-'],
  path.join(root, 'media.tar.gz'),
)
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
await run(
  [
    ...composeArgs,
    'exec',
    '-T',
    'postgres',
    'pg_restore',
    '-U',
    'renegade',
    '-d',
    'renegade',
    '--no-owner',
    '--no-privileges',
  ],
  path.join(root, 'database.dump'),
)
await run(
  [
    ...composeArgs,
    'run',
    '--rm',
    '--no-deps',
    '--entrypoint',
    'tar',
    'renegade-web',
    '-C',
    '/app/media',
    '-xzf',
    '-',
  ],
  path.join(root, 'media.tar.gz'),
)

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
