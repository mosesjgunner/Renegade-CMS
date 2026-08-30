import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createReadStream, createWriteStream } from 'node:fs'
import {
  createOperationalBackupManifest,
  verifyOperationalBackup,
} from '../modules/operations/backup'

const args = process.argv.slice(2)
const value = (name: string, fallback?: string) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const has = (name: string) => args.includes(name)
const output = value('--output')
if (!output || !has('--maintenance-window-confirmed'))
  throw new Error(
    'Usage: backup:operational -- --output <directory> --maintenance-window-confirmed [--env-file .env.production]',
  )
const compose = value('--compose-file', 'compose.production.yaml')!
const envFile = value('--env-file', '.env.production')!
const backupRoot = path.resolve(
  output,
  `renegade-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`,
)
const composeArgs = ['compose', '--env-file', envFile, '-f', compose]

function run(command: string, commandArgs: string[], outputFile?: string, inputFile?: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: [inputFile ? 'pipe' : 'inherit', outputFile ? 'pipe' : 'inherit', 'inherit'],
    })
    if (outputFile) child.stdout!.pipe(createWriteStream(outputFile))
    if (inputFile) createReadStream(inputFile).pipe(child.stdin!)
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} ${commandArgs.join(' ')} failed (${code})`)),
    )
  })
}
async function capture(commandArgs: string[]) {
  return await new Promise<string>((resolve, reject) => {
    let text = ''
    const child = spawn('docker', commandArgs, { stdio: ['ignore', 'pipe', 'inherit'] })
    child.stdout.on('data', (chunk) => {
      text += String(chunk)
    })
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0
        ? resolve(text.trim())
        : reject(new Error(`docker ${commandArgs.join(' ')} failed (${code})`)),
    )
  })
}

let stopped = false
try {
  await mkdir(backupRoot, { recursive: false })
  // This explicit quiesce window prevents writes between the native DB dump and media capture.
  await run('docker', [...composeArgs, 'stop', 'renegade-web', 'renegade-worker'])
  stopped = true
  await run(
    'docker',
    [
      ...composeArgs,
      'exec',
      '-T',
      'postgres',
      'pg_dump',
      '-U',
      'renegade',
      '-Fc',
      '-d',
      'renegade',
    ],
    path.join(backupRoot, 'database.dump'),
  )
  await run(
    'docker',
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
      '-czf',
      '-',
      '.',
    ],
    path.join(backupRoot, 'media.tar.gz'),
  )
  const [postgresVersion, migrationText, applicationVersion, buildSha, imageTag] =
    await Promise.all([
      capture([
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
        'SHOW server_version',
      ]),
      capture([
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
        'SELECT name FROM payload_migrations ORDER BY name',
      ]),
      capture([
        ...composeArgs,
        'run',
        '--rm',
        '--no-deps',
        '--entrypoint',
        'printenv',
        'renegade-web',
        'APP_VERSION',
      ]),
      capture([
        ...composeArgs,
        'run',
        '--rm',
        '--no-deps',
        '--entrypoint',
        'printenv',
        'renegade-web',
        'BUILD_SHA',
      ]),
      capture([
        ...composeArgs,
        'run',
        '--rm',
        '--no-deps',
        '--entrypoint',
        'printenv',
        'renegade-web',
        'RENEGADE_IMAGE_TAG',
      ]),
    ])
  const manifest = await createOperationalBackupManifest(backupRoot, {
    createdAt: new Date().toISOString(),
    renegade: {
      version: applicationVersion,
      buildSha: buildSha || null,
    },
    postgresql: { version: postgresVersion },
    consistency: { mode: 'maintenance-window', confirmedAt: new Date().toISOString() },
    includedComponents: [
      'postgresql-data',
      'media-and-local-generated-assets',
      'db-extension-and-capability-state',
      'non-secret-installation-metadata',
    ],
    migrationState: migrationText ? migrationText.split(/\r?\n/).filter(Boolean) : [],
    installation: {
      storageDriver: 'local',
      mediaDir: '/app/media',
      imageTag: imageTag || null,
    },
  })
  await writeFile(
    path.join(backupRoot, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  )
  await verifyOperationalBackup(backupRoot)
  await run(
    'docker',
    [...composeArgs, 'exec', '-T', 'postgres', 'pg_restore', '-l'],
    undefined,
    path.join(backupRoot, 'database.dump'),
  )
  await run(
    'docker',
    [
      ...composeArgs,
      'run',
      '--rm',
      '--no-deps',
      '--entrypoint',
      'tar',
      'renegade-web',
      '-tzf',
      '-',
    ],
    undefined,
    path.join(backupRoot, 'media.tar.gz'),
  )
  const status = JSON.stringify({
    status: 'healthy',
    lastSuccessfulAt: new Date().toISOString(),
    backupFormat: 'renegade-operational-backup',
    verified: true,
  })
  await run('docker', [
    ...composeArgs,
    'run',
    '--rm',
    '--no-deps',
    '--entrypoint',
    'node',
    'renegade-web',
    '-e',
    `require('node:fs').mkdirSync('/app/media/.renegade',{recursive:true});require('node:fs').writeFileSync('/app/media/.renegade/backup-status.json',${JSON.stringify(status)})`,
  ])
  console.log(`Operational backup verified: ${backupRoot}`)
} catch (error) {
  await rm(backupRoot, { recursive: true, force: true })
  const failure = JSON.stringify({
    status: 'failed',
    lastFailureAt: new Date().toISOString(),
    backupFormat: 'renegade-operational-backup',
  })
  await run('docker', [
    ...composeArgs,
    'run',
    '--rm',
    '--no-deps',
    '--entrypoint',
    'node',
    'renegade-web',
    '-e',
    `require('node:fs').mkdirSync('/app/media/.renegade',{recursive:true});require('node:fs').writeFileSync('/app/media/.renegade/backup-status.json',${JSON.stringify(failure)})`,
  ]).catch(() => undefined)
  throw error
} finally {
  if (stopped)
    await run('docker', [...composeArgs, 'up', '-d', 'renegade-web', 'renegade-worker']).catch(
      () => undefined,
    )
}
