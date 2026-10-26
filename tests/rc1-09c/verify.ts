/* eslint-disable @typescript-eslint/no-explicit-any -- isolated operator/provider acceptance */
import assert from 'node:assert/strict'
import { createServer as smtpServer } from 'node:net'
import { createServer as httpServer } from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  queueTestSend,
  suppressSubscriber,
  processProviderSuppressionEvent,
} from '../../src/modules/audience/service'
import { audienceDigest } from '../../src/modules/audience/contracts'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { POST as retry } from '../../src/app/(frontend)/api/admin/audience/retry/route'
import { POST as campaign } from '../../src/app/(frontend)/api/admin/audience/campaign/route'

assert.equal(process.env.RC1_09C_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5451/rc109c_release_acceptance',
)
assert.equal(process.env.SMTP_HOST, '127.0.0.1')
assert.equal(process.env.TELECOM_ALLOW_OUTBOUND, 'false')
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
const out = 'docs/rc/evidence/rc1/18-pass/09C'
await mkdir(out, { recursive: true })
const payload: any = await getPayload({ config })
const trace: any[] = []
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  trace.push({ name, passed: true })
  console.log(`PASS ${trace.length}: ${name}`)
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(name: string, fn: () => Promise<any>, timeout = 45000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const value = await fn()
    if (value) return value
    await wait(250)
  }
  throw new Error(`Timed out: ${name}`)
}
const get = (id: string) =>
  payload.findByID({ collection: 'email-deliveries', id, depth: 0, overrideAccess: true })
let worker: ChildProcess | undefined
let workerNumber = 0
const sockets = new Set<any>()
const messages: any[] = []
const rejections = new Map<string, number>()
let holdSeen = false
const sink = smtpServer((socket) => {
  sockets.add(socket)
  socket.on('close', () => sockets.delete(socket))
  socket.on('error', () => {})
  let input = '',
    data = false,
    lines: string[] = [],
    to = ''
  socket.write('220 rc109c.local ESMTP\r\n')
  socket.on('data', (chunk) => {
    input += chunk.toString()
    while (input.includes('\r\n')) {
      const end = input.indexOf('\r\n'),
        line = input.slice(0, end)
      input = input.slice(end + 2)
      if (data) {
        if (line !== '.') {
          lines.push(line.replace(/^\.\./, '.'))
          continue
        }
        const raw = lines.join('\r\n') + '\r\n'
        messages.push({ to, raw, at: new Date().toISOString() })
        lines = []
        data = false
        if (to.includes('hold@')) {
          holdSeen = true
          continue
        }
        if (to.includes('unknown@')) {
          socket.destroy()
          continue
        }
        socket.write(`250 captured-${messages.length}\r\n`)
      } else if (/^(EHLO|HELO)/i.test(line)) socket.write('250-rc109c.local\r\n250 8BITMIME\r\n')
      else if (/^RCPT TO:/i.test(line)) {
        to = line.slice(8).trim().replace(/[<>]/g, '')
        assert.match(to, /@example\.test$/)
        const failures = rejections.get(to) ?? 0
        if (to.startsWith('permanent@')) socket.write('550 local permanent rejection\r\n')
        else if (
          to.startsWith('exhaust@') ||
          (to.startsWith('temporary@') && failures === 0) ||
          (to.startsWith('recover@') && failures < 4)
        ) {
          rejections.set(to, failures + 1)
          socket.write('451 local temporary rejection\r\n')
        } else socket.write('250 recipient accepted\r\n')
      } else if (/^DATA/i.test(line)) {
        data = true
        socket.write('354 end with dot\r\n')
      } else if (/^QUIT/i.test(line)) socket.end('221 goodbye\r\n')
      else socket.write('250 OK\r\n')
    }
  })
})
const api = httpServer(async (req, res) => {
  try {
    let body = ''
    for await (const chunk of req) body += chunk
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers))
      if (value) headers.set(key, String(value))
    const request = new Request(`http://localhost:39001${req.url}`, {
      method: 'POST',
      headers,
      body,
    })
    const result = await (req.url?.startsWith('/retry') ? retry(request) : campaign(request))
    res.writeHead(result.status, Object.fromEntries(result.headers))
    res.end(await result.text())
  } catch (error) {
    res.writeHead(500)
    res.end(String(error))
  }
})
function startWorker() {
  workerNumber++
  worker = spawn(process.execPath, ['--import', 'tsx', 'src/scripts/run-jobs-worker.ts'], {
    env: process.env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const log = createWriteStream(`${out}/worker-${workerNumber}.log`)
  worker.stdout!.pipe(log)
  worker.stderr!.pipe(log)
  return worker
}
async function stopWorker() {
  if (worker && worker.exitCode === null) {
    const current = worker
    const exited = new Promise<void>((resolve) => current.once('exit', () => resolve()))
    current.kill('SIGKILL')
    await exited
  }
  worker = undefined
}
let cookie = ''
async function post(path: string, body: any, auth = cookie, origin = 'http://localhost:39001') {
  return fetch(`http://localhost:39001${path}`, {
    method: 'POST',
    headers: { cookie: auth, origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
const design = {
  version: 1,
  templateVersion: '09c-v1',
  locale: 'en',
  tokens: {},
  plainTextStrategy: 'generated',
  personalization: { missingValue: 'fallback', fallbacks: {} },
  blocks: [
    { type: 'text', text: '09C exact controlled body.' },
    {
      type: 'legal',
      address: '09C local test address',
      preferenceUrl: 'http://localhost:39001/subscribe/preferences',
    },
  ],
}
try {
  if (process.argv.includes('--restart')) {
    const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
    for (const expected of state.deliveries) {
      const row = await get(expected.id)
      check(
        `restart ${expected.recipientEmail}: status and lifetime attempts retained`,
        row.status === expected.status &&
          row.attempts === expected.attempts &&
          row.providerMessageId === expected.providerMessageId,
      )
    }
    const { recoverEmailOutbox } = await import('../../src/modules/audience/tasks')
    await recoverEmailOutbox(payload)
    for (const expected of state.deliveries)
      check(
        `restart replay ${expected.recipientEmail}: no attempt added`,
        (await get(expected.id)).attempts === expected.attempts,
      )
    await writeFile(`${out}/restart-trace.json`, JSON.stringify(trace, null, 2))
  } else {
    await new Promise<void>((resolve) => sink.listen(3139, '127.0.0.1', resolve))
    await new Promise<void>((resolve) => api.listen(39001, '127.0.0.1', resolve))
    const site = await payload.create({
      collection: 'sites',
      data: { name: '09C controlled', slug: 'rc109c', lifecycle: 'active' },
      overrideAccess: true,
    })
    const owner = await payload.create({
      collection: 'users',
      data: { email: 'owner@example.test', role: 'owner' },
      overrideAccess: true,
    })
    const session = await createPasskeySession(
      owner,
      process.env.PAYLOAD_SECRET!,
      async (id, expiresAt) => {
        await payload.db.pool.query(
          'INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)',
          [id, owner.id, expiresAt],
        )
      },
    )
    cookie = `renegade-passkey=${session.token}; renegade-active-site=${site.id}`
    // HTTP forwarding invokes the unchanged product route handlers with real persisted sessions.
    check(
      'anonymous campaign send denied',
      (await post('/campaign', { action: 'test-send' }, '')).status === 403,
    )
    const send = async (to: string) => {
      const response = await post(`/campaign?siteId=${site.id}`, {
        action: 'test-send',
        recipientEmail: to,
        subject: '09C controlled MIME',
        messageDesign: design,
      })
      const body = (await response.json()) as any
      assert.equal(response.status, 200, JSON.stringify(body))
      return String(body.deliveryId)
    }
    const accepted = await send('accepted@example.test')
    check(
      'operator HTTP creates queued persisted delivery',
      (await get(accepted)).status === 'queued',
    )
    startWorker()
    await until('accepted SMTP', async () => (await get(accepted)).status === 'accepted')
    check(
      'actual SMTP DATA exact plain text and HTML captured',
      messages.length === 1 &&
        messages[0].raw.includes('09C exact controlled body.') &&
        messages[0].raw.includes('multipart/alternative'),
    )
    check(
      'message identity and persistent attempt',
      (await get(accepted)).attempts === 1 &&
        messages[0].raw.includes((await get(accepted)).rfcMessageId),
    )
    check(
      'accepted retry rejected',
      (await post('/retry', { deliveryId: accepted })).status === 409,
    )
    check(
      'foreign origin retry denied',
      (await post('/retry', { deliveryId: accepted }, cookie, 'https://foreign.example.test'))
        .status === 403,
    )
    const temporary = await send('temporary@example.test')
    await until('451 retry', async () => (await get(temporary)).status === 'accepted')
    check(
      '451 automatically retries and accepts exactly once',
      (await get(temporary)).attempts === 2 &&
        messages.filter((m) => m.to === 'temporary@example.test').length === 1,
    )
    const recovered = await send('recover@example.test')
    await until(
      'recoverable exhaustion',
      async () => (await get(recovered)).status === 'dead-letter',
    )
    check(
      'failed-only HTTP retry accepts a safe exhausted delivery',
      (await post('/retry', { deliveryId: recovered })).status === 200,
    )
    await until(
      'operator retry acceptance',
      async () => (await get(recovered)).status === 'accepted',
    )
    check(
      'operator retry succeeds with lifetime attempt five and one DATA',
      (await get(recovered)).attempts === 5 &&
        messages.filter((m) => m.to === 'recover@example.test').length === 1,
    )
    const permanent = await send('permanent@example.test')
    await until('550 permanent failure', async () => (await get(permanent)).status === 'failed')
    check(
      'permanent failure is durable and not retried',
      (await get(permanent)).attempts === 1 &&
        (await post('/retry', { deliveryId: permanent })).status === 409,
    )
    const exhausted = await send('exhaust@example.test')
    await until('retry cap', async () => (await get(exhausted)).status === 'dead-letter')
    check('retry cap persists four attempts', (await get(exhausted)).attempts === 4)
    await stopWorker()
    check(
      'failed-only operator retry queues exhausted delivery',
      (await post('/retry', { deliveryId: exhausted })).status === 200,
    )
    check(
      'queued retry cannot enqueue another retry',
      (await post('/retry', { deliveryId: exhausted })).status === 409,
    )
    // Suppression races the retry; neither resetting attempts nor modifying statuses is used.
    await suppressSubscriber(payload, {
      siteId: site.id,
      email: 'exhaust@example.test',
      reason: 'operator',
    })
    startWorker()
    await until(
      'suppressed retry cancelled',
      async () => (await get(exhausted)).status === 'cancelled',
    )
    check(
      'suppression wins on retry with lifetime attempts preserved',
      (await get(exhausted)).attempts === 4 &&
        !messages.some((m) => m.to === 'exhaust@example.test'),
    )
    const unknown = await send('unknown@example.test')
    await until('lost response quarantine', async () => (await get(unknown)).status === 'unknown')
    check(
      'lost SMTP response quarantined without resend',
      (await get(unknown)).attempts === 1 &&
        (await post('/retry', { deliveryId: unknown })).status === 409,
    )
    const held = await send('hold@example.test')
    await until('held DATA', async () => holdSeen)
    const sending = await get(held)
    check(
      'mid-send persisted lease/provider/attempt',
      sending.status === 'sending' &&
        !!sending.leaseUntil &&
        sending.provider === 'smtp' &&
        sending.attempts === 1,
    )
    await stopWorker()
    for (const socket of sockets) socket.destroy()
    startWorker()
    await until('natural lease recovery', async () => (await get(held)).status === 'unknown', 90000)
    check(
      'real worker kill and lease expiry quarantines accepted DATA once',
      messages.filter((m) => m.to === 'hold@example.test').length === 1 &&
        (await get(held)).attempts === 1,
    )
    check(
      'restart never duplicates successful/unknown sends',
      messages.filter((m) => m.to === 'accepted@example.test').length === 1 &&
        messages.filter((m) => m.to === 'unknown@example.test').length === 1,
    )
    await stopWorker()
    const acceptedRow = await get(accepted)
    await processProviderSuppressionEvent(payload, {
      siteId: site.id,
      email: acceptedRow.recipientEmail,
      event: 'bounce',
      provider: 'smtp',
      providerMessageId: acceptedRow.providerMessageId,
      providerEventId: 'controlled-bounce-09c',
    })
    check(
      'controlled bounce event persists bounced state and suppression',
      (await get(accepted)).status === 'bounced' &&
        (
          await payload.find({
            collection: 'suppressions',
            where: { emailHash: { equals: audienceDigest(acceptedRow.recipientEmail) } },
            overrideAccess: true,
          })
        ).docs.length === 1,
    )
    await processProviderSuppressionEvent(payload, {
      siteId: site.id,
      email: acceptedRow.recipientEmail,
      event: 'bounce',
      provider: 'smtp',
      providerMessageId: acceptedRow.providerMessageId,
      providerEventId: 'controlled-bounce-09c',
    })
    check(
      'bounce event replay is idempotent',
      (await payload.find({ collection: 'email-delivery-events', overrideAccess: true })).docs
        .length === 1,
    )
    // Supported authenticated Payload local API creates a transactional draft; canonical queue service deduplicates.
    const transactional = await payload.create({
      collection: 'email-messages',
      data: {
        site: site.id,
        subject: 'Dedup',
        kind: 'transactional',
        status: 'draft',
        blocks: [{ type: 'text', text: 'Dedup exact body' }],
      },
      user: owner,
      overrideAccess: false,
    })
    const first = await queueTestSend(payload, {
      messageId: transactional.id,
      recipientEmail: 'dedup@example.test',
    })
    const second = await queueTestSend(payload, {
      messageId: transactional.id,
      recipientEmail: 'dedup@example.test',
    })
    check('canonical queue command deduplicates delivery ID', first.id === second.id)
    startWorker()
    await until('dedup acceptance', async () => (await get(first.id)).status === 'accepted')
    await stopWorker()
    check(
      'deduplicated command yields one DATA and one attempt',
      messages.filter((m) => m.to === 'dedup@example.test').length === 1 &&
        (await get(first.id)).attempts === 1,
    )
    const rows = await payload.find({
      collection: 'email-deliveries',
      depth: 0,
      limit: 100,
      overrideAccess: true,
    })
    await writeFile(
      `${out}/state.json`,
      JSON.stringify(
        {
          siteId: site.id,
          deliveries: rows.docs.map((row: any) => ({
            id: row.id,
            recipientEmail: row.recipientEmail,
            status: row.status,
            attempts: row.attempts,
            provider: row.provider,
            providerMessageId: row.providerMessageId,
            outcome: row.outcome,
          })),
        },
        null,
        2,
      ),
    )
    // Exact MIME specimen is a disposable transactional message with no access tokens.
    await writeFile(
      `${out}/controlled-message.eml`,
      messages.find((m) => m.to === 'dedup@example.test').raw,
    )
    await writeFile(
      `${out}/smtp-trace.json`,
      JSON.stringify(
        {
          messages: messages.map((m) => ({ to: m.to, at: m.at, bytes: Buffer.byteLength(m.raw) })),
          rejections: Object.fromEntries(rejections),
          boundary: 'Loopback only; no remote SMTP/carrier activity',
        },
        null,
        2,
      ),
    )
    await writeFile(`${out}/journey-trace.json`, JSON.stringify(trace, null, 2))
  }
  console.log(`ALL ${trace.length} CHECKS PASSED`)
} finally {
  await stopWorker()
  for (const socket of sockets) socket.destroy()
  sink.close()
  api.close()
  api.closeAllConnections()
  await payload.destroy()
}
process.exit(0)
