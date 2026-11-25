/**
 * RC3-23 #83 re-validation harness — NOT a vitest suite.
 *
 * Queues three real jobs on the seeded acceptance DB — the retention
 * purge `analytics-retention-cleanup` BY NAME (the task RC3-21 found
 * stranded on an unserviced queue), a commerce job
 * (`commerce-reconcile-payments`), and the operations heartbeat — then
 * runs the product's real worker (`src/scripts/run-jobs-worker.ts`) as
 * a subprocess and asserts every job completed exactly once through
 * the worker, and that the purge deleted exactly the expired,
 * unheld analytics event.
 *
 * Run:  tsx tests/rc3-23/worker-proof.ts   (env: rc323-env.local)
 * Exit: 0 + `WORKER_PROOF={...}` line on success; 1 on any failure.
 */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { getPayload } from 'payload'

import config from '../../src/payload.config'

const suffix = randomUUID().slice(0, 8)
const heartbeatFile = '/tmp/rc323-worker-heartbeat.json'
process.env.WORKER_HEARTBEAT_FILE = heartbeatFile

const payload = await getPayload({ config })
const fail = (msg: string): never => {
  console.error(`WORKER_PROOF_FAILED: ${msg}`)
  process.exit(1)
}

const sites = await payload.find({ collection: 'sites', limit: 1, overrideAccess: true } as never)
const siteId = (sites.docs[0] as { id: string }).id
if (!siteId) fail('no seeded site found')

// --- Plant the retention-purge fixture (mirrors RC3-21's governance journey)
const now = Date.now()
const day = 24 * 60 * 60 * 1000
const mkEvent = (label: string, data: Record<string, unknown>) =>
  payload.create({
    collection: 'analytics-events',
    data: {
      site: siteId,
      eventId: `rc323-${label}-${suffix}`,
      dedupeKey: `rc323-${label}-${suffix}`,
      eventType: 'rc323.retention-probe',
      occurredAt: new Date(now).toISOString(),
      receivedAt: new Date(now).toISOString(),
      schemaVersion: 1,
      consentBasis: 'necessary',
      context: {},
      ...data,
    },
    overrideAccess: true,
  } as never)
const expiredPurgeable = await mkEvent('expired-purgeable', {
  retentionMode: 'expire-at',
  retentionHold: 'none',
  retentionExpiresAt: new Date(now - day).toISOString(),
})
const expiredHeld = await mkEvent('expired-held', {
  retentionMode: 'expire-at',
  retentionHold: 'legal',
  retentionExpiresAt: new Date(now - day).toISOString(),
})
const unexpired = await mkEvent('unexpired', {
  retentionMode: 'expire-at',
  retentionHold: 'none',
  retentionExpiresAt: new Date(now + day).toISOString(),
})
const eventIds = [expiredPurgeable, expiredHeld, unexpired].map((d: { id: string }) => String(d.id))

// --- Queue the three real jobs
const queueJob = (task: string, queue: string) =>
  payload.jobs.queue({ task, input: {}, queue } as never) as Promise<{ id: string }>
const purgeJob = await queueJob('analytics-retention-cleanup', 'analytics')
const commerceJob = await queueJob('commerce-reconcile-payments', 'commerce')
const heartbeatJob = await queueJob('operations-heartbeat', 'operations')
const jobIds = { purge: purgeJob.id, commerce: commerceJob.id, heartbeat: heartbeatJob.id }
console.log(`queued: ${JSON.stringify(jobIds)}`)

// --- Run the real worker as a subprocess
const tsxCLI = path.resolve('node_modules/tsx/dist/cli.mjs')
const worker = spawn(process.execPath, [tsxCLI, 'src/scripts/run-jobs-worker.ts'], {
  env: { ...process.env, WORKER_POLL_INTERVAL_MS: '1000', WORKER_HEARTBEAT_FILE: heartbeatFile },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let workerLog = ''
worker.stdout.on('data', (d) => (workerLog += d))
worker.stderr.on('data', (d) => (workerLog += d))

const deadline = Date.now() + 180_000
let states: Record<string, { completedAt?: string; hasError?: boolean; totalTried?: number }> = {}
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 2_000))
  states = {}
  for (const [name, id] of Object.entries(jobIds)) {
    const job = (await payload.findByID({
      collection: 'payload-jobs',
      id,
      overrideAccess: true,
    } as never)) as { completedAt?: string; hasError?: boolean; totalTried?: number }
    states[name] = job
  }
  if (Object.values(states).every((s) => s.completedAt)) break
}
worker.kill('SIGTERM')
await new Promise((r) => setTimeout(r, 3_000))
if (worker.exitCode === null) worker.kill('SIGKILL')

for (const [name, s] of Object.entries(states)) {
  if (!s.completedAt) fail(`${name} job did not complete through the worker: ${JSON.stringify(s)}`)
  if (s.hasError) fail(`${name} job completed with an error`)
  if (s.totalTried !== 1) fail(`${name} job totalTried=${s.totalTried}, expected exactly 1`)
}
if (!existsSync(heartbeatFile)) fail('worker heartbeat file was not written')

// --- Purge outcome: exactly the expired, unheld event is gone
const remaining = await payload.find({
  collection: 'analytics-events',
  where: { id: { in: eventIds } },
  depth: 0,
  overrideAccess: true,
} as never)
const remainingIds = remaining.docs.map((d: { id: string }) => String(d.id)).sort()
const expected = [String(expiredHeld.id), String(unexpired.id)].sort()
if (JSON.stringify(remainingIds) !== JSON.stringify(expected))
  fail(
    `purge outcome wrong: remaining=${JSON.stringify(remainingIds)} expected=${JSON.stringify(expected)}`,
  )

console.log(
  `WORKER_PROOF=${JSON.stringify({
    jobs: Object.fromEntries(
      Object.entries(states).map(([k, v]) => [
        k,
        { totalTried: v.totalTried, hasError: v.hasError },
      ]),
    ),
    purgeDeleted: [String(expiredPurgeable.id)],
    purgeSurvivors: remainingIds,
    heartbeatFile: true,
  })}`,
)
await payload.db?.destroy?.()
process.exit(0)
