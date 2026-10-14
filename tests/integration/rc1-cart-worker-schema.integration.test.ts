import { randomUUID } from 'node:crypto'
import { getPayload } from 'payload'
import { describe, expect, it } from 'vitest'
import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import {
  scanPendingMessageAttachments,
  cleanupOrphanedMessageAttachments,
} from '../../src/modules/community/message-attachments'

describe('RC1 cart and registered worker schema', () => {
  it('accepts an unassigned member cart before a payment provider is selected', async () => {
    const payload = await getPayload({ config })
    const suffix = randomUUID()
    const site = await payload.create({
      collection: 'sites',
      data: {
        name: 'Cart schema',
        slug: `cart-schema-${suffix}`,
        lifecycle: 'active',
        communityRegistrationPolicy: 'open',
        commentReactionCodes: ['heart'],
      },
      overrideAccess: true,
    })
    const member = await payload.create({
      collection: 'members',
      data: {
        displayName: 'Cart schema member',
        email: `cart-${suffix}@example.test`,
        status: 'active',
      },
      overrideAccess: true,
    })
    const cart = await payload.create({
      collection: 'carts',
      data: {
        site: site.id,
        member: member.id,
        currency: 'USD',
        items: [],
        state: 'active',
        version: 1,
      },
      overrideAccess: true,
    })
    const persisted = await payload.findByID({
      collection: 'carts',
      id: cart.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(persisted.merchantConnection).toBeNull()
    expect(persisted.member).toBe(member.id)
    expect(persisted.items).toEqual([])
  })

  it('registers every scheduled task in both persisted PostgreSQL task enums', async () => {
    const payload = await getPayload({ config })
    const runtime = await config
    const slugs = (runtime.jobs?.tasks ?? []).map((task) => task.slug)
    const pool = (
      payload.db as unknown as {
        pool: {
          query: (sql: string) => Promise<{ rows: { typname: string; enumlabel: string }[] }>
        }
      }
    ).pool
    const labels = await pool.query(
      "SELECT t.typname,e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typname IN ('enum_payload_jobs_task_slug','enum_payload_jobs_log_task_slug')",
    )
    for (const name of ['enum_payload_jobs_task_slug', 'enum_payload_jobs_log_task_slug']) {
      const supported = labels.rows
        .filter((row) => row.typname === name)
        .map((row) => row.enumlabel)
      expect(
        slugs.filter((slug) => !supported.includes(slug)),
        `${name} missing registered tasks`,
      ).toEqual([])
    }
  })
  it('executes attachment housekeeping against the real PostgreSQL pool', async () => {
    const payload = await getPayload({ config })
    expect(await scanPendingMessageAttachments(payload, loadConfig())).toBeGreaterThanOrEqual(0)
    expect(await cleanupOrphanedMessageAttachments(payload, loadConfig())).toBeGreaterThanOrEqual(0)
  })
})
