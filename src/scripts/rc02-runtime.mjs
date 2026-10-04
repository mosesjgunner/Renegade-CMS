import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// This supervisor owns only its web, worker and TLS proxy children. It never discovers or
// stops unrelated checkout processes, and exposes no test-only HTTP routes.
const dir = resolve('docs/rc/evidence/rc-02')
mkdirSync(dir, { recursive: true })
const requestFile = resolve('scratch/rc02-restart-request.json')
const receiptFile = resolve('scratch/rc02-restart-receipt.json')
for (const file of [requestFile, receiptFile]) if (existsSync(file)) unlinkSync(file)
const env = {
  ...process.env,
  // Preserve the deployment DNS fixture and heap cap in any child processes.
  NODE_OPTIONS: `--max-old-space-size=1536 --import=${pathToFileURL(resolve('src/scripts/rc02-network.mjs')).href}`,
  WORKER_POLL_INTERVAL_MS: '1000',
  WORKER_HEARTBEAT_FILE: resolve('scratch/rc02-worker-heartbeat.json'),
}
let web,
  worker,
  proxy,
  restarting = false
function launch(label, args) {
  const child = spawn(process.execPath, args, {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => appendFileSync(resolve(dir, `${label}.log`), chunk))
  return child
}
function start() {
  web = launch('web', [
    '--max-old-space-size=1536',
    '.next/standalone/server.js',
  ])
  worker = launch('worker', [
    '--max-old-space-size=512',
    '--import',
    'tsx',
    'src/scripts/run-jobs-worker.ts',
  ])
}
async function stop(child) {
  if (!child || child.exitCode !== null) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    await new Promise((resolve) => killer.once('exit', resolve))
  } else child.kill('SIGTERM')
  await exited
}
proxy = launch('https-proxy', ['--max-old-space-size=128', 'src/scripts/rc02-https.mjs'])
start()
const timer = setInterval(async () => {
  if (!existsSync(requestFile) || restarting) return
  restarting = true
  const request = JSON.parse(readFileSync(requestFile, 'utf8'))
  unlinkSync(requestFile)
  const previous = { web: web.pid, worker: worker.pid }
  await Promise.all([stop(web), stop(worker)])
  start()
  writeFileSync(
    receiptFile,
    JSON.stringify({
      request,
      previous,
      current: { web: web.pid, worker: worker.pid },
      restartedAt: new Date().toISOString(),
    }),
  )
  restarting = false
}, 250)
async function shutdown() {
  clearInterval(timer)
  await Promise.all([stop(web), stop(worker), stop(proxy)])
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
