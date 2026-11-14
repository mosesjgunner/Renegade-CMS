/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { GET } from '../../src/app/(frontend)/api/admin/indexing/export/route'
import {
  buildRc2World,
  operatorSession,
  teardownRc2World,
  type Rc2World,
} from '../fixtures/rc2-world'

/**
 * RC2-H-02 finding regression: GET /api/admin/indexing/export returned
 * the indexing change feed for EVERY site to any staff account — a
 * Site B administrator could download Site A's content URLs and
 * indexing activity. The export is a per-site handoff; it must be
 * scoped to a site the caller is granted on (the resolveRedirectSite
 * pattern the sibling redirects export already uses).
 */
describe('indexing export is scoped to the caller’s granted site', () => {
  let payload: Payload
  let world: Rc2World
  const stamp = Math.random().toString(36).slice(2, 10)

  const changeEvent = (siteId: string, slug: string) => ({
    collection: 'execution-events' as never,
    data: {
      site: siteId,
      tenantId: siteId,
      actor: { type: 'system' },
      eventType: 'discovery.indexing.changed',
      occurredAt: new Date().toISOString(),
      correlationId: `h02-${stamp}-${slug}`,
      idempotencyKey: `indexing:h02-${stamp}:${slug}`,
      payload: {
        siteId,
        action: 'upsert',
        url: `http://example.test/articles/${slug}`,
        indexingState: 'manual',
      },
    } as never,
    overrideAccess: true,
  })

  beforeAll(async () => {
    payload = await getPayload({ config })
    world = await buildRc2World(payload)
    await (payload as any).create(changeEvent(world.siteA.siteId, `h02-a-${stamp}`))
    await (payload as any).create(changeEvent(world.siteB.siteId, `h02-b-${stamp}`))
  }, 300_000)

  afterAll(async () => {
    const events = await (payload as any).find({
      collection: 'execution-events',
      where: { idempotencyKey: { like: `indexing:h02-${stamp}` } },
      limit: 10,
      overrideAccess: true,
    })
    for (const doc of events.docs)
      await (payload as any)
        .delete({
          collection: 'execution-events',
          id: doc.id,
          overrideAccess: true,
        })
        .catch(() => undefined)
    await teardownRc2World(payload, world)
  }, 300_000)

  const callExport = async (headers: Headers, query = '') => {
    const res = await GET(
      new Request(`http://localhost/api/admin/indexing/export${query}`, { headers }),
    )
    const body = (await res.json().catch(() => ({}))) as any
    return { status: res.status, body }
  }

  it('refuses anonymous callers', async () => {
    const { status } = await callExport(new Headers())
    expect(status).toBe(403)
  })

  it('gives a site admin only their own site’s changes', async () => {
    const headers = await operatorSession(payload, world.siteA.admin)
    const { status, body } = await callExport(headers, `?siteId=${world.siteA.siteId}`)
    expect(status).toBe(200)
    const changes = body.changes as Array<{ siteId?: string; url?: string }>
    expect(changes.length).toBeGreaterThan(0)
    expect(changes.every((c) => c.siteId === world.siteA.siteId)).toBe(true)
    expect(changes.some((c) => String(c.url).includes(`h02-a-${stamp}`))).toBe(true)
    expect(changes.some((c) => String(c.url).includes(`h02-b-${stamp}`))).toBe(false)
  })

  it('refuses a site admin who names another tenant’s site', async () => {
    const headers = await operatorSession(payload, world.siteA.admin)
    const { status } = await callExport(headers, `?siteId=${world.siteB.siteId}`)
    expect(status).toBe(403)
  })

  it('a foreign site’s admin asking for site A gets refused, not A’s feed', async () => {
    const headers = await operatorSession(payload, world.outsider)
    const { status } = await callExport(headers, `?siteId=${world.siteA.siteId}`)
    expect(status).toBe(403)
  })

  it('without a parameter the export resolves to the caller’s own granted site', async () => {
    const headers = await operatorSession(payload, world.outsider)
    const { status, body } = await callExport(headers)
    expect(status).toBe(200)
    const changes = body.changes as Array<{ siteId?: string }>
    expect(changes.every((c) => c.siteId === world.siteB.siteId)).toBe(true)
  })
})
