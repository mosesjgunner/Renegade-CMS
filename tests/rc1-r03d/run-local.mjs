// R-03D local-process supervisor (for hosts without Docker).
//
// Re-runs the frozen 03D acceptance (tests/rc1-03d/, Windows/Docker
// frozen run of 2026-10-20, which stopped in the installer after 1
// check) on this Docker-less host against the production standalone
// server, mirroring the R-01B/R-03A/R-03B/R-03C/R-05C local precedent:
//   - disposable PostgreSQL database rc1r03d_main (schema reset, then
//     the supported `npm run db:migrate`)
//   - web via the production standalone server (node .next/standalone/server.js)
//   - worker via the supported `npm run jobs:worker` command
//   - phases: journey (installer + authored site + WXR import/export +
//     idempotency + verify/activate) -> negatives (anonymous, scoped
//     staff cross-site, cross-origin) -> web+worker process restart AND
//     a PostgreSQL cluster restart -> post-restart re-verification
// Test authentication is disabled (ENABLE_TEST_ROUTES=false,
// LOCAL_E2E_TEST_MODE=false). The journey performs the real installer
// WebAuthn ceremony (virtual authenticator) exactly as the frozen run
// intended; no test login API or forged session is used.
//
// Usage: node tests/rc1-r03d/run-local.mjs
// State lives under scratch/rc1r03d/ (gitignored). Exit 0 only if every
// phase exits 0.

import { spawn, spawnSync } from 'node:child_process'
import { createServer as createHttpsServer } from 'node:https'
import { request as httpRequest } from 'node:http'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const scratch = path.join(repo, 'scratch', 'rc1r03d')
const evidenceDir = path.join(repo, 'docs', 'rc', 'evidence', 'rc1', 'repairs', 'R-03D')
const webPort = 38781
const proxyPort = 38782
const healthUrl = `http://127.0.0.1:${webPort}/health/ready`

mkdirSync(path.join(scratch, 'media'), { recursive: true })
mkdirSync(evidenceDir, { recursive: true })

const dbPassword = readFileSync(path.join(scratch, 'db-password.txt'), 'utf8').trim()
const dbUrl = `postgres://renegade:${dbPassword}@127.0.0.1:5432/rc1r03d_main`

const secretFile = path.join(scratch, 'payload-secret.txt')
if (!existsSync(secretFile)) {
  writeFileSync(secretFile, randomBytes(32).toString('hex'), { mode: 0o600 })
}
const payloadSecret = readFileSync(secretFile, 'utf8').trim()

const buildSha = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: repo,
  encoding: 'utf8',
}).stdout.trim()

const appEnv = {
  ...process.env,
  NODE_ENV: 'production',
  DATABASE_URL: dbUrl,
  PAYLOAD_SECRET: payloadSecret,
  APP_URL: `https://rc1-03d.test:${proxyPort}`,
  PROXY_MODE: 'trusted',
  TRUSTED_PROXY_HOPS: '1',
  STORAGE_DRIVER: 'local',
  MEDIA_DIR: path.join(scratch, 'media'),
  EMAIL_MODE: 'disabled',
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
  RC1R03D_DISPOSABLE: 'yes',
  WORKER_POLL_INTERVAL_MS: '5000',
  WORKER_HEARTBEAT_FILE: path.join(scratch, 'worker-heartbeat.json'),
  WORKER_HEARTBEAT_MAX_AGE_MS: '45000',
  PORT: String(webPort),
  HOSTNAME: '127.0.0.1',
}

function fail(message) {
  console.error(`[r03d-local] ${message}`)
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
console.log('[r03d-local] disposable database rc1r03d_main reset')

// 2. Apply migrations through the supported operator command.
const migrateLog = openSync(path.join(scratch, 'migrate.log'), 'w')
const migrate = spawnSync('npm', ['run', 'db:migrate'], {
  cwd: repo,
  env: appEnv,
  stdio: ['ignore', migrateLog, migrateLog],
})
closeSync(migrateLog)
if (migrate.status !== 0)
  fail(`db:migrate exited ${migrate.status}; see scratch/rc1r03d/migrate.log`)
const migrationCount = psql('SELECT count(*) FROM payload_migrations')
console.log(`[r03d-local] migrations applied (payload_migrations rows: ${migrationCount})`)

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
  web.on('exit', (code) => console.log(`[r03d-local] web process exited (${code})`))
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
      console.log(`[r03d-local] web ready (${label})`)
      return
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  fail(`web did not become ready (${label}); see scratch/rc1r03d/web.log`)
}
await waitReady('initial')

// 4. HTTPS reverse proxy (trusted hop) -> web process. The proxy lives
// in this process, so every child invocation below is async — a
// blocking spawnSync would freeze the proxy for the whole phase (the
// R-01B supervisor lesson).
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
          'x-forwarded-host': req.headers.host ?? `rc1-03d.test:${proxyPort}`,
          'x-forwarded-for': '127.0.0.1',
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
console.log(`[r03d-local] https proxy listening on 127.0.0.1:${proxyPort}`)

// 5. Run a harness phase as a child process with the app environment;
// the sandbox egress proxy env is stripped for every child (its
// Chromium uses --no-proxy-server + host-resolver-rules).
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
  console.log(`[r03d-local] phase ${name}: exit ${status} (log: scratch/rc1r03d/${name}.log)`)
  return status === 0
}

const results = {}
results.journey = await phase('journey', 'tests/rc1-r03d/verify-local.ts')
if (results.journey) {
  results.negatives = await phase('negatives', 'tests/rc1-r03d/verify-negatives-local.ts')
} else {
  console.log('[r03d-local] journey phase failed; negatives/restart phases unexecuted')
}

// 6. Restart web + worker processes AND the PostgreSQL cluster, then
// re-verify persisted import state and public output.
if (results.journey && results.negatives) {
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
  console.log('[r03d-local] PostgreSQL cluster restarted; disposable database reachable')
  startWeb()
  startWorker()
  await waitReady('post-restart')
  results.restart = await phase('restart', 'tests/rc1-r03d/verify-restart-local.ts')
} else if (results.journey) {
  console.log('[r03d-local] negatives phase failed; restart phase unexecuted')
}

// 7. Teardown + summary.
proxy.close()
if (web) web.kill('SIGTERM')
if (worker) worker.kill('SIGTERM')
spawnSync('pkill', ['-f', 'run-jobs-worker'])
console.log(`[r03d-local] phase results: ${JSON.stringify(results)}`)
const ok = ['journey', 'negatives', 'restart'].every((k) => results[k] === true)
process.exit(ok ? 0 : 1)
