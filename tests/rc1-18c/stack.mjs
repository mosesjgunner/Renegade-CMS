import assert from 'node:assert/strict'
import { randomBytes, generateKeyPairSync } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import { acceptance } from './paths.mjs'

const { final, project, scratch, imageTag, subnet } = acceptance
mkdirSync(scratch, { recursive: true })
const envPath = `${scratch}/stack.env`
if (!existsSync(envPath)) {
  const existing = execFileSync(
    'docker',
    [
      'ps',
      '-a',
      '--filter',
      `label=com.docker.compose.project=${project}`,
      '--format',
      '{{.Names}}',
    ],
    { encoding: 'utf8' },
  ).trim()
  assert.equal(existing, '', 'New acceptance project must not already contain containers')
  const env = {
    RENEGADE_INSTANCE: project,
    POSTGRES_PASSWORD: randomBytes(32).toString('hex'),
    PAYLOAD_SECRET: randomBytes(48).toString('hex'),
    BUILD_SHA: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    RENEGADE_IMAGE: 'renegade-cms',
    RENEGADE_IMAGE_TAG: imageTag,
    APP_URL: 'https://rc118c.example.test:3443',
    PROXY_MODE: 'trusted',
    TRUSTED_PROXY_HOPS: '1',
    DEPLOYMENT_PROFILE: 'Standard',
    RENEGADE_MODULES: 'all',
    RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT: 'true',
    RENEGADE_WEB_BIND: '127.0.0.1:3428',
    RENEGADE_NETWORK_SUBNET: subnet,
    LOCAL_E2E_TEST_MODE: 'false',
    EMAIL_MODE: 'smtp',
  }
  writeFileSync(
    envPath,
    Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n',
    { mode: 0o600 },
  )
}
let privateEnv = readFileSync(envPath, 'utf8')
for (const [name, value] of Object.entries({
  RENEGADE_INSTANCE: project,
  COMMERCE_LOCAL_TEST_CHECKOUT_ENABLED: 'true',
  COMMERCE_GUEST_ORDER_SECRET: randomBytes(32).toString('hex'),
  COMMERCE_TEST_WEBHOOK_SECRET: randomBytes(32).toString('hex'),
  RENEGADE_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
})) {
  if (!privateEnv.split('\n').some((line) => line.startsWith(`${name}=`)))
    privateEnv += `${name}=${value}\n`
}
writeFileSync(envPath, privateEnv, { mode: 0o600 })
if (final && !privateEnv.includes('ACTIVITYPUB_PUBLIC_KEY_PEM=')) {
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  privateEnv += `ACTIVITYPUB_PUBLIC_KEY_PEM=${keys.publicKey.replace(/\n/g, '\\n')}\nACTIVITYPUB_PRIVATE_KEY_PEM=${keys.privateKey.replace(/\n/g, '\\n')}\n`
  writeFileSync(envPath, privateEnv, { mode: 0o600 })
}
const override = `${scratch}/compose.yaml`
writeFileSync(
  override,
  `services:
  migrate:
    environment: &mail
      EMAIL_FROM: journey@rc118c.test
      SMTP_HOST: mailpit
      SMTP_PORT: '1025'
      SMTP_SECURE: 'false'
      COMMERCE_LOCAL_TEST_CHECKOUT_ENABLED: \${COMMERCE_LOCAL_TEST_CHECKOUT_ENABLED}
      COMMERCE_GUEST_ORDER_SECRET: \${COMMERCE_GUEST_ORDER_SECRET}
      COMMERCE_TEST_WEBHOOK_SECRET: \${COMMERCE_TEST_WEBHOOK_SECRET}
  renegade-web:
    environment: *mail
  renegade-worker:
    environment: *mail
  mailpit:
    image: axllent/mailpit:latest
    ports:
      - '127.0.0.1:3429:8025'
    restart: 'no'
`,
)
if (final) {
  const base = process.cwd().replaceAll('\\', '/')
  mkdirSync(`${scratch}/peer`, { recursive: true })
  let config = readFileSync(override, 'utf8')
  config = config.replace(
    '      EMAIL_FROM: journey@rc118c.test',
    `      EMAIL_FROM: journey@rc118c.test
      NETWORKING_ENABLED: 'true'
      NETWORK_LOCAL_PEER_ORIGINS: https://127.0.0.1:3450
      SOCIAL_LOCAL_ADAPTER_ORIGINS: https://127.0.0.1:3450
      ACTIVITYPUB_PUBLIC_KEY_PEM: \${ACTIVITYPUB_PUBLIC_KEY_PEM}
      ACTIVITYPUB_PRIVATE_KEY_PEM: \${ACTIVITYPUB_PRIVATE_KEY_PEM}
      ACTIVITYPUB_KEY_ID: https://rc118c.example.test:3443/ap/actors/main#main-key
      NODE_EXTRA_CA_CERTS: /app/acceptance-ca.pem`,
  )
  config = config.replace(
    '  migrate:\n    environment:',
    `  migrate:\n    volumes: &trust\n      - '${base}/scratch/rc118c-tls/cert.pem:/app/acceptance-ca.pem:ro'\n    environment:`,
  )
  for (const service of ['renegade-web', 'renegade-worker'])
    config = config.replace(
      `  ${service}:\n    environment: *mail`,
      `  ${service}:\n    volumes: *trust\n    environment: *mail`,
    )
  config = config.replace(
    '  renegade-worker:\n',
    '  renegade-worker:\n    network_mode: service:renegade-web\n',
  )
  config += `  tls-proxy:
    image: node:24-alpine
    command: ['node', '/proxy.mjs']
    ports: ['127.0.0.1:3443:3443']
    volumes:
      - '${base}/tests/rc1-18c/container-proxy.mjs:/proxy.mjs:ro'
      - '${base}/scratch/rc118c-tls:/tls:ro'
    networks:
      default:
        aliases: [rc118c.example.test]
  local-peer:
    image: node:24-alpine
    command: ['node', '/peer.mjs']
    network_mode: service:renegade-web
    environment:
      NODE_EXTRA_CA_CERTS: /tls/cert.pem
    volumes:
      - '${base}/tests/rc1-18c/peer.mjs:/peer.mjs:ro'
      - '${base}/scratch/rc118c-tls:/tls:ro'
      - '${base}/${scratch}/peer:/peer-state'
`
  writeFileSync(override, config)
}
const args = [
  'compose',
  '-p',
  project,
  '--env-file',
  envPath,
  '-f',
  'compose.production.yaml',
  '-f',
  'compose.network.yaml',
  '-f',
  override,
]
const action = process.argv[2] ?? 'up'
assert.ok(['up', 'stop', 'restart'].includes(action))
const command =
  action === 'up'
    ? ['up', '-d', '--no-build', '--wait', '--wait-timeout', '240']
    : action === 'restart'
      ? ['restart', 'renegade-web', 'renegade-worker']
      : ['stop']
// Explicit env-file and project only. Never remove containers, volumes or media.
const env = { ...process.env }
for (const line of readFileSync(envPath, 'utf8').trim().split('\n')) delete env[line.split('=')[0]]
const result = spawnSync('docker', [...args, ...command], { env, stdio: 'inherit' })
process.exit(result.status ?? 1)
