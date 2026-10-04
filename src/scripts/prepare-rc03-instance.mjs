import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { Client } from 'pg'
const env = Object.fromEntries(
  readFileSync('.env.rc02', 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i), line.slice(i + 1)]
    }),
)
const url = new URL(env.DATABASE_URL)
const template = url.pathname.slice(1)
if (!template.startsWith('renegade_rc02_') || !template.endsWith('_release_acceptance'))
  throw Error('RC02 fixture required')
const adminEnv = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.includes('='))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')]
    }),
)
const admin = new URL(adminEnv.DATABASE_URL)
admin.pathname = '/postgres'
const client = new Client({ connectionString: admin.href })
await client.connect()
const integration = process.argv.includes('--integration')
const name = `renegade_rc03_${Date.now()}_release_acceptance`
await client.query(`CREATE DATABASE "${name}" WITH TEMPLATE "${template}" OWNER "${url.username}"`)
await client.end()
url.pathname = '/' + name
env.DATABASE_URL = url.href
if (integration) {
  env.NODE_ENV = 'test'
  env.ALLOW_FIXTURE_SEED = 'true'
}
env.SOCIAL_BLUESKY_RC03_GOOD_IDENTIFIER = 'good.test'
env.SOCIAL_BLUESKY_RC03_GOOD_APP_PASSWORD = 'fixture-password'
env.SOCIAL_BLUESKY_RC03_GOOD_SERVICE = 'http://127.0.0.1:3130'
env.SOCIAL_BLUESKY_RC03_BAD_IDENTIFIER = 'bad.test'
env.SOCIAL_BLUESKY_RC03_BAD_APP_PASSWORD = 'fixture-password'
env.SOCIAL_BLUESKY_RC03_BAD_SERVICE = 'http://127.0.0.1:3130'
writeFileSync(
  integration ? '.env.rc03-integration' : '.env.rc03',
  Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n',
)
mkdirSync('docs/rc/evidence/rc-03', { recursive: true })
writeFileSync(
  integration
    ? 'docs/rc/evidence/rc-03/integration-fixture.json'
    : 'docs/rc/evidence/rc-03/fixture.json',
  JSON.stringify({ template, database: name, originalPreserved: true }, null, 2),
)
console.log(name)
