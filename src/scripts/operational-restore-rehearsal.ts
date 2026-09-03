import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const args = process.argv.slice(2)
const value = (name: string, fallback?: string) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const archive = value('--archive')
const targetVersion = value('--target-version')
const envFile = value('--env-file', '.env.restore')!
const sourceUrl = value('--source-url')
const restoredUrl = value('--restored-url')
const publicPath = value('--public-path')
const mediaPath = value('--media-path')
if (!archive || !targetVersion || !sourceUrl || !restoredUrl || !publicPath || !mediaPath)
  throw new Error(
    'Usage: tsx src/scripts/operational-restore-rehearsal.ts --archive <directory> --target-version <semver> --source-url <url> --restored-url <url> --public-path </post> --media-path <media file path> [--env-file .env.restore]',
  )

function run(command: string, commandArgs: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: 'inherit' })
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} ${commandArgs.join(' ')} failed (${code})`)),
    )
  })
}
const sha256 = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
const get = async (origin: string, pathname: string) => {
  const response = await fetch(new URL(pathname, origin))
  if (!response.ok)
    throw new Error(`Anonymous fetch failed for ${new URL(pathname, origin)} (${response.status}).`)
  return new Uint8Array(await response.arrayBuffer())
}

// A disposable restore project is the only target accepted by restore. Down
// with --volumes makes every rehearsal begin from genuinely fresh DB/media.
await run('docker', [
  'compose',
  '--env-file',
  envFile,
  '-f',
  'compose.restore.yaml',
  'down',
  '--volumes',
  '--remove-orphans',
])
await run('npm', [
  'run',
  'restore:operational',
  '--',
  '--archive',
  path.resolve(archive),
  '--target-version',
  targetVersion,
  '--isolated',
  '--authorize-restore',
  '--env-file',
  envFile,
])
const [sourceHtml, restoredHtml, sourceMedia, restoredMedia] = await Promise.all([
  get(sourceUrl, publicPath),
  get(restoredUrl, publicPath),
  get(sourceUrl, mediaPath),
  get(restoredUrl, mediaPath),
])
if (sha256(sourceHtml) !== sha256(restoredHtml))
  throw new Error('Restore rehearsal public HTML differs from source.')
if (sha256(sourceMedia) !== sha256(restoredMedia))
  throw new Error('Restore rehearsal media bytes differ from source.')
const manifest = JSON.parse(
  await readFile(path.join(path.resolve(archive), 'manifest.json'), 'utf8'),
) as {
  migrationState: string[]
}
console.log(
  JSON.stringify(
    {
      state: 'completed',
      verified: [
        'fresh-database',
        'fresh-media-volume',
        'readiness',
        'anonymous-html',
        'byte-identical-media',
      ],
      publicPath,
      mediaPath,
      migrationCount: manifest.migrationState.length,
      htmlSha256: sha256(sourceHtml),
      mediaSha256: sha256(sourceMedia),
    },
    null,
    2,
  ),
)
