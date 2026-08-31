/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { executeQualityScan, ignoreQualityIssue, markStaleQualityScans, queueQualityScan } from '../../src/modules/quality/service'
import { seed } from '../../src/scripts/seed'

let payload: Payload
beforeAll(async () => { payload = await getPayload({ config }); await seed(payload) })
afterAll(async () => { await payload?.db.destroy?.() })

describe('long-form and Quality Center acceptance', () => {
  it('publishes ordered chapters, preserves a chapter redirect, and retains deterministic quality lifecycle state', async () => {
    const site = (await payload.find({ collection: 'sites', where: { slug: { equals: 'demo-publication' } }, limit: 1, depth: 0, overrideAccess: true } as never)).docs[0] as any
    const publication = (await payload.find({ collection: 'publications', where: { slug: { equals: 'main' } }, limit: 1, depth: 0, overrideAccess: true } as never)).docs[0] as any
    const suffix = randomUUID().slice(0, 8)
    const book = await payload.create({ collection: 'books', data: { site: site.id, publication: publication.id, title: 'Quality proof', description: 'A complete metadata description.', slug: `quality-proof-${suffix}`, canonicalPath: `/books/quality-proof-${suffix}`, status: 'published', publishedAt: new Date().toISOString(), seoCanonicalURL: 'invalid', visibility: 'public' }, overrideAccess: true } as never) as any
    const chapter = await payload.create({ collection: 'book-chapters', data: { book: book.id, title: 'One', slug: `one-${suffix}`, canonicalPath: `/books/quality-proof-${suffix}/one-${suffix}`, displayOrder: 1, status: 'published', publishedAt: new Date().toISOString(), footnotes: [{ id: 'f1', text: 'A supported footnote.' }] }, overrideAccess: true } as never) as any
    const oldPath = chapter.canonicalPath
    await payload.update({ collection: 'book-chapters', id: chapter.id, data: { canonicalPath: `/books/quality-proof-${suffix}/renamed-${suffix}`, slug: `renamed-${suffix}` }, overrideAccess: true } as never)
    const redirect = await payload.find({ collection: 'public-redirects', where: { and: [{ site: { equals: site.id } }, { fromPath: { equals: oldPath } }] }, limit: 1, depth: 0, overrideAccess: true } as never)
    expect(redirect.docs[0]).toMatchObject({ toPath: `/books/quality-proof-${suffix}/renamed-${suffix}`, statusCode: '308' })

    const scan = await payload.create({ collection: 'quality-scans', data: { site: site.id, targetType: 'book', targetId: book.id, status: 'queued' }, overrideAccess: true } as never) as any
    expect(await executeQualityScan(payload, { scanId: scan.id })).toMatchObject({ created: 1, findings: 1 })
    expect(await executeQualityScan(payload, { scanId: scan.id })).toMatchObject({ created: 0 }) // completed jobs are duplicate-safe
    const issue = (await payload.find({ collection: 'quality-issues', where: { scan: { equals: scan.id } }, limit: 1, depth: 0, overrideAccess: true } as never)).docs[0] as any
    expect(issue).toMatchObject({ status: 'open', category: 'seo' })
    await payload.update({ collection: 'books', id: book.id, data: { seoCanonicalURL: null }, overrideAccess: true } as never)
    const rescan = await payload.create({ collection: 'quality-scans', data: { site: site.id, targetType: 'book', targetId: book.id, status: 'queued' }, overrideAccess: true } as never) as any
    expect(await executeQualityScan(payload, { scanId: rescan.id })).toMatchObject({ resolved: 1 })

    const advisory = await payload.create({ collection: 'quality-issues', data: { site: site.id, dedupeKey: `manual-${suffix}`, targetType: 'book', targetId: book.id, severity: 'warning', status: 'open', category: 'content', message: 'Known false positive', firstSeenAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() }, overrideAccess: true } as never) as any
    expect(await ignoreQualityIssue(payload, { issueId: advisory.id, actorRole: 'owner', reason: 'Verified false positive' })).toMatchObject({ status: 'ignored' })
    await expect(queueQualityScan(payload, { siteId: '00000000-0000-0000-0000-000000000000', targetType: 'book', targetId: book.id })).rejects.toThrow('tenant boundaries')
    const stale = await payload.create({ collection: 'quality-scans', data: { site: site.id, targetType: 'book', targetId: book.id, status: 'running', startedAt: '2020-01-01T00:00:00.000Z' }, overrideAccess: true } as never) as any
    expect(await markStaleQualityScans(payload, { olderThan: new Date('2026-01-01T00:00:00.000Z') })).toBeGreaterThan(0)
    expect(await payload.findByID({ collection: 'quality-scans', id: stale.id, depth: 0, overrideAccess: true } as never)).toMatchObject({ status: 'stale' })
  }, 30_000)
})
