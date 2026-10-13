import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, getPayload, type Payload } from 'payload'
import config from '@payload-config'
import { randomUUID } from 'node:crypto'
import { transactionPayload } from '@/modules/core/transaction-payload'
import {
  createEditorialArticle,
  requestEditorialReview,
  decideEditorialReview,
  scheduleEditorialPublication,
  loadBundleByArticleId,
} from '@/modules/editorial/persistence'

describe('actual PostgreSQL editorial scheduling transaction', () => {
  let payload: Payload
  let articleId: string
  const actor = { id: 'transaction-publisher', role: 'publisher' as const }
  const starts = new Date(Date.now() + 3_600_000).toISOString()
  beforeAll(async () => {
    expect(process.env.DATABASE_URL).toContain('_release_acceptance')
    payload = await getPayload({ config })
    const site = (
      await payload.find({
        collection: 'sites',
        where: { slug: { equals: 'demo-publication' } },
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0]
    const publication = (
      await payload.find({
        collection: 'publications',
        where: { slug: { equals: 'main' } },
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0]
    const author = (
      await payload.find({
        collection: 'authors',
        where: { slug: { equals: 'river-morgan' } },
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0]
    expect(site).toBeDefined()
    expect(publication).toBeDefined()
    expect(author).toBeDefined()
    const slug = `transaction-proof-${randomUUID()}`
    const created = await createEditorialArticle(payload, {
      siteId: String(site.id),
      publicationId: String(publication.id),
      title: 'Transactional scheduling proof',
      slug,
      canonicalPath: `/articles/${slug}`,
      summary: 'Local harness proof; no browser authentication claim.',
      authorIds: [String(author.id)],
      actor: { id: String(author.id), role: 'author' },
      sourceMarkdown: '# Transaction proof\n\nApproved real stored body.',
    })
    articleId = String(created.article.id)
    await requestEditorialReview(payload, {
      articleId,
      actor: { id: String(author.id), role: 'author' },
    })
    await decideEditorialReview(payload, {
      articleId,
      actor: { id: 'transaction-editor', role: 'editor' },
      approved: 'approved',
      comment: 'Approved through the actual workflow.',
    })
  })
  it('rolls back queued jobs and article state when the actual required-source audit fails', async () => {
    const transactionID = await payload.db.beginTransaction()
    expect(transactionID).toBeTruthy()
    if (!transactionID) throw new Error('Actual PostgreSQL transaction required')
    const req = await createLocalReq({}, payload)
    req.transactionID = transactionID
    const scoped = transactionPayload(payload, req)
    let queuedId: string | number | undefined
    try {
      await scheduleEditorialPublication(scoped, {
        articleId,
        actor,
        scheduledFor: starts,
        timeZone: 'UTC',
        idempotencyKey: `rollback-${articleId}`,
      })
      const row = (
        await scoped.find({
          collection: 'scheduled-publish-jobs',
          where: { article: { equals: articleId } },
          overrideAccess: true,
          depth: 0,
        })
      ).docs[0]
      queuedId = typeof row.job === 'object' && row.job ? row.job.id : (row.job ?? undefined)
      expect(queuedId).toBeTruthy()
      await expect(
        scoped.create({
          collection: 'calendar-entry-audits',
          overrideAccess: true,
          data: { action: 'integration.invalid-source', createdAt: new Date().toISOString() },
        }),
      ).rejects.toThrow('canonical article source is required')
    } finally {
      if (transactionID) await payload.db.rollbackTransaction(transactionID)
    }
    expect((await loadBundleByArticleId(payload, articleId)).article.lifecycle).toBe('approved')
    expect(
      (
        await payload.count({
          collection: 'scheduled-publish-jobs',
          where: { article: { equals: articleId } },
          overrideAccess: true,
        })
      ).totalDocs,
    ).toBe(0)
    await expect(
      payload.findByID({ collection: 'payload-jobs', id: queuedId!, overrideAccess: true }),
    ).rejects.toThrow()
  })
  it('commits one real queue contract and its canonical source audit together', async () => {
    const transactionID = await payload.db.beginTransaction()
    expect(transactionID).toBeTruthy()
    if (!transactionID) throw new Error('Actual PostgreSQL transaction required')
    const req = await createLocalReq({}, payload)
    req.transactionID = transactionID
    const scoped = transactionPayload(payload, req)
    try {
      await scheduleEditorialPublication(scoped, {
        articleId,
        actor,
        scheduledFor: starts,
        timeZone: 'UTC',
        idempotencyKey: `commit-${articleId}`,
      })
      await scoped.create({
        collection: 'calendar-entry-audits',
        overrideAccess: true,
        data: {
          article: articleId,
          action: 'integration.scheduled',
          createdAt: new Date().toISOString(),
        },
      })
      if (transactionID) await payload.db.commitTransaction(transactionID)
    } catch (error) {
      if (transactionID) await payload.db.rollbackTransaction(transactionID)
      throw error
    }
    expect((await loadBundleByArticleId(payload, articleId)).article.lifecycle).toBe('scheduled')
    expect(
      (
        await payload.count({
          collection: 'scheduled-publish-jobs',
          where: { article: { equals: articleId } },
          overrideAccess: true,
        })
      ).totalDocs,
    ).toBe(1)
    expect(
      (
        await payload.count({
          collection: 'calendar-entry-audits',
          where: { article: { equals: articleId } },
          overrideAccess: true,
        })
      ).totalDocs,
    ).toBe(1)
  })
})
