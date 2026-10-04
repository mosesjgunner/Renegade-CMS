import { Client } from 'pg'
import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'

// Load the existing connection only to create a NEW database. Never reset it.
const database = new URL(process.env.DATABASE_URL)
database.pathname = '/postgres'
const name = `renegade_rc01_${Date.now()}_release_acceptance`
const client = new Client({ connectionString: database.href })
await client.connect()
try {
  await client.query(`CREATE DATABASE "${name}"`)
} finally {
  await client.end()
}
database.pathname = `/${name}`
mkdirSync('scratch', { recursive: true })
writeFileSync(
  '.env.rc01',
  [
    `DATABASE_URL=${database.href}`,
    `PAYLOAD_SECRET=${randomBytes(48).toString('hex')}`,
    'APP_URL=http://localhost:3127',
    'PORT=3127',
    'HOSTNAME=localhost',
    'NODE_ENV=development',
    'DEPLOYMENT_PROFILE=Standard',
    'RENEGADE_MODULES=all',
    'RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT=false',
    'LOCAL_E2E_TEST_MODE=false',
    'ENABLE_TEST_ROUTES=false',
    'MEDIA_DIR=./scratch/rc01-media',
    'EMAIL_MODE=disabled',
    '',
  ].join('\n'),
)
console.log(`Created disposable database ${name}; migrate before browser acceptance.`)
