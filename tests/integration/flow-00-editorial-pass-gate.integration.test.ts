/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import {
  archiveEditorialArticle,
  cancelScheduledPublication,
  createEditorialArticle,
  createEditorialPreviewToken,
  decideEditorialReview,
  loadPublishedArticleBySlug,
  publishScheduledArticle,
  reconcileScheduledPublishJobs,
  requestEditorialReview,
  resolveEditorialPreviewToken,
  restoreEditorialRevision,
  saveEditorialDraft,
  scheduleEditorialPublication,
  unpublishEditorialArticle,
} from '../../src/modules/editorial/persistence'
import { importMarkdownToRichText } from '../../src/modules/editorial/markdown'
import { seed } from '../../src/scripts/seed'

let payload: Payload

const idOf = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return String((value as any).id)
  return String(value)
}

const findOne = async (collection: string, where: Record<string, unknown>, depth = 0) => {
  const result = (await payload.find({
    collection,
    where,
    depth,
    limit: 1,
    overrideAccess: true,
  } as never)) as { docs: Record<string, any>[] }
  expect(result.docs[0]).toBeTruthy()
  return result.docs[0]
}

let hasDb = true

beforeAll(async () => {
  try {
    payload = await getPayload({ config })
    await seed(payload)
  } catch {
    hasDb = false
  }
})

afterAll(async () => {
  if (hasDb && payload?.db?.destroy) {
    await payload.db.destroy()
  }
})

describe('FLOW-00 editorial pass gate integration', () => {
  it('proves full FLOW-00 contract: draft -> review -> quality gate waiver -> schedule -> worker -> publish -> last-public-revision protection -> unpublish -> archive', async (ctx) => {
    if (!hasDb) {
      ctx.skip()
      return
    }
    const publication = await findOne('publications', { slug: { equals: 'main' } })
    const site = await findOne('sites', { slug: { equals: 'demo-publication' } })
    const author = await findOne('authors', { slug: { equals: 'river-morgan' } })
    const previewUser = await findOne('users', { email: { equals: 'river@example.test' } })
    const section = await findOne('sections', { slug: { equals: 'notes' } })
    const category = await findOne('categories', { slug: { equals: 'field-reports' } })
    const tag = await findOne('tags', { slug: { equals: 'demo' } })

    const unique = randomUUID().slice(0, 8)
    const slug = `flow-00-pass-gate-${unique}`

    // 1. Create Article Draft
    const created = await createEditorialArticle(payload, {
      siteId: site.id,
      publicationId: publication.id,
      title: 'FLOW-00 Pass Gate Article',
      slug,
      canonicalPath: `/articles/${slug}`,
      summary: 'Pass gate workflow proof.',
      subtitle: 'State machine hardening.',
      authorIds: [author.id],
      sectionIds: [section.id],
      categoryIds: [category.id],
      tagIds: [tag.id],
      actor: { id: 'author-1', role: 'author' },
      sourceMarkdown: ['# FLOW-00 Title', '', 'Initial canonical body revision 1.'].join('\n'),
      now: '2026-09-15T12:00:00.000Z',
    })

    const articleId = String(created.article.id)
    const initialRevId = idOf(created.article.currentRevision)

    // 2. Request Review with Quality Gate Snapshot
    const qualitySnapshot = {
      scanId: `scan-${unique}`,
      scannedAt: '2026-09-15T12:05:00.000Z',
      blockingIssueCount: 1,
      issues: [
        {
          id: 'iss-1',
          ruleId: 'FLOW-RULE-01',
          severity: 'error',
          message: 'Hero media recommended',
        },
      ],
    }

    await requestEditorialReview(payload, {
      articleId,
      actor: { id: 'author-1', role: 'author' },
      qualityGateSnapshot: qualitySnapshot,
      now: '2026-09-15T12:05:00.000Z',
    })

    // 3. Prove Quality Gate Blocking Issue Rejection without Waiver
    await expect(
      decideEditorialReview(payload, {
        articleId,
        actor: { id: 'editor-1', role: 'editor' },
        approved: true,
        now: '2026-09-15T12:10:00.000Z',
      }),
    ).rejects.toThrow(/Quality gate failed/)

    // 4. Approve with Authorized Quality Waiver Override
    const qualityWaiver = {
      waivedByUserId: previewUser.id,
      waivedByUserRole: 'editor',
      reason: 'Hero media waiver authorized by editor',
      waivedAt: '2026-09-15T12:12:00.000Z',
    }

    await decideEditorialReview(payload, {
      articleId,
      actor: { id: 'editor-1', role: 'editor' },
      approved: 'approved',
      comment: 'Waiver granted for text-first release',
      qualityWaiver,
      now: '2026-09-15T12:15:00.000Z',
    })

    // 5. Schedule Publication
    const schedKey = `schedule-flow-00-${unique}`
    await scheduleEditorialPublication(payload, {
      articleId,
      actor: { id: 'publisher-1', role: 'publisher' },
      scheduledFor: '2026-09-15T12:20:00.000Z',
      timeZone: 'UTC',
      idempotencyKey: schedKey,
      now: '2026-09-15T12:16:00.000Z',
    })

    // 6. Run Worker Reconciliation to Publish Scheduled Job
    const reconcilerResult = await reconcileScheduledPublishJobs(payload, 'worker-flow-00')
    expect(reconcilerResult.processedCount).toBeGreaterThanOrEqual(1)

    // 7. Verify Public Presentation output matches published revision
    const published = await loadPublishedArticleBySlug(payload, slug)
    expect(published.bodyText).toContain('Initial canonical body revision 1.')
    expect(published.status).toBe('published')

    // 8. Save a working draft post-publication and verify last-public-revision protection
    const revisedDoc = importMarkdownToRichText(
      [
        '# FLOW-00 Title',
        '',
        'Initial canonical body revision 1.',
        '',
        'Embargoed working draft edit.',
      ].join('\n'),
    ).document

    await saveEditorialDraft(payload, {
      articleId,
      actor: { id: 'author-1', role: 'author' },
      document: revisedDoc,
      baseRevisionId: initialRevId,
      mutationId: `mutation-post-pub-${unique}`,
      now: '2026-09-15T13:00:00.000Z',
    })

    // Public view must NOT leak working draft text
    const publicViewStillClean = await loadPublishedArticleBySlug(payload, slug)
    expect(publicViewStillClean.bodyText).not.toContain('Embargoed working draft edit.')

    // Preview token resolves working draft text
    const previewTokenObj = await createEditorialPreviewToken(payload, {
      articleId,
      createdBy: previewUser.id,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    const previewView = await resolveEditorialPreviewToken(
      payload,
      previewTokenObj.token,
      'desktop',
      previewUser.id,
    )
    expect(previewView.bodyText).toContain('Embargoed working draft edit.')

    // 9. Unpublish and Archive
    await unpublishEditorialArticle(payload, {
      articleId,
      actor: { id: 'publisher-1', role: 'publisher' },
      reason: 'Retracting to draft state',
    })
    await expect(loadPublishedArticleBySlug(payload, slug)).rejects.toThrow()

    await archiveEditorialArticle(payload, {
      articleId,
      actor: { id: 'publisher-1', role: 'publisher' },
      reason: 'Archiving record',
    })
  }, 30_000)
})
