import { describe, expect, it } from 'vitest'

import {
  audienceDigest,
  signEmailWebhook,
  verifyEmailWebhookSignature,
} from '../../src/modules/audience/contracts'
import { queueNewsletterDeliveries } from '../../src/modules/audience/service'

describe('newsletter snapshot acceptance boundaries', () => {
  it('enumerates past 1,000 memberships in pages, excludes suppressions, and is idempotent', async () => {
    const memberships = Array.from({ length: 1002 }, (_, index) => ({
      id: `membership-${index}`,
      subscriber: {
        id: `subscriber-${index}`,
        email: `reader-${index}@example.test`,
        emailHash: audienceDigest(`reader-${index}@example.test`),
        status: 'active',
      },
    }))
    const deliveries = new Map<string, Record<string, unknown>>()
    const payload = {
      findByID: async () => ({
        id: 'message-1',
        site: 'site-1',
        status: 'scheduled',
        scheduledFor: new Date(0).toISOString(),
        audience: { lists: ['list-1', 'list-2'] },
      }),
      find: async (input: any) => {
        if (input.collection === 'audience-memberships') {
          const page = input.page ?? 1
          const docs = memberships.slice((page - 1) * 100, page * 100)
          return { docs, hasNextPage: page * 100 < memberships.length }
        }
        if (input.collection === 'suppressions')
          return {
            docs:
              input.where.emailHash.equals === memberships[7].subscriber.emailHash
                ? [{ id: 'suppressed' }]
                : [],
          }
        if (input.collection === 'email-deliveries')
          return {
            docs: deliveries.has(input.where.idempotencyKey.equals)
              ? [deliveries.get(input.where.idempotencyKey.equals)]
              : [],
          }
        return { docs: [] }
      },
      create: async (input: any) => {
        const doc = { id: `delivery-${deliveries.size}`, ...input.data }
        deliveries.set(input.data.idempotencyKey, doc)
        return doc
      },
      update: async () => ({}),
      jobs: { queue: async () => ({}) },
    }
    await expect(queueNewsletterDeliveries(payload, 'message-1')).resolves.toBe(1001)
    expect(deliveries).toHaveLength(1001)
    await expect(queueNewsletterDeliveries(payload, 'message-1')).resolves.toBe(0)
    expect(deliveries).toHaveLength(1001)
  })

  it('verifies exact raw-body HMAC signatures', () => {
    const raw = '{"siteId":"site-1"}'
    const signature = signEmailWebhook(raw, 'secret')
    expect(verifyEmailWebhookSignature(raw, signature, 'secret')).toBe(true)
    expect(verifyEmailWebhookSignature(`${raw} `, signature, 'secret')).toBe(false)
  })
})
