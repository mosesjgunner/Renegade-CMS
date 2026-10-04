import { Client } from 'pg'
import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Load the existing connection only to create a NEW database. Never reset it.
const database = new URL(process.env.DATABASE_URL)
database.pathname = '/postgres'
const name = `renegade_rc02_${Date.now()}_release_acceptance`
const password = randomBytes(32).toString('hex')
const client = new Client({ connectionString: database.href })
await client.connect()
try {
  await client.query(`CREATE ROLE "${name}" LOGIN PASSWORD '${password}'`)
  await client.query(`CREATE DATABASE "${name}" OWNER "${name}"`)
} finally {
  await client.end()
}
database.pathname = `/${name}`
database.username = name
database.password = password
mkdirSync('scratch', { recursive: true })
writeFileSync(
  '.env.rc02',
  [
    `DATABASE_URL=${database.href}`,
    `PAYLOAD_SECRET=${randomBytes(48).toString('hex')}`,
    'APP_URL=https://dispatch.rc02.test:3129',
    'PORT=3128',
    'HOSTNAME=127.0.0.1',
    'NODE_ENV=production',
    'PROXY_MODE=trusted',
    'TRUSTED_PROXY_HOPS=1',
    'DEPLOYMENT_PROFILE=Standard',
    'RENEGADE_MODULES=all',
    'RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT=false',
    'LOCAL_E2E_TEST_MODE=false',
    'ENABLE_TEST_ROUTES=false',
    'RENEGADE_NEXT_DIST_DIR=.next',
    'DISABLE_PAYLOAD_HMR=true',
    `MEDIA_DIR=${resolve('scratch', `${name}-media`)}`,
    `NODE_EXTRA_CA_CERTS=${resolve('scratch/rc02-tls/cert.pem')}`,
    'EMAIL_MODE=disabled',
    '',
  ].join('\n'),
)
console.log(`Created disposable database ${name}; migrate before browser acceptance.`)
