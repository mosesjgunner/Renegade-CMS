import { spawn } from 'node:child_process'
import { createServer, connect, type Socket } from 'node:net'
import { connect as connectTls } from 'node:tls'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from 'pg'
import { safeSocketLookup } from '../modules/core/external-boundary'
import {
  decryptDestination,
  destinationKey,
  relayBitrateKbps,
  termsVersion,
  validateTarget,
  type DestinationProvider,
} from '../modules/live-media/destination-credentials'

type Target = ReturnType<typeof validateTarget>
type Destination = { destination_id: string; provider: DestinationProvider; credential: Buffer }
type Run = Destination & {
  id: string
  provider_ref: string
  deadline: Date
  bytes_sent: string
  byte_limit: string
  status: string
  allowed: boolean
  next_attempt_at: Date
  attempt: number
  retry_budget: number
}
type Relay = {
  bytes: number
  startedAt: number
  lastFrameAt: number
  result?: 'failed' | 'budget_exhausted'
  close: () => Promise<void>
}

const activeStates = "('queued','retrying','connecting','sending')"
const db = new Client({
  connectionString: process.env.DATABASE_URL,
  query_timeout: 4000,
  connectionTimeoutMillis: 4000,
})
const source = new URL(process.env.LIVE_RELAY_RTSP_URL ?? 'rtsp://live-mediamtx:8554')
const key = destinationKey()
const active = new Map<string, Relay>()
const probing = new Map<string, Socket>()
const maxActive = 4
let exiting = false

function targetFor(destination: Destination) {
  if (!key) throw new Error('Encryption unavailable')
  const credential = decryptDestination(key, destination.destination_id, destination.credential)
  return validateTarget(destination.provider, credential.ingest, credential.key)
}

function dial(target: Target, ready: () => void) {
  const options = {
    host: target.url.hostname,
    port: target.port,
    lookup: safeSocketLookup(target.localFixture),
  }
  return target.url.protocol === 'rtmps:'
    ? connectTls({ ...options, servername: options.host, rejectUnauthorized: true }, ready)
    : connect(options, ready)
}

async function transition(
  run: Run,
  status: string,
  bytes = Number(run.bytes_sent),
  attempt = run.attempt,
) {
  await db.query(
    `WITH changed AS (
       UPDATE live_destination_runs SET status=$2,bytes_sent=$3,attempt=$4,
       next_attempt_at=now()+make_interval(secs=>LEAST(30, 2 << $4))
       WHERE id=$1 RETURNING id,destination_id
     ) INSERT INTO live_destination_audit(destination_id,run_id,event)
       SELECT destination_id,id,$2 FROM changed`,
    [run.id, status, bytes, attempt],
  )
}

async function finishProbe(id: string, result: 'reachable' | 'unreachable') {
  await db.query(
    `WITH changed AS (
       UPDATE live_destinations SET probe=$2 WHERE id=$1 AND probe='checking' RETURNING id
     ) INSERT INTO live_destination_audit(destination_id,event) SELECT id,$2 FROM changed`,
    [id, result],
  )
}

async function probes() {
  const { rows } = await db.query<Destination>(
    `SELECT d.id AS destination_id,d.provider,c.credential FROM live_destinations d
     JOIN live_destination_credentials c ON c.destination_id=d.id
     WHERE d.probe='queued' LIMIT $1`,
    [maxActive - probing.size],
  )
  for (const row of rows) {
    const id = row.destination_id
    const claimed = await db.query(
      "UPDATE live_destinations SET probe='checking' WHERE id=$1 AND probe='queued' RETURNING id",
      [id],
    )
    if (!claimed.rowCount) continue
    try {
      const socket = dial(targetFor(row), () => {
        const hello = Buffer.alloc(1537)
        hello[0] = 3
        socket.write(hello)
      })
      probing.set(id, socket)
      const timer = setTimeout(() => complete('unreachable'), 5000)
      let received = 0
      function complete(result: 'reachable' | 'unreachable') {
        if (!probing.delete(id)) return
        clearTimeout(timer)
        socket.destroy()
        void finishProbe(id, result).catch(() => {
          exiting = true
        })
      }
      socket.once('error', () => complete('unreachable'))
      socket.once('close', () => complete('unreachable'))
      socket.on('data', (chunk: Buffer) => {
        if (received === 0 && chunk[0] !== 3) return complete('unreachable')
        received += chunk.length
        if (received >= 3073) complete('reachable')
      })
    } catch {
      await finishProbe(id, 'unreachable')
    }
  }
}

async function forward(run: Run, target: Target): Promise<Relay> {
  const remaining = Number(run.byte_limit) - Number(run.bytes_sent)
  const sockets = new Set<Socket>()
  let child: ReturnType<typeof spawn> | undefined
  let childClosed: Promise<unknown> | undefined
  let deadline: NodeJS.Timeout | undefined
  let pacing: NodeJS.Timeout | undefined
  let close: Promise<void> | undefined
  const relay: Relay = {
    bytes: 0,
    startedAt: Date.now(),
    lastFrameAt: 0,
    close() {
      close ??= (async () => {
        clearTimeout(deadline)
        clearTimeout(pacing)
        for (const socket of sockets) socket.destroy()
        server.close()
        child?.kill('SIGKILL')
        await childClosed
      })()
      return close
    },
  }
  const end = (result: NonNullable<Relay['result']>) => {
    relay.result ??= result
    void relay.close()
  }
  const server = createServer((local) => {
    if (sockets.size || relay.result) {
      local.destroy()
      return
    }
    local.pause()
    const remote = dial(target, () => {
      remote.pipe(local)
      local.resume()
    })
    sockets.add(local)
    sockets.add(remote)
    for (const socket of sockets) {
      socket.on('error', () => end('failed'))
      socket.on('close', () => end('failed'))
    }
    function resume() {
      if (!pacing && !remote.writableNeedDrain && !close) local.resume()
    }
    remote.on('drain', resume)
    local.on('data', (chunk: Buffer) => {
      if (relay.result || close) return
      if (relay.bytes + chunk.length > remaining) {
        end('budget_exhausted')
        return
      }
      relay.bytes += chunk.length
      local.pause()
      remote.write(chunk)
      pacing = setTimeout(
        () => {
          pacing = undefined
          resume()
        },
        Math.ceil((chunk.length * 8) / relayBitrateKbps),
      )
    })
  })
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Relay listener unavailable')
    server.on('error', () => end('failed'))
    deadline = setTimeout(
      () => end('budget_exhausted'),
      Math.max(0, run.deadline.getTime() - Date.now()),
    )
    const base = target.url
    const input = new URL(run.provider_ref, source)
    const processHandle = spawn(
      process.env.LIVE_RELAY_FFMPEG || 'ffmpeg',
      [
        '-hide_banner',
        '-nostdin',
        '-loglevel',
        'quiet',
        '-nostats',
        '-progress',
        'pipe:1',
        '-rtsp_transport',
        'tcp',
        '-threads',
        '2',
        '-i',
        input.href,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0',
        '-filter_threads',
        '1',
        '-vf',
        'scale=-2:min(720\\,ih),fps=30',
        '-c:v',
        'libx264',
        '-threads',
        '2',
        '-preset',
        'veryfast',
        '-tune',
        'zerolatency',
        '-b:v',
        `${relayBitrateKbps - 200}k`,
        '-maxrate',
        `${relayBitrateKbps - 200}k`,
        '-bufsize',
        '1250k',
        '-g',
        '60',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-ar',
        '48000',
        '-flvflags',
        'no_duration_filesize',
        '-f',
        'flv',
        '-rtmp_tcurl',
        `${base.protocol}//${base.hostname}:${target.port}${base.pathname}`,
        `rtmp://127.0.0.1:${address.port}${base.pathname}/${target.key}`,
      ],
      {
        stdio: ['ignore', 'pipe', 'ignore'],
        env: {
          NODE_ENV: process.env.NODE_ENV,
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
        },
      },
    )
    child = processHandle
    childClosed = new Promise((resolve) => processHandle.once('close', resolve))
    processHandle.once('error', () => end('failed'))
    processHandle.once('close', () => end('failed'))
    let progress = ''
    processHandle.stdout?.on('data', (chunk: Buffer) => {
      const lines = (progress + chunk.toString()).split('\n')
      progress = lines.pop() ?? ''
      if (lines.some((line) => /^frame=\s*[1-9]\d*/.test(line))) relay.lastFrameAt = Date.now()
    })
    return relay
  } catch {
    await relay.close()
    throw new Error('Relay unavailable')
  }
}

async function tick() {
  const { rows } = await db.query<Run>(
    `SELECT r.*,s.provider_ref,d.provider,d.byte_limit,d.retry_budget,c.credential,
       (NOT r.stop_requested AND s.ended_at IS NULL AND s.provider='mediamtx'
       AND c.destination_id IS NOT NULL AND d.revoked_at IS NULL AND d.terms_version=$1
       AND EXISTS (SELECT 1 FROM live_destination_public_rooms WHERE room_id=d.room_id)) AS allowed
     FROM live_destination_runs r JOIN live_destinations d ON d.id=r.destination_id
     JOIN live_media_sessions s ON s.id=r.session_id
     LEFT JOIN live_destination_credentials c ON c.destination_id=d.id
     WHERE r.status IN ${activeStates} ORDER BY r.created_at`,
    [termsVersion],
  )
  const ids = new Set(rows.map((run) => run.id))
  for (const [id, relay] of active) {
    if (ids.has(id)) continue
    await relay.close()
    active.delete(id)
  }
  for (const run of rows) {
    const relay = active.get(run.id)
    const now = Date.now()
    const expired = run.deadline.getTime() <= now
    if (!run.allowed || expired) {
      await relay?.close()
      active.delete(run.id)
      await transition(
        run,
        run.allowed ? 'budget_exhausted' : 'stopped',
        Number(run.bytes_sent) + (relay?.bytes ?? 0),
      )
      continue
    }
    if (relay) {
      if (relay.result || now - (relay.lastFrameAt || relay.startedAt) > 15000) {
        await relay.close()
        active.delete(run.id)

        const status =
          relay.result === 'budget_exhausted'
            ? 'budget_exhausted'
            : run.attempt <= run.retry_budget
              ? 'retrying'
              : 'failed'
        await transition(run, status, Number(run.bytes_sent) + relay.bytes)
      } else if (relay.lastFrameAt && run.status !== 'sending') {
        await transition(run, 'sending')
      }
      continue
    }
    if (active.size >= maxActive || run.next_attempt_at.getTime() > now) continue
    if (Number(run.bytes_sent) >= Number(run.byte_limit)) {
      await transition(run, 'budget_exhausted')
      continue
    }
    const attempt = run.attempt + 1
    await transition(run, 'connecting', Number(run.bytes_sent), attempt)
    try {
      active.set(run.id, await forward(run, targetFor(run)))
    } catch {
      await transition(run, 'failed', Number(run.bytes_sent), attempt)
    }
  }
  await probes()
}

async function main() {
  if (!key || source.protocol !== 'rtsp:' || (source.pathname !== '/' && source.pathname !== ''))
    throw new Error('Relay configuration unavailable')
  await db.connect()
  db.on('error', () => {
    exiting = true
  })
  const lock = await db.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(1022010) AS locked')
  if (!lock.rows[0].locked) throw new Error('Relay already running')
  // Interrupted sends cannot recover trustworthy byte accounting.
  await db.query(`WITH changed AS (
    UPDATE live_destination_runs SET status='interrupted' WHERE status IN ('connecting','sending')
    RETURNING id,destination_id
  ) INSERT INTO live_destination_audit(destination_id,run_id,event)
    SELECT destination_id,id,'interrupted' FROM changed`)
  await db.query("UPDATE live_destinations SET probe='queued' WHERE probe='checking'")
  while (!exiting) {
    await tick()
    await delay(750)
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    exiting = true
  })

main()
  .catch(() => {
    process.exitCode = 1
    console.error('Live destination worker stopped.')
  })
  .finally(async () => {
    for (const socket of probing.values()) socket.destroy()
    probing.clear()
    await Promise.all([...active.values()].map((relay) => relay.close()))
    await db.end()
  })
