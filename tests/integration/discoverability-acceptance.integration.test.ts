/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { queryLocalSearch, resolveRedirect } from '../../src/modules/public/discovery'
import { seed } from '../../src/scripts/seed'

let payload: Payload

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
})
afterAll(async () => payload?.db.destroy?.())

describe('discoverability acceptance', () => {
  it('converges search and redirects for a persisted public record without crossing sites', async () => {
    const source = (
      await payload.find({
        collection: 'content',
        where: { status: { in: ['published', 'updated'] } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never)
    ).docs[0] as any
    expect(source).toBeTruthy()
    const suffix = randomUUID().slice(0, 8)
    const phrase = `discoverability ${suffix}`
    const created = (await payload.create({
      collection: 'content',
      data: {
        site: source.site,
        publication: source.publication,
        contentType: 'page',
        title: phrase,
        slug: `discoverability-${suffix}`,
        canonicalPath: `/discoverability-${suffix}`,
        summary: phrase,
        status: 'published',
        visibility: 'public',
        publishedAt: new Date().toISOString(),
        commentsPolicy: 'closed',
        retentionMode: 'permanent',
        removeFromDiscovery: false,
        publicChangeHistoryPolicy: 'summary',
      },
      overrideAccess: true,
    } as never)) as any
    const documents = (
      await payload.find({
        collection: 'content',
        where: { site: { equals: source.site } },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      } as never)
    ).docs.map((item: any) => ({
      id: String(item.id),
      siteId: String(source.site),
      path: String(item.canonicalPath),
      title: String(item.title),
      summary: item.summary,
      status: item.status,
      visibility: item.visibility,
      removeFromDiscovery: item.removeFromDiscovery,
      publishedAt: item.publishedAt,
    }))
    expect(
      queryLocalSearch({ documents, query: phrase, siteId: String(source.site) }).hits.map(
        (hit) => hit.id,
      ),
    ).toContain(created.id)
    await payload.update({
      collection: 'content',
      id: created.id,
      data: { status: 'draft' },
      overrideAccess: true,
    } as never)
    const afterUnpublish = documents.map((item) =>
      item.id === created.id ? { ...item, status: 'draft' } : item,
    )
    expect(
      queryLocalSearch({ documents: afterUnpublish, query: phrase, siteId: String(source.site) })
        .total,
    ).toBe(0)
    const rule = (await payload.create({
      collection: 'public-redirects',
      data: {
        site: source.site,
        fromPath: `/old-${suffix}`,
        toPath: created.canonicalPath,
        match: 'exact',
        statusCode: '308',
        preserveQuery: true,
        enabled: true,
      },
      overrideAccess: true,
    } as never)) as any
    expect(
      resolveRedirect(
        [
          {
            id: rule.id,
            siteId: String(source.site),
            fromPath: rule.fromPath,
            toPath: rule.toPath,
            match: rule.match,
            statusCode: Number(rule.statusCode) as 308,
          },
        ],
        String(source.site),
        rule.fromPath,
        '?ref=test',
      ),
    ).toMatchObject({ target: `${created.canonicalPath}?ref=test` })
    await payload.delete({
      collection: 'public-redirects',
      id: rule.id,
      overrideAccess: true,
    } as never)
    await payload.delete({ collection: 'content', id: created.id, overrideAccess: true } as never)
    expect(
      queryLocalSearch({
        documents: documents.filter((item) => item.id !== created.id),
        query: phrase,
        siteId: String(source.site),
      }).total,
    ).toBe(0)
  })
})
