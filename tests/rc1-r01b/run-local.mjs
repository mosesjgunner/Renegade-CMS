// R-01B local-process supervisor (for hosts without Docker).
//
// Reproduces the production topology of compose.production.yaml with local
// processes on a disposable database, mirroring the 17C/17D local precedent:
//   - migrations via the supported `npm run db:migrate` command
//   - web via the production standalone server (node .next/standalone/server.js)
//   - worker via the supported `npm run jobs:worker` command
//   - an HTTPS reverse proxy on https://rc1-01b.test:38756 (self-signed,
//     scratch-only) in front of the web process, as in the container run
// Local test authentication is disabled (ENABLE_TEST_ROUTES=false,
// LOCAL_E2E_TEST_MODE=false). The supervisor also watches a restart-flag file
// so the Playwright journey can restart the web process mid-test.
//
// Usage: node tests/rc1-r01b/run-local.mjs
// State lives under scratch/rc1r01b/ (gitignored). Exit code = Playwright's.

import { spawn, spawnSync } from 'node:child_process'
import { createServer as createHttpsServer } from 'node:https'
import { request as httpRequest } from 'node:http'
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  watchFile,
  unwatchFile,
  writeFileSync,
} from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const scratch = path.join(repo, 'scratch', 'rc1r01b')
const webPort = 38755
const proxyPort = 38756
const webLog = path.join(scratch, 'web.log')
const workerLog = path.join(scratch, 'worker.log')
const restartFlag = path.join(scratch, 'restart.request')
const healthUrl = `http://127.0.0.1:${webPort}/health/ready`

mkdirSync(path.join(scratch, 'media'), { recursive: true })
mkdirSync(path.join(scratch, 'tls'), { recursive: true })

const dbPassword = readFileSync(path.join(scratch, 'db-password.txt'), 'utf8').trim()
const dbUrl = `postgres://renegade:${dbPassword}@127.0.0.1:5432/rc1r01b_main`

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
  APP_URL: `https://rc1-01b.test:${proxyPort}`,
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
  RENEGADE_MODULES: '',
  RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT: 'false',
  ENABLE_TEST_ROUTES: 'false',
  LOCAL_E2E_TEST_MODE: 'false',
  NEXT_PUBLIC_LOCAL_TEST_AUTH: 'false',
  RENEGADE_LOCAL_TEST_AUTH: 'false',
  WORKER_POLL_INTERVAL_MS: '5000',
  WORKER_HEARTBEAT_FILE: path.join(scratch, 'worker-heartbeat.json'),
  WORKER_HEARTBEAT_MAX_AGE_MS: '45000',
  PORT: String(webPort),
  HOSTNAME: '127.0.0.1',
}

function fail(message) {
  console.error(`[r01b-local] ${message}`)
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
console.log('[r01b-local] disposable database rc1r01b_main reset')

// 2. Apply migrations through the supported operator command.
const migrateLog = openSync(path.join(scratch, 'migrate.log'), 'w')
const migrate = spawnSync('npm', ['run', 'db:migrate'], {
  cwd: repo,
  env: appEnv,
  stdio: ['ignore', migrateLog, migrateLog],
})
closeSync(migrateLog)
if (migrate.status !== 0)
  fail(`db:migrate exited ${migrate.status}; see scratch/rc1r01b/migrate.log`)
console.log('[r01b-local] migrations applied')

// 3. Start the production web process (standalone server, image CMD equivalent).
writeFileSync(webLog, '')
let web = null
function startWeb() {
  const fd = openSync(webLog, 'a')
  web = spawn(process.execPath, ['.next/standalone/server.js'], {
    cwd: repo,
    env: appEnv,
    stdio: ['ignore', fd, fd],
  })
  web.on('exit', (code) => console.log(`[r01b-local] web process exited (${code})`))
}
startWeb()

// 4. Start the worker through the supported command.
const workerFd = openSync(workerLog, 'w')
const worker = spawn('npm', ['run', 'jobs:worker'], {
  cwd: repo,
  env: appEnv,
  stdio: ['ignore', workerFd, workerFd],
})

// Never leave the stack running when the supervisor exits early (fail paths
// included): an orphaned worker/web pair would hold the ports and silently
// serve a later run. The npm wrapper does not forward signals to its tsx
// grandchild, so sweep the worker chain by pattern as well.
process.on('exit', () => {
  try {
    web?.kill('SIGTERM')
  } catch {}
  try {
    worker.kill('SIGTERM')
  } catch {}
  try {
    spawnSync('pkill', ['-f', 'run-jobs-worker'])
  } catch {}
})

// 5. HTTPS reverse proxy (trusted hop) -> web process.
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
          'x-forwarded-host': `rc1-01b.test:${proxyPort}`,
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
    // If the client goes away (e.g. web process restart), do not leave the
    // upstream request running and piling onto the recovering process.
    res.on('close', () => upstream.destroy())
    req.pipe(upstream)
  },
)
proxy.on('upgrade', (_req, socket) => socket.destroy())
await new Promise((resolve) => proxy.listen(proxyPort, '127.0.0.1', resolve))
console.log(`[r01b-local] https proxy listening on 127.0.0.1:${proxyPort}`)

// 6. Wait for web readiness.
async function waitReady(label) {
  for (let i = 0; i < 180; i++) {
    const probe = spawnSync('curl', ['-sf', '--max-time', '2', healthUrl])
    if (probe.status === 0) {
      console.log(`[r01b-local] web ready (${label})`)
      return
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  fail(`web did not become ready (${label}); see scratch/rc1r01b/web.log`)
}
await waitReady('initial')

// Warm the /setup route through the proxy before the browser run: the first
// hit on a cold standalone process pays Payload/DB init under load and can
// exceed the browser navigation timeout even though the stack is healthy.
// NOTE: this must stay async — the proxy lives in this same process, so a
// blocking spawnSync here freezes the proxy for the whole request and the
// warm-up deadlocks against itself.
function warmSetupOnce() {
  return new Promise((resolve) => {
    const child = spawn('curl', [
      '-sk',
      '--noproxy',
      '*',
      '--resolve',
      `rc1-01b.test:${proxyPort}:127.0.0.1`,
      '-o',
      '/dev/null',
      '-w',
      '%{http_code}',
      '--max-time',
      '60',
      `https://rc1-01b.test:${proxyPort}/setup`,
    ])
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.on('close', () => resolve(out.trim()))
    child.on('error', () => resolve(''))
  })
}
for (let i = 0; i < 10; i++) {
  if ((await warmSetupOnce()) === '200') {
    console.log('[r01b-local] /setup warm (200 via proxy)')
    break
  }
  if (i === 9) fail('warm-up GET /setup via proxy never returned 200')
  await new Promise((r) => setTimeout(r, 1000))
}

// 7. Restart watcher: the journey writes the flag to restart the web process.
rmSync(restartFlag, { force: true })
let restarting = false
watchFile(restartFlag, { interval: 200 }, async () => {
  if (restarting || !existsSync(restartFlag)) return
  restarting = true
  console.log('[r01b-local] restart requested; restarting web process')
  const old = web
  if (old) {
    old.kill('SIGTERM')
    await Promise.race([
      new Promise((r) => old.once('exit', r)),
      new Promise((r) => setTimeout(r, 10000)),
    ])
    if (old.exitCode === null) old.kill('SIGKILL')
  }
  rmSync(restartFlag, { force: true })
  startWeb()
  await waitReady('post-restart')
  restarting = false
})

// 8. Run the Playwright journey against the live stack.
// Playwright forwards the host proxy env to Chromium, whose CONNECT tunnel
// rejects the .test host (net::ERR_TUNNEL_CONNECTION_FAILED). The journey is
// entirely local, so the browser child runs with no proxy configuration.
const browserEnv = { ...appEnv }
for (const key of [
  'http_proxy',
  'https_proxy',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'all_proxy',
]) {
  delete browserEnv[key]
}
browserEnv.NO_PROXY = `${browserEnv.NO_PROXY ?? ''},rc1-01b.test`
browserEnv.no_proxy = browserEnv.NO_PROXY
const testEnv = {
  ...browserEnv,
  R01B_WEB_LOG: webLog,
  R01B_DB_URL: dbUrl,
  R01B_REPO: repo,
  R01B_RESTART_FLAG: restartFlag,
  R01B_WEB_HEALTH: healthUrl,
  R01B_OUTPUT_DIR: path.join(scratch, 'playwright-output'),
}
// NOTE: async spawn is load-bearing — the proxy and the restart watcher live
// in this process, so a blocking spawnSync would freeze them for the entire
// journey and every browser request would stall.
const runStatus = await new Promise((resolve) => {
  const child = spawn('npx', ['playwright', 'test', '-c', 'playwright.r01b.local.config.ts'], {
    cwd: repo,
    env: testEnv,
    stdio: 'inherit',
  })
  child.on('close', (code) => resolve(code ?? 1))
  child.on('error', () => resolve(1))
})

// 9. Teardown.
unwatchFile(restartFlag)
proxy.close()
if (web) web.kill('SIGTERM')
worker.kill('SIGTERM')
appendFileSync(webLog, '\n[r01b-local] supervisor teardown\n')
console.log(`[r01b-local] journey exit code: ${runStatus}`)
process.exit(runStatus)
