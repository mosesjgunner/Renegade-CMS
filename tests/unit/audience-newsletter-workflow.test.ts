import { describe, expect, it } from 'vitest'

import {
  audienceDigest,
  signEmailWebhook,
  verifyEmailWebhookSignature,
} from '../../src/modules/audience/contracts'
import { queueNewsletterDeliveries, requestDoubleOptIn } from '../../src/modules/audience/service'

describe('newsletter snapshot acceptance boundaries', () => {
  it('creates and queues exactly one confirmation delivery for a pending double opt-in replay', async () => {
    const rows = new Map<string, any[]>()
    const queued: unknown[] = []
    const all = (collection: string): any[] => rows.get(collection) ?? []
    const payload = {
      find: async ({
        collection,
        where,
      }: {
        collection: string
        where?: Record<string, unknown>
      }) => {
        const values = all(collection).filter((doc) => {
          const candidate = where ?? {}
          return Object.entries(candidate).every(([key, condition]) => {
            if (key === 'usedAt') return !doc.usedAt
            if (key === 'expiresAt') return new Date(String(doc.expiresAt)) > new Date()
            const expected = (condition as { equals?: unknown }).equals
            return expected === undefined || String(doc[key]) === String(expected)
          })
        })
        return { docs: values }
      },
      create: async ({
        collection,
        data,
      }: {
        collection: string
        data: Record<string, unknown>
      }) => {
        const doc = { id: `${collection}-${all(collection).length + 1}`, ...data }
        rows.set(collection, [...all(collection), doc])
        return doc
      },
      jobs: { queue: async (job: unknown) => queued.push(job) },
    }
    const input = {
      siteId: 'site-1',
      listId: 'list-1',
      email: 'reader@example.test',
      locale: 'en',
      consentWording: 'I agree.',
      source: 'public-form',
    }
    const first = await requestDoubleOptIn(payload, input)
    const replay = await requestDoubleOptIn(payload, input)
    expect(first.token).toEqual(expect.any(String))
    expect(replay).toMatchObject({ replay: true, token: undefined })
    expect(all('subscriber-confirmation-tokens')).toHaveLength(1)
    expect(all('email-messages')).toHaveLength(1)
    expect(all('email-deliveries')).toHaveLength(1)
    expect(queued).toHaveLength(1)
  })

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
    type MockFindInput = {
      collection: string
      page?: number
      where?: {
        emailHash?: { equals?: string }
        idempotencyKey?: { equals?: string }
      }
    }
    type MockCreateInput = {
      collection: string
      data: {
        idempotencyKey: string
        [key: string]: unknown
      }
    }
    const deliveries = new Map<string, Record<string, unknown>>()
    const payload = {
      findByID: async () => ({
        id: 'message-1',
        site: 'site-1',
        status: 'scheduled',
        scheduledFor: new Date(0).toISOString(),
        audience: { lists: ['list-1', 'list-2'] },
      }),
      find: async (input: MockFindInput) => {
        if (input.collection === 'audience-memberships') {
          const page = input.page ?? 1
          const docs = memberships.slice((page - 1) * 100, page * 100)
          return { docs, hasNextPage: page * 100 < memberships.length }
        }
        if (input.collection === 'suppressions')
          return {
            docs:
              input.where?.emailHash?.equals === memberships[7].subscriber.emailHash
                ? [{ id: 'suppressed' }]
                : [],
          }
        if (input.collection === 'email-deliveries') {
          const key = input.where?.idempotencyKey?.equals
          const delivery = key ? deliveries.get(key) : undefined
          return {
            docs: delivery ? [delivery] : [],
          }
        }
        return { docs: [] }
      },
      create: async (input: MockCreateInput) => {
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
