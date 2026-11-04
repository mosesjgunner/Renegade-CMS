// R-09C local-process supervisor (for hosts without Docker).
//
// Reconcile-before-repair execution of the 09C acceptance (newsletter
// dispatch, worker retries, failure and restart behavior) on this
// Docker-less host against the production standalone server,
// mirroring the R-01B..R-09A local precedent:
//   - disposable PostgreSQL database rc1r09c_main (schema reset, then
//     the supported `npm run db:migrate`)
//   - web via the production standalone server (node .next/standalone/server.js)
//   - jobs workers are spawned, killed and restarted BY THE VERIFY
//     PHASE ITSELF (tests/rc1-r09c/verify-local.ts) so the
//     interrupted-send / lease-expiry matrix runs against the real
//     `src/scripts/run-jobs-worker.ts` process lifecycle
//   - phases: journey -> web process restart AND a PostgreSQL
//     cluster restart -> post-restart re-verification
// Test authentication is disabled (ENABLE_TEST_ROUTES=false,
// LOCAL_E2E_TEST_MODE=false). The operator owner is created by the
// real installer WebAuthn ceremony; visitor flows are anonymous.
//
// Email is a CONTROLLED LOCAL MAIL SINK ONLY: EMAIL_MODE=smtp against
// a failure-injecting capture SMTP server the verifier itself runs on
// 127.0.0.1:3243. Telecom uses the product's deterministic local
// emulator (TELECOM_MODE=emulator, TELECOM_ALLOW_OUTBOUND=false).
// No real provider, real address or external delivery is involved.
//
// Usage: node tests/rc1-r09c/run-local.mjs
// State lives under scratch/rc1r09c/ (gitignored). Exit 0 only if
// every phase exits 0.

import { spawn, spawnSync } from 'node:child_process'
import { createServer as createHttpsServer } from 'node:https'
import { request as httpRequest } from 'node:http'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const scratch = path.join(repo, 'scratch', 'rc1r09c')
const evidenceDir = path.join(repo, 'docs', 'rc', 'evidence', 'rc1', 'repairs', 'R-09C')
const webPort = 38911
const proxyPort = 38912
const healthUrl = `http://127.0.0.1:${webPort}/health/ready`

mkdirSync(path.join(scratch, 'media'), { recursive: true })
mkdirSync(evidenceDir, { recursive: true })

const dbPassword = readFileSync(path.join(scratch, 'db-password.txt'), 'utf8').trim()
const dbUrl = `postgres://renegade:${dbPassword}@127.0.0.1:5432/rc1r09c_main`

const secretFile = path.join(scratch, 'payload-secret.txt')
if (!existsSync(secretFile)) {
  writeFileSync(secretFile, randomBytes(32).toString('hex'), { mode: 0o600 })
}
const payloadSecret = readFileSync(secretFile, 'utf8').trim()

const encryptionKeyFile = path.join(scratch, 'encryption-key.txt')
if (!existsSync(encryptionKeyFile)) {
  writeFileSync(encryptionKeyFile, randomBytes(32).toString('hex'), { mode: 0o600 })
}
const encryptionKey = readFileSync(encryptionKeyFile, 'utf8').trim()

const buildSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim()

const appEnv = {
  ...process.env,
  NODE_ENV: 'production',
  DATABASE_URL: dbUrl,
  PAYLOAD_SECRET: payloadSecret,
  RENEGADE_ENCRYPTION_KEY: encryptionKey,
  APP_URL: `https://rc1-09c.test:${proxyPort}`,
  PROXY_MODE: 'trusted',
  TRUSTED_PROXY_HOPS: '1',
  STORAGE_DRIVER: 'local',
  MEDIA_DIR: path.join(scratch, 'media'),
  EMAIL_MODE: 'smtp',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '3243',
  SMTP_SECURE: 'false',
  SMTP_CONNECTION_TIMEOUT_MS: '2000',
  SMTP_SEND_TIMEOUT_MS: '5000',
  EMAIL_FROM: 'newsletter@rc1-09c.test',
  TELECOM_MODE: 'emulator',
  TELECOM_ALLOW_OUTBOUND: 'false',
  LOG_LEVEL: 'info',
  APP_VERSION: '0.1.0',
  BUILD_SHA: buildSha,
  RENEGADE_IMAGE_TAG: 'local',
  DEPLOYMENT_PROFILE: 'Standard',
  RENEGADE_MODULES: 'all',
  RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT: 'true',
  ENABLE_TEST_ROUTES: 'false',
  LOCAL_E2E_TEST_MODE: 'false',
  SEED_ON_INIT: 'false',
  RC1R09C_DISPOSABLE: 'yes',
  WORKER_POLL_INTERVAL_MS: '2000',
  WORKER_HEARTBEAT_FILE: path.join(scratch, 'worker-heartbeat.json'),
  WORKER_HEARTBEAT_MAX_AGE_MS: '45000',
  PORT: String(webPort),
  HOSTNAME: '127.0.0.1',
}

function fail(message) {
  console.error(`[r09c-local] ${message}`)
  process.exit(1)
}

function psql(statement) {
  const result = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-Atc', statement], {
    encoding: 'utf8',
  })
  if (result.status !== 0) fail(`psql failed: ${result.stderr}`)
  return result.stdout.trim()
}

// 1. Reset the explicitly disposable database.
psql('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
console.log('[r09c-local] disposable database rc1r09c_main reset')

// 2. Apply migrations through the supported operator command.
const migrateLog = openSync(path.join(scratch, 'migrate.log'), 'w')
const migrate = spawnSync('npm', ['run', 'db:migrate'], {
  cwd: repo,
  env: appEnv,
  stdio: ['ignore', migrateLog, migrateLog],
})
closeSync(migrateLog)
if (migrate.status !== 0) fail(`db:migrate exited ${migrate.status}; see scratch/rc1r09c/migrate.log`)
const migrationCount = psql('SELECT count(*) FROM payload_migrations')
console.log(`[r09c-local] migrations applied (payload_migrations rows: ${migrationCount})`)

// 3. Start the web process. Workers are owned by the verify phase.
const webLog = path.join(scratch, 'web.log')
writeFileSync(webLog, '')
let web = null
function startWeb() {
  const fd = openSync(webLog, 'a')
  web = spawn(process.execPath, ['.next/standalone/server.js'], {
    cwd: repo,
    env: appEnv,
    stdio: ['ignore', fd, fd],
  })
  web.on('exit', code => console.log(`[r09c-local] web process exited (${code})`))
}
startWeb()

process.on('exit', () => {
  try {
    web?.kill('SIGTERM')
  } catch {}
  try {
    spawnSync('pkill', ['-f', 'run-jobs-worker'])
  } catch {}
})

async function waitReady(label) {
  for (let i = 0; i < 180; i++) {
    const probe = spawnSync('curl', ['-sf', '--max-time', '2', healthUrl])
    if (probe.status === 0) {
      console.log(`[r09c-local] web ready (${label})`)
      return
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  fail(`web did not become ready (${label}); see scratch/rc1r09c/web.log`)
}
await waitReady('initial')

// 4. HTTPS reverse proxy (trusted hop) -> web process. Async children
// only below: a blocking spawnSync would freeze the proxy (R-01B
// lesson). A client-supplied x-forwarded-for is passed through so the
// harness can keep public rate-limit buckets distinct per scenario;
// otherwise the loopback address is used.
const proxy = createHttpsServer(
  {
    cert: readFileSync(path.join(scratch, 'tls', 'cert.pem')),
    key: readFileSync(path.join(scratch, 'tls', 'key.pem')),
  },
  (req, res) => {
    const upstream = httpRequest(
      {
        host: '127.0.0.1',
        port: webPort,
        method: req.method,
        path: req.url,
        headers: {
          ...req.headers,
          'x-forwarded-proto': 'https',
          'x-forwarded-host': req.headers.host ?? `rc1-09c.test:${proxyPort}`,
          'x-forwarded-for': req.headers['x-forwarded-for'] ?? '127.0.0.1',
        },
      },
      upstreamRes => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
        upstreamRes.pipe(res)
      },
    )
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502)
      res.end('upstream unavailable')
    })
    res.on('close', () => upstream.destroy())
    req.pipe(upstream)
  },
)
proxy.on('upgrade', (_req, socket) => socket.destroy())
await new Promise(resolve => proxy.listen(proxyPort, '127.0.0.1', resolve))
console.log(`[r09c-local] https proxy listening on 127.0.0.1:${proxyPort}`)

// 5. Run a harness phase as an async child with the app environment;
// the sandbox egress proxy env is stripped for every child.
async function phase(name, script, args = []) {
  const logPath = path.join(scratch, `${name}.log`)
  const fd = openSync(logPath, 'w')
  const env = { ...appEnv }
  for (const key of ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'all_proxy'])
    delete env[key]
  const status = await new Promise(resolve => {
    const child = spawn('npx', ['tsx', script, ...args], {
      cwd: repo,
      env,
      stdio: ['ignore', fd, fd],
    })
    child.on('close', code => resolve(code ?? 1))
    child.on('error', () => resolve(1))
  })
  closeSync(fd)
  console.log(`[r09c-local] phase ${name}: exit ${status} (log: scratch/rc1r09c/${name}.log)`)
  return status === 0
}

const results = {}
results.journey = await phase('journey', 'tests/rc1-r09c/verify-local.ts')

// 6. Restart the web process AND the PostgreSQL cluster, then
// re-verify persisted dispatch state. (Worker processes are started
// and stopped inside each verify phase.)
if (results.journey) {
  if (web) {
    web.kill('SIGTERM')
    await Promise.race([
      new Promise(r => web.once('exit', r)),
      new Promise(r => setTimeout(r, 10000)),
    ])
    if (web.exitCode === null) web.kill('SIGKILL')
  }
  spawnSync('pkill', ['-f', 'run-jobs-worker'])
  await new Promise(r => setTimeout(r, 1000))
  const pgRestart = spawnSync('pg_ctlcluster', ['16', 'main', 'restart'], { encoding: 'utf8' })
  if (pgRestart.status !== 0)
    fail(`PostgreSQL cluster restart failed: ${pgRestart.stderr || pgRestart.stdout}`)
  for (let i = 0; i < 60; i++) {
    const probe = spawnSync('psql', [dbUrl, '-Atc', 'SELECT 1'], { encoding: 'utf8' })
    if (probe.status === 0 && probe.stdout.trim() === '1') break
    if (i === 59) fail('PostgreSQL did not accept connections after cluster restart')
    await new Promise(r => setTimeout(r, 1000))
  }
  console.log('[r09c-local] PostgreSQL cluster restarted; disposable database reachable')
  startWeb()
  await waitReady('post-restart')
  results.restart = await phase('restart', 'tests/rc1-r09c/verify-local.ts', ['--restart'])
} else {
  console.log('[r09c-local] journey phase failed; restart phase unexecuted')
}

// 7. Teardown + summary.
proxy.close()
if (web) web.kill('SIGTERM')
spawnSync('pkill', ['-f', 'run-jobs-worker'])
console.log(`[r09c-local] phase results: ${JSON.stringify(results)}`)
const ok = ['journey', 'restart'].every(k => results[k] === true)
process.exit(ok ? 0 : 1)
