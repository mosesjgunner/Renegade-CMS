/** Restart the local standalone web and worker twice; leave the second pair running. */
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { openSync, readFileSync, writeFileSync, cpSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
process.loadEnvFile('.env')
const root = process.cwd()
const origin = 'http://127.0.0.1:3121'
const heartbeat = path.join(root, 'test-results/pre-01-worker-heartbeat.json')
cpSync('theme-packages', '.next/standalone/theme-packages', { recursive: true })
cpSync('.next/static', '.next/standalone/.next/static', { recursive: true })
cpSync('public', '.next/standalone/public', { recursive: true })
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
await db.connect()
const stateQuery =
  'SELECT site_id,revision,active,draft,previous FROM presentation_theme_state ORDER BY site_id'
const before = (await db.query(stateQuery)).rows
assert(before.length, 'Activate and roll back a theme before the restart proof')
const evidence = []
const start = (args, log, extra) => {
  const output = openSync(log, 'a')
  const child = spawn(process.execPath, args, {
    cwd: root,
    detached: true,
    stdio: ['ignore', output, output],
    env: {
      ...process.env,
      RENEGADE_MODULES: 'all',
      RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT: 'true',
      LOCAL_E2E_TEST_MODE: 'true',
      APP_URL: origin,
      MEDIA_DIR: path.join(root, 'media'),
      ...extra,
    },
  })
  child.unref()
  return child
}
const stop = (child) => {
  if (process.platform === 'win32')
    execFileSync('C:/Windows/System32/taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    })
  else process.kill(-child.pid, 'SIGTERM')
}
const delay = () => new Promise((resolve) => setTimeout(resolve, 1000))
try {
  for (let round = 1; round <= 2; round++) {
    const web = start(['.next/standalone/server.js'], 'docs/presentation/pre-01-web.log', {
      PORT: '3121',
      HOSTNAME: '127.0.0.1',
    })
    const worker = start(
      ['--import', 'tsx', 'src/scripts/run-jobs-worker.ts'],
      'docs/presentation/pre-01-worker.log',
      { WORKER_HEARTBEAT_FILE: heartbeat, WORKER_POLL_INTERVAL_MS: '1000' },
    )
    let ready = false
    for (let attempt = 0; attempt < 90; attempt++) {
      try {
        const response = await fetch(origin + '/health/ready', {
          signal: AbortSignal.timeout(2000),
        })
        const beat = JSON.parse(readFileSync(heartbeat, 'utf8'))
        if (response.ok && beat.pid === worker.pid) {
          ready = true
          break
        }
      } catch {
        /* Cold startup is allowed; check again until the deadline. */
      }
      await delay()
    }
    if (!ready) {
      stop(web)
      stop(worker)
      throw new Error('Web/worker failed readiness. Inspect local verification logs.')
    }
    const response = await fetch(origin)
    assert.equal(response.status, 200)
    const html = await response.text()
    const {
      rows: [publication],
    } = await db.query(
      "SELECT site_id FROM publications WHERE status='active' AND visibility='public' ORDER BY created_at DESC LIMIT 1",
    )
    const expected = before.find((s) => s.site_id === publication.site_id).active
    assert(html.includes(`data-theme="${expected.id}"`))
    assert(html.includes(`data-theme-version="${expected.version}"`))
    assert.deepEqual((await db.query(stateQuery)).rows, before)
    evidence.push({
      round,
      webPid: web.pid,
      workerPid: worker.pid,
      ready: true,
      publicTheme: `${expected.id}@${expected.version}`,
      stateUnchanged: true,
    })
    console.log(
      'PASS restart round',
      round,
      'web and worker ready; public theme and full stored state unchanged',
    )
    if (round === 1) {
      stop(web)
      stop(worker)
      await delay()
    }
  }
  writeFileSync(
    'docs/presentation/pre-01-restart-evidence.json',
    JSON.stringify({ checkedAt: new Date().toISOString(), origin, evidence }, null, 2) + '\n',
  )
} finally {
  await db.end()
}
