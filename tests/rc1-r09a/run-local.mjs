// R-09A local-process supervisor (for hosts without Docker).
//
// Reconcile-before-repair execution of the 09A acceptance (signup,
// confirmation, consent, preferences, unsubscribe, suppression) on
// this Docker-less host against the production standalone server,
// mirroring the R-01B..R-08-SOCIAL local precedent:
//   - disposable PostgreSQL database rc1r09a_main (schema reset, then
//     the supported `npm run db:migrate`)
//   - web via the production standalone server (node .next/standalone/server.js)
//   - worker via the supported `npm run jobs:worker` command
//   - phases: journey -> web+worker process restart AND a PostgreSQL
//     cluster restart -> post-restart re-verification
// Test authentication is disabled (ENABLE_TEST_ROUTES=false,
// LOCAL_E2E_TEST_MODE=false). The operator owner is created by the
// real installer WebAuthn ceremony; visitor flows are anonymous.
//
// Email is a CONTROLLED LOCAL MAIL SINK ONLY: EMAIL_MODE=smtp against
// a capture SMTP server the verifier itself runs on 127.0.0.1:3143.
// No real provider, real address or external delivery is involved.
//
// Usage: node tests/rc1-r09a/run-local.mjs
// State lives under scratch/rc1r09a/ (gitignored). Exit 0 only if
// every phase exits 0.

import { spawn, spawnSync } from 'node:child_process'
import { createServer as createHttpsServer } from 'node:https'
import { request as httpRequest } from 'node:http'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const scratch = path.join(repo, 'scratch', 'rc1r09a')
const evidenceDir = path.join(repo, 'docs', 'rc', 'evidence', 'rc1', 'repairs', 'R-09A')
const webPort = 38811
const proxyPort = 38812
const healthUrl = `http://127.0.0.1:${webPort}/health/ready`

mkdirSync(path.join(scratch, 'media'), { recursive: true })
mkdirSync(evidenceDir, { recursive: true })

const dbPassword = readFileSync(path.join(scratch, 'db-password.txt'), 'utf8').trim()
const dbUrl = `postgres://renegade:${dbPassword}@127.0.0.1:5432/rc1r09a_main`

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

const buildSha = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: repo,
  encoding: 'utf8',
}).stdout.trim()

const appEnv = {
  ...process.env,
  NODE_ENV: 'production',
  DATABASE_URL: dbUrl,
  PAYLOAD_SECRET: payloadSecret,
  RENEGADE_ENCRYPTION_KEY: encryptionKey,
  APP_URL: `https://rc1-09a.test:${proxyPort}`,
  PROXY_MODE: 'trusted',
  TRUSTED_PROXY_HOPS: '1',
  STORAGE_DRIVER: 'local',
  MEDIA_DIR: path.join(scratch, 'media'),
  EMAIL_MODE: 'smtp',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '3143',
  SMTP_SECURE: 'false',
  SMTP_CONNECTION_TIMEOUT_MS: '2000',
  SMTP_SEND_TIMEOUT_MS: '5000',
  EMAIL_FROM: 'newsletter@rc1-09a.test',
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
  RC1R09A_DISPOSABLE: 'yes',
  WORKER_POLL_INTERVAL_MS: '2000',
  WORKER_HEARTBEAT_FILE: path.join(scratch, 'worker-heartbeat.json'),
  WORKER_HEARTBEAT_MAX_AGE_MS: '45000',
  PORT: String(webPort),
  HOSTNAME: '127.0.0.1',
}

function fail(message) {
  console.error(`[r09a-local] ${message}`)
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
console.log('[r09a-local] disposable database rc1r09a_main reset')

// 2. Apply migrations through the supported operator command.
const migrateLog = openSync(path.join(scratch, 'migrate.log'), 'w')
const migrate = spawnSync('npm', ['run', 'db:migrate'], {
  cwd: repo,
  env: appEnv,
  stdio: ['ignore', migrateLog, migrateLog],
})
closeSync(migrateLog)
if (migrate.status !== 0)
  fail(`db:migrate exited ${migrate.status}; see scratch/rc1r09a/migrate.log`)
const migrationCount = psql('SELECT count(*) FROM payload_migrations')
console.log(`[r09a-local] migrations applied (payload_migrations rows: ${migrationCount})`)

// 3. Start web + worker.
const webLog = path.join(scratch, 'web.log')
const workerLog = path.join(scratch, 'worker.log')
writeFileSync(webLog, '')
writeFileSync(workerLog, '')
let web = null
let worker = null
function startWeb() {
  const fd = openSync(webLog, 'a')
  web = spawn(process.execPath, ['.next/standalone/server.js'], {
    cwd: repo,
    env: appEnv,
    stdio: ['ignore', fd, fd],
  })
  web.on('exit', (code) => console.log(`[r09a-local] web process exited (${code})`))
}
function startWorker() {
  const fd = openSync(workerLog, 'a')
  worker = spawn('npm', ['run', 'jobs:worker'], {
    cwd: repo,
    env: appEnv,
    stdio: ['ignore', fd, fd],
  })
}
startWeb()
startWorker()

process.on('exit', () => {
  try {
    web?.kill('SIGTERM')
  } catch {}
  try {
    worker?.kill('SIGTERM')
  } catch {}
  try {
    spawnSync('pkill', ['-f', 'run-jobs-worker'])
  } catch {}
})

async function waitReady(label) {
  for (let i = 0; i < 180; i++) {
    const probe = spawnSync('curl', ['-sf', '--max-time', '2', healthUrl])
    if (probe.status === 0) {
      console.log(`[r09a-local] web ready (${label})`)
      return
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  fail(`web did not become ready (${label}); see scratch/rc1r09a/web.log`)
}
await waitReady('initial')

// 4. HTTPS reverse proxy (trusted hop) -> web process. Async children
// only below: a blocking spawnSync would freeze the proxy (R-01B
// lesson). A client-supplied x-forwarded-for is passed through so the
// harness can keep public rate-limit buckets distinct per scenario
// (the frozen integration test did the same); otherwise the loopback
// address is used.
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
          'x-forwarded-host': req.headers.host ?? `rc1-09a.test:${proxyPort}`,
          'x-forwarded-for': req.headers['x-forwarded-for'] ?? '127.0.0.1',
        },
      },
      (upstreamRes) => {
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
await new Promise((resolve) => proxy.listen(proxyPort, '127.0.0.1', resolve))
console.log(`[r09a-local] https proxy listening on 127.0.0.1:${proxyPort}`)

// 5. Run a harness phase as an async child with the app environment;
// the sandbox egress proxy env is stripped for every child.
async function phase(name, script, args = []) {
  const logPath = path.join(scratch, `${name}.log`)
  const fd = openSync(logPath, 'w')
  const env = { ...appEnv }
  for (const key of [
    'http_proxy',
    'https_proxy',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'all_proxy',
  ])
    delete env[key]
  const status = await new Promise((resolve) => {
    const child = spawn('npx', ['tsx', script, ...args], {
      cwd: repo,
      env,
      stdio: ['ignore', fd, fd],
    })
    child.on('close', (code) => resolve(code ?? 1))
    child.on('error', () => resolve(1))
  })
  closeSync(fd)
  console.log(`[r09a-local] phase ${name}: exit ${status} (log: scratch/rc1r09a/${name}.log)`)
  return status === 0
}

const results = {}
results.journey = await phase('journey', 'tests/rc1-r09a/verify-local.ts')

// 6. Restart web + worker processes AND the PostgreSQL cluster, then
// re-verify persisted audience state.
if (results.journey) {
  for (const proc of [web, worker]) {
    if (proc) {
      proc.kill('SIGTERM')
      await Promise.race([
        new Promise((r) => proc.once('exit', r)),
        new Promise((r) => setTimeout(r, 10000)),
      ])
      if (proc.exitCode === null) proc.kill('SIGKILL')
    }
  }
  spawnSync('pkill', ['-f', 'run-jobs-worker'])
  await new Promise((r) => setTimeout(r, 1000))
  const pgRestart = spawnSync('pg_ctlcluster', ['16', 'main', 'restart'], { encoding: 'utf8' })
  if (pgRestart.status !== 0)
    fail(`PostgreSQL cluster restart failed: ${pgRestart.stderr || pgRestart.stdout}`)
  for (let i = 0; i < 60; i++) {
    const probe = spawnSync('psql', [dbUrl, '-Atc', 'SELECT 1'], { encoding: 'utf8' })
    if (probe.status === 0 && probe.stdout.trim() === '1') break
    if (i === 59) fail('PostgreSQL did not accept connections after cluster restart')
    await new Promise((r) => setTimeout(r, 1000))
  }
  console.log('[r09a-local] PostgreSQL cluster restarted; disposable database reachable')
  startWeb()
  startWorker()
  await waitReady('post-restart')
  results.restart = await phase('restart', 'tests/rc1-r09a/verify-local.ts', ['--restart'])
} else {
  console.log('[r09a-local] journey phase failed; restart phase unexecuted')
}

// 7. Teardown + summary.
proxy.close()
if (web) web.kill('SIGTERM')
if (worker) worker.kill('SIGTERM')
spawnSync('pkill', ['-f', 'run-jobs-worker'])
console.log(`[r09a-local] phase results: ${JSON.stringify(results)}`)
const ok = ['journey', 'restart'].every((k) => results[k] === true)
process.exit(ok ? 0 : 1)
