// R-03B local-process supervisor (for hosts without Docker).
//
// Re-runs the original 03B acceptance (tests/rc1-03b/, Windows/Docker frozen
// run of 2026-10-20) on this Docker-less host against the production
// standalone server, mirroring the R-01B/R-03A local precedent:
//   - disposable PostgreSQL database rc1r03b_main (schema reset, then the
//     supported `npm run db:migrate`)
//   - web via the production standalone server (node .next/standalone/server.js)
//   - worker via the supported `npm run jobs:worker` command
//   - phases: editor journey (create/draft/autosave/locks/revisions/preview)
//     -> privacy + strict preview-gate negatives -> web+worker process
//     restart -> post-restart re-verification (journey --restart)
// Test authentication is disabled (ENABLE_TEST_ROUTES=false,
// LOCAL_E2E_TEST_MODE=false). The verifiers use the established operator
// fixture-session pattern of the original 03B run (persisted sessions issued
// through the product's own createPasskeySession); no passkey ceremony is
// claimed here — that is R-01B's proof on this same tree.
//
// Usage: node tests/rc1-r03b/run-local.mjs
// State lives under scratch/rc1r03b/ (gitignored). Exit 0 only if every
// phase exits 0.

import { spawn, spawnSync } from 'node:child_process'
import { createServer as createHttpsServer } from 'node:https'
import { request as httpRequest } from 'node:http'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const scratch = path.join(repo, 'scratch', 'rc1r03b')
const webPort = 38759
const proxyPort = 38760
const healthUrl = `http://127.0.0.1:${webPort}/health/ready`

mkdirSync(path.join(scratch, 'media'), { recursive: true })

const dbPassword = readFileSync(path.join(scratch, 'db-password.txt'), 'utf8').trim()
const dbUrl = `postgres://renegade:${dbPassword}@127.0.0.1:5432/rc1r03b_main`

const secretFile = path.join(scratch, 'payload-secret.txt')
if (!existsSync(secretFile)) {
  writeFileSync(secretFile, randomBytes(32).toString('hex'), { mode: 0o600 })
}
const payloadSecret = readFileSync(secretFile, 'utf8').trim()

const buildSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim()

const appEnv = {
  ...process.env,
  NODE_ENV: 'production',
  DATABASE_URL: dbUrl,
  PAYLOAD_SECRET: payloadSecret,
  // Union-tree config validation requires a production APP_URL that is
  // https and non-loopback, so (as in the R-01B local run) the browser
  // reaches the stack through a local HTTPS proxy on rc1-03b.test; the
  // verifier's REST/public calls go straight to the web port with explicit
  // Host headers, as in the original 03A harness.
  APP_URL: `https://rc1-03b.test:${proxyPort}`,
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
  RC1R03B_DISPOSABLE: 'yes',
  WORKER_POLL_INTERVAL_MS: '5000',
  WORKER_HEARTBEAT_FILE: path.join(scratch, 'worker-heartbeat.json'),
  WORKER_HEARTBEAT_MAX_AGE_MS: '45000',
  PORT: String(webPort),
  HOSTNAME: '127.0.0.1',
}

function fail(message) {
  console.error(`[r03b-local] ${message}`)
  process.exit(1)
}

function psql(statement) {
  const result = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-Atc', statement], {
    encoding: 'utf8',
  })
  if (result.status !== 0) fail(`psql failed: ${result.stderr}`)
}

// 1. Reset the explicitly disposable database to a pristine pre-install state.
psql('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
console.log('[r03b-local] disposable database rc1r03b_main reset')

// 2. Apply migrations through the supported operator command.
const migrateLog = openSync(path.join(scratch, 'migrate.log'), 'w')
const migrate = spawnSync('npm', ['run', 'db:migrate'], {
  cwd: repo,
  env: appEnv,
  stdio: ['ignore', migrateLog, migrateLog],
})
closeSync(migrateLog)
if (migrate.status !== 0) fail(`db:migrate exited ${migrate.status}; see scratch/rc1r03b/migrate.log`)
const migrationCount = psqlCount()
function psqlCount() {
  const result = spawnSync('psql', [dbUrl, '-Atc', 'SELECT count(*) FROM payload_migrations'], {
    encoding: 'utf8',
  })
  return result.status === 0 ? result.stdout.trim() : 'unknown'
}
console.log(`[r03b-local] migrations applied (payload_migrations rows: ${migrationCount})`)

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
  web.on('exit', code => console.log(`[r03b-local] web process exited (${code})`))
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
      console.log(`[r03b-local] web ready (${label})`)
      return
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  fail(`web did not become ready (${label}); see scratch/rc1r03b/web.log`)
}
await waitReady('initial')

// 4. HTTPS reverse proxy (trusted hop) -> web process, preserving the
// request Host so the alpha/beta site hosts resolve exactly as in the
// original virtual-host harness. The proxy lives in this process, so every
// child invocation below is async — a blocking spawnSync would freeze the
// proxy for the whole phase (the R-01B supervisor lesson).
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
          'x-forwarded-host': req.headers.host ?? `rc1-03b.test:${proxyPort}`,
          'x-forwarded-for': '127.0.0.1',
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
console.log(`[r03b-local] https proxy listening on 127.0.0.1:${proxyPort}`)

// 5. Run a harness phase as a child process with the app environment; all
// phases launch Chromium, so the sandbox egress proxy env is stripped for
// every child (its Chromium uses --no-proxy-server + host-resolver-rules
// for the .test site hosts) and the supervisor's own proxy stays async.
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
  console.log(`[r03b-local] phase ${name}: exit ${status} (log: scratch/rc1r03b/${name}.log)`)
  return status === 0
}

const results = {}
results.journey = await phase('journey', 'tests/rc1-r03b/verify-editor-local.ts')
if (results.journey) {
  results.privacy = await phase('privacy', 'tests/rc1-r03b/verify-privacy-local.ts')
} else {
  console.log('[r03b-local] journey phase failed; privacy/restart phases unexecuted')
}

// 6. Restart web + worker processes, then re-verify persistence + preview.
if (results.journey && results.privacy) {
  for (const proc of [web, worker]) {
    if (proc) {
      proc.kill('SIGTERM')
      await Promise.race([
        new Promise(r => proc.once('exit', r)),
        new Promise(r => setTimeout(r, 10000)),
      ])
      if (proc.exitCode === null) proc.kill('SIGKILL')
    }
  }
  spawnSync('pkill', ['-f', 'run-jobs-worker'])
  await new Promise(r => setTimeout(r, 1000))
  startWeb()
  startWorker()
  await waitReady('post-restart')
  results.restart = await phase('restart', 'tests/rc1-r03b/verify-editor-local.ts', ['--restart'])
}

// 7. Teardown + summary.
proxy.close()
if (web) web.kill('SIGTERM')
if (worker) worker.kill('SIGTERM')
spawnSync('pkill', ['-f', 'run-jobs-worker'])
console.log(`[r03b-local] phase results: ${JSON.stringify(results)}`)
const ok = ['journey', 'privacy', 'restart'].every(k => results[k] === true)
process.exit(ok ? 0 : 1)
