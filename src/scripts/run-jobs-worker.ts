import { writeFile } from 'node:fs/promises'

import config from '../payload.config'
import { getPayload } from 'payload'

const pollInterval = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 10_000)
const heartbeatFile = process.env.WORKER_HEARTBEAT_FILE ?? '/tmp/renegade-worker/heartbeat.json'

if (!Number.isInteger(pollInterval) || pollInterval < 1_000 || pollInterval > 60_000) {
  throw new Error('WORKER_POLL_INTERVAL_MS must be an integer between 1000 and 60000')
}

const payload = await getPayload({ config })
let stopping = false
let timer: NodeJS.Timeout | undefined

async function cycle(): Promise<void> {
  try {
    await payload.jobs.handleSchedules({ queue: 'operations' })
    await payload.jobs.run({ queue: 'operations' })
    await writeFile(
      heartbeatFile,
      JSON.stringify({ observedAt: new Date().toISOString(), pid: process.pid }),
    )
  } catch (error) {
    payload.logger.error({ err: error, event: 'operations.worker.cycle_failed' })
  } finally {
    if (!stopping) timer = setTimeout(cycle, pollInterval)
  }
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return
  stopping = true
  if (timer) clearTimeout(timer)
  payload.logger.info({ event: 'operations.worker.stopping', signal })
  await payload.destroy()
  process.exit(0)
}

process.once('SIGTERM', () => void shutdown('SIGTERM'))
process.once('SIGINT', () => void shutdown('SIGINT'))
await cycle()
