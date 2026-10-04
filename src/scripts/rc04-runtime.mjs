import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
const dir = 'docs/rc/evidence/rc-04'
mkdirSync(dir, { recursive: true })
const children = []
for (const name of ['smtp', 'proxy', 'web', 'worker']) writeFileSync(`${dir}/${name}.log`, '')
writeFileSync('scratch/rc04-worker-mode.txt', 'smtp')
let mode = 'smtp',
  restarting = false
function start(name, args, extraEnv = {}) {
  const child = spawn(process.execPath, args, {
    env: {
      ...process.env,
      WORKER_POLL_INTERVAL_MS: '1000',
      WORKER_HEARTBEAT_FILE: 'scratch/rc04-heartbeat.json',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => appendFileSync(`${dir}/${name}.log`, chunk))
  children.push(child)
  return child
}
start('smtp', ['tests/rc04/smtp-sink.mjs'])
start('proxy', ['src/scripts/rc02-https.mjs'])
start('web', ['--max-old-space-size=1536', '.next/standalone/server.js'])
const workerArgs = ['--max-old-space-size=512', '--import', 'tsx', 'src/scripts/run-jobs-worker.ts']
let worker = start('worker', workerArgs)
async function kill(child) {
  if (child.exitCode !== null) return
  if (process.platform === 'win32')
    await new Promise((resolve) =>
      spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      }).once('exit', resolve),
    )
  else child.kill('SIGTERM')
}
const timer = setInterval(async () => {
  if (restarting || !existsSync('scratch/rc04-worker-mode.txt')) return
  const next = readFileSync('scratch/rc04-worker-mode.txt', 'utf8').trim()
  if (!['smtp', 'disabled'].includes(next) || next === mode) return
  restarting = true
  const previousPid = worker.pid
  await kill(worker)
  mode = next
  worker = start('worker', workerArgs, { EMAIL_MODE: mode })
  writeFileSync(
    'scratch/rc04-worker-restart.json',
    JSON.stringify({ mode, previousPid, currentPid: worker.pid }),
  )
  restarting = false
}, 500)
async function stop() {
  clearInterval(timer)
  for (const child of children)
    if (child.exitCode === null) {
      if (process.platform === 'win32')
        await new Promise((resolve) =>
          spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
          }).once('exit', resolve),
        )
      else child.kill('SIGTERM')
    }
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
