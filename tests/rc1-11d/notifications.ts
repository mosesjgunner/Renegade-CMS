/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'
import { sink, sockets, messages } from './smtp-sink'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
assert.equal(process.env.RC1_11D_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5462/rc111d_release_acceptance',
)
assert.equal(process.env.EMAIL_MODE, 'smtp')
assert.equal(process.env.SMTP_HOST, '127.0.0.1')
assert.equal(process.env.SMTP_PORT, '3143')
const out = 'docs/rc/evidence/rc1/18-pass/11D'
const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
await new Promise<void>((resolve) => sink.listen(3143, '127.0.0.1', resolve))
const payload: any = await getPayload({ config })
async function workerCycle(label: string) {
  const heartbeat = `scratch/rc111d/${label}-heartbeat.json`
  const worker = spawn(process.execPath, ['--import', 'tsx', 'src/scripts/run-jobs-worker.ts'], {
    env: { ...process.env, WORKER_HEARTBEAT_FILE: heartbeat, WORKER_POLL_INTERVAL_MS: '60000' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const log = createWriteStream(`${out}/${label}.log`)
  worker.stdout!.pipe(log, { end: false })
  worker.stderr!.pipe(log, { end: false })
  try {
    const deadline = Date.now() + 120000
    while (Date.now() < deadline) {
      try {
        const value = JSON.parse(await readFile(heartbeat, 'utf8'))
        if (value.pid === worker.pid) return
      } catch {}
      if (worker.exitCode != null) throw new Error(`Worker exited ${worker.exitCode}`)
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error('Worker cycle timed out')
  } finally {
    if (worker.pid)
      await new Promise((resolve) =>
        spawn('taskkill', ['/PID', String(worker.pid), '/T', '/F'], { windowsHide: true }).once(
          'exit',
          resolve,
        ),
      )
    log.end()
  }
}
try {
  await workerCycle('notification-worker')
  const deliveries = await payload.find({
    collection: 'email-deliveries',
    where: { idempotencyKey: { equals: `commerce-refund-receipt:${state.refundId}` } },
    overrideAccess: true,
  })
  assert.equal(deliveries.docs.length, 1)
  const delivery = deliveries.docs[0]
  assert.equal(delivery.status, 'accepted')
  assert.equal(delivery.provider, 'smtp')
  const captured = messages.filter(
    (message) =>
      message.to === delivery.recipientEmail && message.raw.includes(delivery.idempotencyKey),
  )
  assert.equal(captured.length, 1)
  const count = messages.length
  await workerCycle('notification-worker-restart')
  assert.equal(messages.length, count)
  const packages = await payload.find({
    collection: 'manual-fulfillment-packages',
    where: { site: { equals: state.alpha } },
    overrideAccess: true,
  })
  assert.equal(packages.docs.length, 3)
  assert.ok(packages.docs.every((entry: any) => entry.status === 'pending_acknowledgement'))
  const fulfilled = await payload.find({
    collection: 'orders',
    where: { state: { equals: 'fulfilled' } },
    overrideAccess: true,
  })
  assert.equal(fulfilled.totalDocs, 0)
  await writeFile(
    `${out}/notifications.json`,
    JSON.stringify(
      {
        passed: 5,
        failed: 0,
        skipped: 0,
        checks: [
          'canonical refund correction worker persisted SMTP acceptance',
          'loopback SMTP sink captured exactly one matching correction MIME',
          'worker rerun sent zero duplicate messages',
          'three physical packages retain pending acknowledgement',
          'payment and email acceptance create zero fulfilled orders',
        ],
        deliveryId: delivery.id,
        status: delivery.status,
        provider: delivery.provider,
        captured: messages.map((message) => ({
          to: message.to,
          sha256: createHash('sha256').update(message.raw).digest('hex'),
        })),
        boundary: 'Loopback SMTP acceptance only; no remote inbox delivery claim.',
      },
      null,
      2,
    ),
  )
  console.log('PASS 5 notification worker, MIME sink, retry and provider truth assertions')
} finally {
  for (const socket of sockets) socket.destroy()
  await new Promise<void>((resolve) => sink.close(() => resolve()))
  const pool = payload.db.pool
  const idle = new Set(pool._idle.map((entry: any) => entry.client))
  for (const client of [...pool._clients])
    if (!idle.has(client)) {
      assert.ok(!client.activeQuery)
      client.release(true)
    }
  await pool.end()
  await payload.destroy()
}
