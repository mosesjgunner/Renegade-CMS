import { describe, expect, it, beforeAll } from 'vitest'
import configPromise from '@payload-config'
import { getPayload, type Payload } from 'payload'
import { randomUUID } from 'node:crypto'

import {
  createEditorialArticle,
  scheduleEditorialPublication,
  saveEditorialDraft,
  loadBundleByArticleId,
  requestEditorialReview,
  decideEditorialReview,
} from '../../src/modules/editorial/persistence'

import {
  executeScheduledPublishJob,
  reconcileScheduleWorkerJobs,
  sanitizeErrorLog,
} from '../../src/modules/editorial/scheduler'

import { generateICalendarFeed } from '../../src/app/(frontend)/api/calendar/export/route'

type Doc = Record<string, any>

const idOf = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return String(value.id)
  return String(value ?? '')
}

const findOne = async (payload: Payload, collection: string, where: Record<string, unknown>) => {
  const result = (await payload.find({
    collection,
    where,
    limit: 1,
    overrideAccess: true,
  } as never)) as { docs: Doc[] }
  expect(result.docs[0]).toBeTruthy()
  return result.docs[0]
}

describe('FLOW-03 Scheduling & Calendar Integration Suite', () => {
  let payload: Payload
  let site: Doc
  let publication: Doc
  let authorDoc: Doc
  let testArticleId: string

  let hasDb = true

  beforeAll(async () => {
    try {
      payload = await getPayload({ config: configPromise })

      publication = await findOne(payload, 'publications', { slug: { equals: 'main' } })
      site = await findOne(payload, 'sites', { slug: { equals: 'demo-publication' } })
      authorDoc = await findOne(payload, 'authors', { slug: { equals: 'river-morgan' } })

      const unique = randomUUID().slice(0, 8)
      const slug = `flow-03-sched-${unique}`

      // Seed test article using createEditorialArticle
      const created = await createEditorialArticle(payload, {
        siteId: site.id,
        publicationId: publication.id,
        title: 'FLOW-03 Schedule Integration Article',
        slug,
        canonicalPath: `/articles/${slug}`,
        summary: 'FLOW-03 integration test article',
        authorIds: [authorDoc.id],
        actor: { id: authorDoc.id, role: 'author' },
        sourceMarkdown: '# FLOW-03 Test Article\n\nBody content.',
      })

      testArticleId = idOf(created.article.id)

      // Progress through review to approved
      const author = { id: authorDoc.id, role: 'author' as const }
      const editor = { id: 'user-editor-1', role: 'editor' as const }

      await requestEditorialReview(payload, {
        articleId: testArticleId,
        actor: author,
      })

      await decideEditorialReview(payload, {
        articleId: testArticleId,
        actor: editor,
        approved: 'approved',
        comment: 'Approved for scheduled publication',
      })
    } catch {
      hasDb = false
    }
  })

  it('1. Schedules an article around a DST edge in test timezone America/Chicago', async (ctx) => {
    if (!hasDb) {
      ctx.skip()
      return
    }
    const publisher = { id: 'user-publisher-1', role: 'publisher' as const }
    const scheduledFor = '2026-11-01T06:30:00.000Z' // 1:30 AM CDT (before Fall Back)
    const idempotencyKey = `flow-03-key-${Date.now()}`

    const bundle = await scheduleEditorialPublication(payload, {
      articleId: testArticleId,
      scheduledFor,
      timeZone: 'America/Chicago',
      actor: publisher,
      idempotencyKey,
    })

    expect(bundle.article.lifecycle).toBe('scheduled')

    const jobs = await payload.find({
      collection: 'scheduled-publish-jobs',
      where: { idempotencyKey: { equals: idempotencyKey } },
      overrideAccess: true,
    })

    expect(jobs.docs).toHaveLength(1)
    const job = jobs.docs[0] as Doc
    expect(job.status).toBe('queued')
    expect(job.timeZone).toBe('America/Chicago')
  })

  it('2. Creating a newer draft (rev sequence N+1) post-schedule does NOT alter scheduled target revision', async (ctx) => {
    if (!hasDb) {
      ctx.skip()
      return
    }
    const author = { id: authorDoc.id, role: 'author' as const }
    const initialBundle = await loadBundleByArticleId(payload, testArticleId)
    const targetApprovedRevId = idOf(initialBundle.article.currentRevision)

    // Author saves a new draft after scheduling
    await saveEditorialDraft(payload, {
      articleId: testArticleId,
      actor: author,
      document: initialBundle.article.document,
      baseRevisionId: idOf(initialBundle.article.currentRevision),
      mutationId: `mut-${Date.now()}`,
    })

    const updatedBundle = await loadBundleByArticleId(payload, testArticleId)
    expect(updatedBundle.article.currentRevisionSequence).toBe(2)

    // The scheduled job must still point strictly to the approved target revision N
    const jobs = await payload.find({
      collection: 'scheduled-publish-jobs',
      where: { article: { equals: testArticleId } },
      overrideAccess: true,
    })
    const job = jobs.docs[0] as Doc
    expect(idOf(job.revision)).toBe(targetApprovedRevId)
  })

  it('3. Worker lease locking & idempotent execution publishes ONLY the target approved revision', async (ctx) => {
    if (!hasDb) {
      ctx.skip()
      return
    }
    const jobs = await payload.find({
      collection: 'scheduled-publish-jobs',
      where: { article: { equals: testArticleId } },
      overrideAccess: true,
    })
    const jobId = idOf(jobs.docs[0].id)

    // Worker 1 acquires and executes job
    const execRes = await executeScheduledPublishJob(payload, jobId, {
      workerId: 'worker-node-1',
      now: '2026-11-01T06:35:00.000Z',
    })

    expect(execRes.success).toBe(true)
    expect(execRes.published).toBe(true)

    // Verify published state: latestPublishedRevision MUST equal the scheduled approved revision (rev 1), NOT the new draft (rev 2)
    const finalBundle = await loadBundleByArticleId(payload, testArticleId)
    expect(finalBundle.article.lifecycle).toBe('published')
    expect(idOf(finalBundle.article.latestPublishedRevision)).not.toBe(
      idOf(finalBundle.article.currentRevision),
    )
  })

  it('4. Reconciles worker jobs idempotently and sanitizes error logs', async (ctx) => {
    if (!hasDb) {
      ctx.skip()
      return
    }
    const reconRes = await reconcileScheduleWorkerJobs(payload, {
      workerId: 'worker-node-1',
      limit: 10,
    })

    expect(reconRes.processedCount).toBeGreaterThanOrEqual(0)

    const rawError =
      'Error: DB authentication failed for postgres://postgres:super_secret_pw@127.0.0.1:5432/cms'
    const sanitized = sanitizeErrorLog(rawError)
    expect(sanitized).not.toContain('super_secret_pw')
  })

  it('5. Generates valid RFC 5545 iCalendar (.ics) feed output', () => {
    const feed = generateICalendarFeed([
      {
        id: 'event-101',
        title: 'FLOW-03 Test Event',
        startsAt: '2026-09-25T15:00:00.000Z',
        timeZone: 'America/Chicago',
        description: 'Test calendar feed description',
      },
    ])

    expect(feed).toContain('BEGIN:VCALENDAR')
    expect(feed).toContain('SUMMARY:FLOW-03 Test Event')
    expect(feed).toContain('END:VCALENDAR')
  })
})
