import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { Client } from 'pg'

const readEnv = (file) =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const at = line.indexOf('=')
        return [line.slice(0, at), line.slice(at + 1).replace(/^"|"$/g, '')]
      }),
  )
const env = readEnv('.env.rc02')
const database = new URL(env.DATABASE_URL)
const template = database.pathname.slice(1)
if (!/^renegade_rc02_\d+_release_acceptance$/.test(template))
  throw Error('Disposable RC02 template required')
const admin = new URL(readEnv('.env').DATABASE_URL)
admin.pathname = '/postgres'
const client = new Client({ connectionString: admin.href })
await client.connect()
const name = `renegade_rc04_${Date.now()}_release_acceptance`
try {
  await client.query(
    process.argv.includes('--integration')
      ? `CREATE DATABASE "${name}" OWNER "${database.username}"`
      : `CREATE DATABASE "${name}" WITH TEMPLATE "${template}" OWNER "${database.username}"`,
  )
} finally {
  await client.end()
}
database.pathname = '/' + name
Object.assign(env, {
  DATABASE_URL: database.href,
  EMAIL_MODE: 'smtp',
  EMAIL_FROM: 'newsletter@renegadeparty.test',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '3132',
  SMTP_SECURE: 'false',
  TELECOM_MODE: 'emulator',
})
if (process.argv.includes('--integration'))
  Object.assign(env, { NODE_ENV: 'test', ALLOW_FIXTURE_SEED: 'true', EMAIL_MODE: 'development' })
const target = process.argv.includes('--integration') ? '.env.rc04-integration' : '.env.rc04'
writeFileSync(
  target,
  Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n',
)
mkdirSync('docs/rc/evidence/rc-04', { recursive: true })
writeFileSync(
  `docs/rc/evidence/rc-04/${process.argv.includes('--integration') ? 'integration-' : ''}fixture.json`,
  JSON.stringify(
    {
      template: process.argv.includes('--integration') ? null : template,
      database: name,
      originalPreserved: true,
      freshInstall: process.argv.includes('--integration'),
    },
    null,
    2,
  ),
)
console.log(`Created isolated acceptance copy: ${name}`)
