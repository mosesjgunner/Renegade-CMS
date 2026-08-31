/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory Payload store test double. */
import { describe, expect, it } from 'vitest'

import { createExecutionEvent } from '../../src/modules/execution/contracts'
import {
  enqueueWebhookDeliveries,
  externalWebhookEnvelope,
  verifyWebhookDeliverySignature,
  webhookDeliverySignature as sign,
} from '../../src/modules/integrations/webhooks'

describe('public API webhook contract', () => {
  it('emits only privacy-safe outbox events and uses timestamped, replay-rejectable signatures', () => {
    const event = createExecutionEvent({
      siteId: 'site-a',
      tenantId: 'pub-a',
      actor: { kind: 'service', id: 'client-a' },
      eventType: 'content.created',
      idempotencyKey: 'content-a',
      privacyClass: 'public',
      payload: { contentId: 'content-a', status: 'published' },
      id: 'event-a',
      occurredAt: '2026-08-31T12:00:00.000Z',
    })
    const envelope = externalWebhookEnvelope(event)!
    const raw = JSON.stringify(envelope),
      timestamp = '1788177600'
    const signature = sign(raw, 'test-secret', timestamp)
    expect(
      verifyWebhookDeliverySignature({
        raw,
        signature,
        secret: 'test-secret',
        now: new Date('2026-08-31T12:00:00.000Z'),
      }).valid,
    ).toBe(true)
    expect(
      verifyWebhookDeliverySignature({
        raw,
        signature,
        secret: 'test-secret',
        now: new Date('2026-08-31T12:10:01.000Z'),
      }).reason,
    ).toBe('stale')
    expect(externalWebhookEnvelope({ ...event, privacyClass: 'restricted' })).toBeNull()
  })

  it('queues each subscribed destination once from the committed outbox event', async () => {
    const created: any[] = []
    const store = {
      find: async (args: any) =>
        args.collection === 'webhook-subscriptions'
          ? {
              docs: [
                { id: 'hook-a', site: 'site-a', status: 'active', events: ['content.created'] },
              ],
            }
          : {
              docs: created.filter(
                (item) => item.data.idempotencyKey === args.where?.idempotencyKey?.equals,
              ),
            },
      create: async (args: any) => {
        created.push(args)
        return args.data
      },
      findByID: async () => ({}),
      update: async () => ({}),
    }
    const event = createExecutionEvent({
      siteId: 'site-a',
      tenantId: 'pub-a',
      actor: { kind: 'system', id: null },
      eventType: 'content.created',
      idempotencyKey: 'event-a',
      privacyClass: 'public',
      payload: { contentId: 'content-a' },
      id: 'event-a',
    })
    expect(await enqueueWebhookDeliveries(store, event)).toBe(1)
    expect(await enqueueWebhookDeliveries(store, event)).toBe(0)
    expect(created[0].data.payload).toMatchObject({ id: 'event-a', api_version: '2026-08-31' })
  })
})
