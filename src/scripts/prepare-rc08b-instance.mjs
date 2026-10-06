import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { Client } from 'pg'

const env = Object.fromEntries(
  readFileSync('.env.rc02', 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')]
    }),
)
const url = new URL(env.DATABASE_URL)
const template = url.pathname.slice(1)
if (!/^renegade_rc02_\d+_release_acceptance$/.test(template))
  throw Error('Disposable RC02 template required')
const adminLine = readFileSync('.env', 'utf8')
  .split(/\r?\n/)
  .find((line) => line.startsWith('DATABASE_URL='))
if (!adminLine) throw Error('Admin DATABASE_URL unavailable')
const admin = new URL(adminLine.slice('DATABASE_URL='.length).replace(/^"|"$/g, ''))
admin.pathname = '/postgres'
const client = new Client({ connectionString: admin.href })
const integration = process.argv.includes('--integration')
const name = `renegade_rc08b_${Date.now()}_release_acceptance`
await client.connect()
try {
  await client.query(
    `CREATE DATABASE "${name}" WITH TEMPLATE "${template}" OWNER "${url.username}"`,
  )
} finally {
  await client.end()
}
url.pathname = '/' + name
Object.assign(env, {
  DATABASE_URL: url.href,
  RENEGADE_MODULES: 'all',
  RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT: 'true',
  EMAIL_MODE: integration ? 'development' : 'smtp',
  EMAIL_FROM: 'newsletter@renegadeparty.test',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '3132',
  SMTP_SECURE: 'false',
  TELECOM_MODE: 'disabled',
  TELECOM_ALLOW_OUTBOUND: 'false',
})
if (integration) Object.assign(env, { NODE_ENV: 'test', ALLOW_FIXTURE_SEED: 'true' })
writeFileSync(
  integration ? '.env.rc08b-integration' : '.env.rc08b',
  Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n',
)
mkdirSync('docs/rc/evidence/rc-08b', { recursive: true })
writeFileSync(
  `docs/rc/evidence/rc-08b/${integration ? 'integration-' : ''}fixture.json`,
  JSON.stringify(
    {
      database: name,
      template,
      originalPreserved: true,
      freshInstall: false,
      purpose: 'Completed RC02 publication copy; additive migrations only',
    },
    null,
    2,
  ) + '\n',
)
console.log(`Created isolated acceptance copy: ${name}`)
