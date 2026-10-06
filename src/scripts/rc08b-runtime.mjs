import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
const dir = 'docs/rc/evidence/rc-08b'
mkdirSync(dir, { recursive: true })
const children = []
for (const name of ['smtp', 'proxy', 'web', 'worker']) writeFileSync(`${dir}/${name}.log`, '')
writeFileSync('scratch/rc08b-worker-mode.txt', 'smtp')
writeFileSync('scratch/rc08b-restart.txt', '0')
let mode = 'smtp',
  epoch = '0',
  restarting = false
function start(name, args, extraEnv = {}) {
  const child = spawn(process.execPath, args, {
    env: {
      ...process.env,
      WORKER_POLL_INTERVAL_MS: '1000',
      WORKER_HEARTBEAT_FILE: 'scratch/rc08b-heartbeat.json',
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
start('smtp', ['tests/rc08b/smtp-sink.mjs'])
start('proxy', ['src/scripts/rc02-https.mjs'])
let web = start('web', ['--max-old-space-size=1536', '.next/standalone/server.js'])
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
  if (restarting || !existsSync('scratch/rc08b-worker-mode.txt')) return
  const requestedEpoch = existsSync('scratch/rc08b-restart.txt')
    ? readFileSync('scratch/rc08b-restart.txt', 'utf8').trim()
    : '0'
  if (requestedEpoch !== epoch) {
    restarting = true
    const previousWebPid = web.pid,
      previousWorkerPid = worker.pid
    await kill(web)
    await kill(worker)
    web = start('web', ['--max-old-space-size=1536', '.next/standalone/server.js'])
    worker = start('worker', workerArgs)
    epoch = requestedEpoch
    writeFileSync(
      'scratch/rc08b-restarted.json',
      JSON.stringify({
        epoch,
        previousWebPid,
        previousWorkerPid,
        webPid: web.pid,
        workerPid: worker.pid,
      }),
    )
    restarting = false
    return
  }
  const next = readFileSync('scratch/rc08b-worker-mode.txt', 'utf8').trim()
  if (!['smtp', 'disabled'].includes(next) || next === mode) return
  restarting = true
  const previousPid = worker.pid
  await kill(worker)
  mode = next
  worker = start('worker', workerArgs, { EMAIL_MODE: mode })
  writeFileSync(
    'scratch/rc08b-worker-restart.json',
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
