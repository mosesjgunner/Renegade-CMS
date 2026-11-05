// R-05C local-process supervisor (for hosts without Docker).
//
// Re-runs the original 05C acceptance (tests/rc1-05c/, Windows/Docker
// frozen run of 2026-10-18) on this Docker-less host against the
// production standalone server, mirroring the R-01B/R-03A/R-03B/R-03C
// local precedent, in TWO isolated environments:
//   - env A: disposable PostgreSQL database rc1r05c_main + own media dir
//     (upload -> miniPaint edit -> save version / Save As -> publish ->
//     supported portability export)
//   - env B: disposable PostgreSQL database rc1r05c_restore + own media
//     dir (fresh target site -> supported portability import -> DB/FS
//     integrity + anonymous public refetch)
// Phases: journey -> export -> import -> refetch -> web+worker process
// restart AND PostgreSQL cluster restart -> restart re-verification in
// env A -> post-restart refetch in env B.
// Test authentication is disabled (ENABLE_TEST_ROUTES=false,
// LOCAL_E2E_TEST_MODE=false). The verifier uses the frozen run's operator
// pattern: persisted fixture operator sessions (no passkey ceremony is
// claimed here — that is R-01B's proof on this same tree).
//
// Usage: node tests/rc1-r05c/run-local.mjs
// State lives under scratch/rc1r05c/ (gitignored). Exit 0 only if every
// executed phase exits 0 and no required phase was skipped.

import { spawn, spawnSync } from 'node:child_process'
import { createServer as createHttpsServer } from 'node:https'
import { request as httpRequest } from 'node:http'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const scratch = path.join(repo, 'scratch', 'rc1r05c')
const evidenceDir = path.join(repo, 'docs', 'rc', 'evidence', 'rc1', 'repairs', 'R-05C')

mkdirSync(path.join(scratch, 'media'), { recursive: true })
mkdirSync(path.join(scratch, 'media-restore'), { recursive: true })
mkdirSync(evidenceDir, { recursive: true })

const dbPassword = readFileSync(path.join(scratch, 'db-password.txt'), 'utf8').trim()
const secretFile = path.join(scratch, 'payload-secret.txt')
if (!existsSync(secretFile)) {
  writeFileSync(secretFile, randomBytes(32).toString('hex'), { mode: 0o600 })
}
const payloadSecret = readFileSync(secretFile, 'utf8').trim()
const buildSha = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: repo,
  encoding: 'utf8',
}).stdout.trim()

function makeEnv({ dbName, mediaDir, appUrl, webPort, heartbeat }) {
  return {
    ...process.env,
    NODE_ENV: 'production',
    DATABASE_URL: `postgres://renegade:${dbPassword}@127.0.0.1:5432/${dbName}`,
    PAYLOAD_SECRET: payloadSecret,
    // Production APP_URL validation requires an https, non-loopback
    // origin, so browsers reach each stack through its local HTTPS proxy.
    APP_URL: appUrl,
    PROXY_MODE: 'trusted',
    TRUSTED_PROXY_HOPS: '1',
    STORAGE_DRIVER: 'local',
    MEDIA_DIR: mediaDir,
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
    RC1R05C_DISPOSABLE: 'yes',
    WORKER_POLL_INTERVAL_MS: '5000',
    WORKER_HEARTBEAT_FILE: heartbeat,
    WORKER_HEARTBEAT_MAX_AGE_MS: '45000',
    PORT: String(webPort),
    HOSTNAME: '127.0.0.1',
  }
}

const envA = makeEnv({
  dbName: 'rc1r05c_main',
  mediaDir: path.join(scratch, 'media'),
  appUrl: 'https://rc1-05c.test:38772',
  webPort: 38771,
  heartbeat: path.join(scratch, 'worker-heartbeat.json'),
})
const envB = makeEnv({
  dbName: 'rc1r05c_restore',
  mediaDir: path.join(scratch, 'media-restore'),
  appUrl: 'https://rc1-05c-restore.test:38774',
  webPort: 38773,
  heartbeat: path.join(scratch, 'worker-heartbeat-b.json'),
})

function fail(message) {
  console.error(`[r05c-local] ${message}`)
  process.exit(1)
}

function psql(dbUrl, statement) {
  const result = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-Atc', statement], {
    encoding: 'utf8',
  })
  if (result.status !== 0) fail(`psql failed: ${result.stderr}`)
  return result.stdout.trim()
}

// 1. Reset both explicitly disposable databases and migrate each through
// the supported operator command.
for (const [label, env] of [
  ['A', envA],
  ['B', envB],
]) {
  psql(env.DATABASE_URL, 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  console.log(`[r05c-local] disposable database reset (env ${label})`)
  const migrateLog = openSync(path.join(scratch, `migrate-${label}.log`), 'w')
  const migrate = spawnSync('npm', ['run', 'db:migrate'], {
    cwd: repo,
    env,
    stdio: ['ignore', migrateLog, migrateLog],
  })
  closeSync(migrateLog)
  if (migrate.status !== 0)
    fail(
      `db:migrate (env ${label}) exited ${migrate.status}; see scratch/rc1r05c/migrate-${label}.log`,
    )
  const count = psql(env.DATABASE_URL, 'SELECT count(*) FROM payload_migrations')
  console.log(`[r05c-local] env ${label} migrations applied (payload_migrations rows: ${count})`)
}

// 2. Stack management (web + worker + HTTPS proxy per environment). The
// proxies live in this process, so every child invocation below is async
// (a blocking spawnSync would freeze the proxies — the R-01B lesson).
const cert = readFileSync(path.join(scratch, 'tls', 'cert.pem'))
const key = readFileSync(path.join(scratch, 'tls', 'key.pem'))

function makeStack(label, env, webPort, proxyPort) {
  const webLog = path.join(scratch, `web-${label}.log`)
  const workerLog = path.join(scratch, `worker-${label}.log`)
  writeFileSync(webLog, '')
  writeFileSync(workerLog, '')
  let web = null
  let worker = null
  let proxy = null
  const startWeb = () => {
    const fd = openSync(webLog, 'a')
    web = spawn(process.execPath, ['.next/standalone/server.js'], {
      cwd: repo,
      env,
      stdio: ['ignore', fd, fd],
    })
    web.on('exit', (code) => console.log(`[r05c-local] env ${label} web exited (${code})`))
  }
  const startWorker = () => {
    const fd = openSync(workerLog, 'a')
    worker = spawn('npm', ['run', 'jobs:worker'], {
      cwd: repo,
      env,
      stdio: ['ignore', fd, fd],
    })
  }
  const startProxy = async () => {
    proxy = createHttpsServer({ cert, key }, (req, res) => {
      const upstream = httpRequest(
        {
          host: '127.0.0.1',
          port: webPort,
          method: req.method,
          path: req.url,
          headers: {
            ...req.headers,
            'x-forwarded-proto': 'https',
            'x-forwarded-host': req.headers.host ?? '',
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
    })
    proxy.on('upgrade', (_req, socket) => socket.destroy())
    await new Promise((resolve) => proxy.listen(proxyPort, '127.0.0.1', resolve))
    console.log(`[r05c-local] env ${label} https proxy listening on 127.0.0.1:${proxyPort}`)
  }
  const waitReady = async () => {
    const healthUrl = `http://127.0.0.1:${webPort}/health/ready`
    for (let i = 0; i < 180; i++) {
      const probe = spawnSync('curl', ['-sf', '--max-time', '2', healthUrl])
      if (probe.status === 0) {
        console.log(`[r05c-local] env ${label} web ready`)
        return
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
    fail(`env ${label} web did not become ready; see scratch/rc1r05c/web-${label}.log`)
  }
  const start = async () => {
    startWeb()
    startWorker()
    await waitReady()
    await startProxy()
  }
  const stopProcesses = async () => {
    for (const proc of [web, worker]) {
      if (proc && proc.exitCode === null) {
        proc.kill('SIGTERM')
        await Promise.race([
          new Promise((r) => proc.once('exit', r)),
          new Promise((r) => setTimeout(r, 10000)),
        ])
        if (proc.exitCode === null) proc.kill('SIGKILL')
      }
    }
    spawnSync('pkill', ['-f', 'run-jobs-worker'])
  }
  const close = () => {
    try {
      proxy?.close()
    } catch {}
  }
  return { start, stopProcesses, startWeb, startWorker, waitReady, close }
}

const stackA = makeStack('a', envA, 38771, 38772)
const stackB = makeStack('b', envB, 38773, 38774)

process.on('exit', () => {
  spawnSync('pkill', ['-f', 'standalone/server.js'])
  spawnSync('pkill', ['-f', 'run-jobs-worker'])
})

// 3. Run a harness phase as a child process with the environment of its
// stack; the sandbox egress proxy env is stripped for every child (its
// Chromium uses --no-proxy-server + host-resolver-rules for .test hosts).
async function phase(name, env, script, args = []) {
  const logPath = path.join(scratch, `${name}.log`)
  const fd = openSync(logPath, 'w')
  const childEnv = { ...env }
  for (const k of [
    'http_proxy',
    'https_proxy',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'all_proxy',
  ])
    delete childEnv[k]
  const status = await new Promise((resolve) => {
    const child = spawn('npx', ['tsx', script, ...args], {
      cwd: repo,
      env: childEnv,
      stdio: ['ignore', fd, fd],
    })
    child.on('close', (code) => resolve(code ?? 1))
    child.on('error', () => resolve(1))
  })
  closeSync(fd)
  console.log(`[r05c-local] phase ${name}: exit ${status} (log: scratch/rc1r05c/${name}.log)`)
  return status === 0
}

const results = {}
await stackA.start()
results.journey = await phase('journey', envA, 'tests/rc1-r05c/verify-local.ts')
if (results.journey) {
  results.export = await phase('export', envA, 'tests/rc1-r05c/portability-local.ts')
} else {
  console.log('[r05c-local] journey failed; export/import/refetch/restart unexecuted')
}
if (results.export) {
  await stackB.start()
  results.import = await phase('import', envB, 'tests/rc1-r05c/portability-local.ts', ['--restore'])
  if (results.import) {
    results.refetch = await phase('refetch', envB, 'tests/rc1-r05c/verify-restore-local.ts')
  }
}

// 4. Restart both stacks' processes AND the PostgreSQL cluster, then
// re-verify env A persistence and env B public output.
if (results.journey && results.refetch) {
  await stackA.stopProcesses()
  await stackB.stopProcesses()
  await new Promise((r) => setTimeout(r, 1000))
  const pgRestart = spawnSync('pg_ctlcluster', ['16', 'main', 'restart'], { encoding: 'utf8' })
  if (pgRestart.status !== 0)
    fail(`PostgreSQL cluster restart failed: ${pgRestart.stderr || pgRestart.stdout}`)
  for (const env of [envA, envB]) {
    for (let i = 0; i < 60; i++) {
      const probe = spawnSync('psql', [env.DATABASE_URL, '-Atc', 'SELECT 1'], { encoding: 'utf8' })
      if (probe.status === 0 && probe.stdout.trim() === '1') break
      if (i === 59) fail('PostgreSQL did not accept connections after cluster restart')
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  console.log('[r05c-local] PostgreSQL cluster restarted; both disposable databases reachable')
  stackA.startWeb()
  stackA.startWorker()
  await stackA.waitReady()
  stackB.startWeb()
  stackB.startWorker()
  await stackB.waitReady()
  results.restart = await phase('restart', envA, 'tests/rc1-r05c/verify-local.ts', ['--restart'])
  results.refetchRestart = await phase(
    'refetch-restart',
    envB,
    'tests/rc1-r05c/verify-restore-local.ts',
    ['--restart'],
  )
} else {
  console.log('[r05c-local] restart phases unexecuted (earlier phase failed)')
}

// 5. Teardown + summary.
await stackA.stopProcesses()
await stackB.stopProcesses()
stackA.close()
stackB.close()
console.log(`[r05c-local] phase results: ${JSON.stringify(results)}`)
const required = ['journey', 'export', 'import', 'refetch', 'restart', 'refetchRestart']
process.exit(required.every((k) => results[k] === true) ? 0 : 1)
