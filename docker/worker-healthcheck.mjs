import { readFile } from 'node:fs/promises'

const heartbeatFile = process.env.WORKER_HEARTBEAT_FILE ?? '/tmp/renegade-worker/heartbeat.json'
const maxAgeMs = Number(process.env.WORKER_HEARTBEAT_MAX_AGE_MS ?? 45_000)

try {
  const heartbeat = JSON.parse(await readFile(heartbeatFile, 'utf8'))
  if (!heartbeat.observedAt || Date.now() - Date.parse(heartbeat.observedAt) > maxAgeMs)
    process.exit(1)
} catch {
  process.exit(1)
}
