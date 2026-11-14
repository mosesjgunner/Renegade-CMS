/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped. */
import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'

import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../src/payload.config'
import { createExecutionEvent } from '../../src/modules/execution/contracts'
import {
  deliverWebhook,
  enqueueWebhookDeliveries,
  redeliverWebhook,
} from '../../src/modules/integrations/webhooks'

// RC2-H-05: webhook failure behavior over the REAL transport (loopback
// HTTP is allowed under the test environment rule) — bounded retries with
// backoff, subscription failure counting, dead-letter + auto-disable at
// the failure limit, and operator redelivery as the recovery path.
describe('webhook failure, dead-letter and redelivery (RC2-H-05)', () => {
  let payload: Awaited<ReturnType<typeof getPayload>>
  let server: Server
  let target = ''
  let mode: 'fail' | 'ok' = 'fail'
  const hits: Array<Record<string, string | string[] | undefined>> = []
  let siteId = ''
  const resolver = async () => 'h05-webhook-secret'
  const createdDeliveryIds: string[] = []
  const createdSubscriptionIds: string[] = []

  const makeSubscription = async (failureCount = 0) => {
    const sub = await payload.create({
      collection: 'webhook-subscriptions',
      data: {
        id: randomUUID(),
        site: siteId,
        target,
        events: ['content.created'],
        status: 'active',
        secretRef: 'h05-secret-ref',
        failureCount,
      },
      overrideAccess: true,
    } as never)
    createdSubscriptionIds.push(String(sub.id))
    return sub
  }
  const fireEvent = async (subId: string) => {
    const event = createExecutionEvent({
      siteId,
      tenantId: siteId,
      actor: { kind: 'system', id: null },
      eventType: 'content.created',
      idempotencyKey: `h05-exec-${randomUUID()}`,
      privacyClass: 'public',
      payload: { contentId: `h05-${randomUUID()}` },
      id: `evt-${randomUUID()}`,
    })
    await enqueueWebhookDeliveries(payload as never, event)
    // Enqueue fans out to every active subscription on the site; this
    // helper picks the delivery belonging to its own subscription.
    const deliveries = await payload.find({
      collection: 'webhook-deliveries',
      where: {
        and: [{ subscription: { equals: subId } }, { eventId: { equals: event.id } }],
      },
      limit: 1,
      overrideAccess: true,
    })
    const delivery = deliveries.docs[0]
    expect(delivery).toBeTruthy()
    createdDeliveryIds.push(String(delivery.id))
    return delivery
  }
  const getDelivery = (id: string) =>
    payload.findByID({ collection: 'webhook-deliveries', id, overrideAccess: true })
  const getSubscription = (id: string) =>
    payload.findByID({ collection: 'webhook-subscriptions', id, overrideAccess: true })

  beforeAll(async () => {
    payload = await getPayload({ config })
    const site = await payload.create({
      collection: 'sites',
      data: {
        name: 'H05 Webhook Site',
        slug: `h05-webhook-${randomUUID().slice(0, 8)}`,
        lifecycle: 'active',
      },
      overrideAccess: true,
    } as never)
    siteId = String(site.id)
    server = createServer((req, res) => {
      hits.push(req.headers)
      res.writeHead(mode === 'ok' ? 200 : 500, { 'content-type': 'text/plain' })
      res.end(mode === 'ok' ? 'ok' : 'receiver error')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('no server address')
    target = `http://127.0.0.1:${address.port}/hook`
  })

  afterAll(async () => {
    for (const id of createdDeliveryIds)
      await payload
        .delete({ collection: 'webhook-deliveries', id, overrideAccess: true })
        .catch(() => undefined)
    for (const id of createdSubscriptionIds)
      await payload
        .delete({ collection: 'webhook-subscriptions', id, overrideAccess: true })
        .catch(() => undefined)
    if (siteId)
      await payload
        .delete({ collection: 'sites', id: siteId, overrideAccess: true })
        .catch(() => undefined)
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('retries with backoff, counts failures, and recovers by redelivery', async () => {
    const sub = await makeSubscription()
    const delivery = await fireEvent(String(sub.id))

    // Duplicate enqueue of the same event is a no-op (idempotency).
    const again = createExecutionEvent({
      siteId,
      tenantId: siteId,
      actor: { kind: 'system', id: null },
      eventType: 'content.created',
      idempotencyKey: `h05-dup-${randomUUID()}`,
      privacyClass: 'public',
      payload: { contentId: 'dup' },
      id: String((delivery as any).eventId),
    })
    expect(await enqueueWebhookDeliveries(payload as never, again)).toBe(0)

    const first = await deliverWebhook(payload as never, String(delivery.id), resolver)
    expect(first.state).toBe('retrying')
    expect(first.attempts).toBe(1)
    const stored = await getDelivery(String(delivery.id))
    expect(stored.state).toBe('retrying')
    expect(stored.nextAttemptAt).toBeTruthy()
    expect((await getSubscription(String(sub.id))).failureCount).toBe(1)
    expect(hits[hits.length - 1]['x-renegade-attempt']).toBe('1')

    const second = await deliverWebhook(payload as never, String(delivery.id), resolver)
    expect(second.state).toBe('retrying')
    expect(second.attempts).toBe(2)
    expect(hits[hits.length - 1]['x-renegade-attempt']).toBe('2')

    // Operator recovery: redeliver creates a fresh queued delivery; with
    // the receiver healthy it lands, and the subscription counter resets.
    mode = 'ok'
    const redelivery = await redeliverWebhook(payload as never, String(delivery.id))
    createdDeliveryIds.push(String(redelivery.id))
    const done = await deliverWebhook(payload as never, String(redelivery.id), resolver)
    expect(done.state).toBe('delivered')
    expect((await getSubscription(String(sub.id))).failureCount).toBe(0)
  })

  it('dead-letters and disables the subscription at the failure limit', async () => {
    mode = 'fail'
    const sub = await makeSubscription(4)
    const delivery = await fireEvent(String(sub.id))
    const result = await deliverWebhook(payload as never, String(delivery.id), resolver)
    expect(result.state).toBe('dead-letter')
    const storedSub = await getSubscription(String(sub.id))
    expect(storedSub.status).toBe('disabled')
    expect(storedSub.failureCount).toBe(5)
    // A dead-lettered delivery is terminal: further attempts are refused.
    const refused = await deliverWebhook(payload as never, String(delivery.id), resolver)
    expect(refused.state).toBe('dead-letter')
  })
})
