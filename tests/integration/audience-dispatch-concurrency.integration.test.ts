import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { createServer, type Server, type Socket } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { getPayload, type Payload } from 'payload'
import config from '../../src/payload.config'
import { ensureRenegadePartyDemo } from '../helpers/renegadeparty-demo'
import { requestDoubleOptIn } from '../../src/modules/audience/service'
import { emailDeliveryTask } from '../../src/modules/audience/tasks'

let payload: Payload
let server: Server
const sockets = new Set<Socket>()
const accepted: string[] = []

beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_release_acceptance'))
    throw new Error('Disposable acceptance database required')
  payload = await getPayload({ config })
  await ensureRenegadePartyDemo(payload)
  server = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => {})
    let input = '',
      data = false,
      lines: string[] = []
    socket.write('220 local concurrency SMTP fixture\r\n')
    socket.on('data', (chunk) => {
      input += chunk.toString()
      while (input.includes('\r\n')) {
        const end = input.indexOf('\r\n'),
          line = input.slice(0, end)
        input = input.slice(end + 2)
        if (data) {
          if (line === '.') {
            accepted.push(lines.join('\r\n'))
            lines = []
            data = false
            socket.write('250 accepted locally\r\n')
          } else lines.push(line)
        } else if (/^(EHLO|HELO)/i.test(line)) socket.write('250-local\r\n250 8BITMIME\r\n')
        else if (/^DATA/i.test(line)) {
          data = true
          socket.write('354 DATA\r\n')
        } else if (/^QUIT/i.test(line)) socket.end('221 bye\r\n')
        else socket.write('250 ok\r\n')
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('SMTP fixture unavailable')
  vi.stubEnv('EMAIL_MODE', 'smtp')
  vi.stubEnv('SMTP_HOST', '127.0.0.1')
  vi.stubEnv('SMTP_PORT', String(address.port))
  vi.stubEnv('SMTP_SECURE', 'false')
  vi.stubEnv('EMAIL_FROM', 'Concurrency <acceptance@example.test>')
})
afterAll(async () => {
  vi.unstubAllEnvs()
  for (const socket of sockets) socket.destroy()
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  await payload?.db.destroy?.()
})

it('serializes distinct retry jobs before rereading a delivery and sending real local SMTP', async () => {
  const site = (await payload.find({ collection: 'sites', limit: 1, overrideAccess: true })).docs[0]
  const list = await payload.create({
    collection: 'audience-lists',
    data: { site: String(site.id), name: 'Concurrent SMTP acceptance', status: 'active' },
    overrideAccess: true,
  })
  expect((payload.db as unknown as { pool: unknown }).pool).toBeTruthy()
  const email = `concurrency-${Date.now()}@example.test`
  await requestDoubleOptIn(payload, {
    siteId: String(site.id),
    listId: String(list.id),
    email,
    locale: 'en',
    consentWording: 'Local concurrency acceptance',
    source: 'public-form',
  })
  const delivery = (
    await payload.find({
      collection: 'email-deliveries',
      where: { recipientEmail: { equals: email } },
      limit: 1,
      overrideAccess: true,
    })
  ).docs[0]
  expect(delivery.status).toBe('queued')
  let firstRead!: () => void, release!: () => void, secondRead!: () => void
  const firstReady = new Promise<void>((resolve) => {
    firstRead = resolve
  })
  const releaseFirst = new Promise<void>((resolve) => {
    release = resolve
  })
  const secondReady = new Promise<void>((resolve) => {
    secondRead = resolve
  })
  const original = payload.findByID.bind(payload)
  let reads = 0
  const spy = vi.spyOn(payload, 'findByID').mockImplementation(async (args) => {
    const row = await original(args)
    if (args.collection === 'email-deliveries' && String(args.id) === String(delivery.id)) {
      reads++
      if (reads === 1) {
        firstRead()
        await releaseFirst
      } else secondRead()
    }
    return row
  })
  const handler = emailDeliveryTask.handler as unknown as (args: unknown) => Promise<unknown>
  const execute = () => handler({ input: { deliveryId: String(delivery.id) }, req: { payload } })
  let first: Promise<unknown> | undefined, second: Promise<unknown> | undefined
  try {
    first = execute()
    await firstReady
    second = execute()
    // The old handler lets both jobs read queued; the locked handler makes the
    // second reader wait until the first has committed its accepted result.
    await Promise.race([secondReady, delay(1000)])
    release()
    await Promise.all([first, second])
  } finally {
    release()
    await Promise.allSettled([first, second])
    spy.mockRestore()
  }
  expect(accepted.filter((message) => message.includes(email))).toHaveLength(1)
  const persisted = await payload.findByID({
    collection: 'email-deliveries',
    id: delivery.id,
    overrideAccess: true,
  })
  expect(persisted.status).toBe('accepted')
  expect(persisted.attempts).toBe(1)
  await execute()
  expect(accepted.filter((message) => message.includes(email))).toHaveLength(1)
  expect(
    (
      await payload.findByID({
        collection: 'email-deliveries',
        id: delivery.id,
        overrideAccess: true,
      })
    ).attempts,
  ).toBe(1)
})
