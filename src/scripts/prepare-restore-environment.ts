import { randomBytes } from 'node:crypto'
import { access, writeFile } from 'node:fs/promises'
import path from 'node:path'

const args = process.argv.slice(2)
const value = (name: string, fallback?: string) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const envFile = path.resolve(value('--env-file', '.env.restore')!)
const appUrl = value('--app-url', 'http://127.0.0.1:3300')!
const imageTag = value('--image-tag', 'local')!
const version = value('--app-version', '0.1.0')!
if (!URL.canParse(appUrl)) throw new Error('--app-url must be a complete isolated URL.')
try {
  await access(envFile)
  throw new Error(`${envFile} already exists; refusing to overwrite restore credentials.`)
} catch (error: unknown) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
}
const postgresPassword = randomBytes(24).toString('base64url')
const payloadSecret = randomBytes(48).toString('base64url')
await writeFile(
  envFile,
  [
    '# Generated only for the isolated renegade-cms-restore Compose project.',
    '# Do not copy production credentials here; keep this file out of version control.',
    `POSTGRES_PASSWORD=${postgresPassword}`,
    `PAYLOAD_SECRET=${payloadSecret}`,
    `APP_URL=${appUrl}`,
    'PROXY_MODE=direct',
    'TRUSTED_PROXY_HOPS=1',
    'RENEGADE_RESTORE_WEB_BIND=127.0.0.1:3300',
    `RENEGADE_IMAGE_TAG=${imageTag}`,
    `APP_VERSION=${version}`,
    '',
  ].join('\n'),
  { mode: 0o600 },
)
console.log(`Created isolated restore environment: ${envFile}`)
