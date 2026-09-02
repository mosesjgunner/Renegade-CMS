/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import {
  createEditorialArticle,
  createEditorialPreviewToken,
  decideEditorialReview,
  loadPublishedArticleBySlug,
  promoteDiscussionPostToArticle,
  publishScheduledArticle,
  requestEditorialReview,
  resolveEditorialPreviewToken,
  restoreEditorialRevision,
  saveEditorialDraft,
  scheduleEditorialPublication,
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

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
})

afterAll(async () => {
  await payload?.db.destroy?.()
})

describe('M04-C editorial acceptance', () => {
  it('creates, reviews, previews, schedules, publishes exactly once, restores, and prevents embargo leakage', async () => {
    const publication = await findOne('publications', { slug: { equals: 'main' } })
    const site = await findOne('sites', { slug: { equals: 'demo-publication' } })
    const author = await findOne('authors', { slug: { equals: 'river-morgan' } })
    const previewUser = await findOne('users', { email: { equals: 'river@example.test' } })
    const section = await findOne('sections', { slug: { equals: 'notes' } })
    const category = await findOne('categories', { slug: { equals: 'field-reports' } })
    const tag = await findOne('tags', { slug: { equals: 'demo' } })
    const source = await findOne('sources', {
      url: { equals: 'https://example.test/source/demo-report' },
    })
    const unique = randomUUID().slice(0, 8)
    const slug = `m04-c-op-ed-${unique}`

    const created = await createEditorialArticle(payload, {
      siteId: site.id,
      publicationId: publication.id,
      title: 'M04-C Sourced Op-Ed',
      slug,
      canonicalPath: `/articles/${slug}`,
      summary: 'A sourced editorial acceptance article.',
      subtitle: 'Preview, workflow, and publication proof.',
      excerpt: 'A concise op-ed excerpt.',
      authorIds: [author.id],
      sectionIds: [section.id],
      categoryIds: [category.id],
      tagIds: [tag.id],
      actor: { id: 'author-1', role: 'author' },
      sourceMarkdown: [
        '# Sourced op-ed',
        '',
        'Initial sourced body.',
        '',
        '## Second section',
        '',
        'Closing line.',
      ].join('\n'),
      sourceReferences: [
        {
          sourceReferenceId: 'src-1',
          sourceId: source.id,
          bibliographyKey: 'REF-1',
          locator: 'p. 3',
        },
      ],
      citations: [
        {
          id: 'citation-b',
          sourceReferenceId: 'src-1',
          anchor: { nodeKey: 'b', offsetStart: 0, offsetEnd: 1 },
        },
        {
          id: 'citation-a',
          sourceReferenceId: 'src-1',
          anchor: { nodeKey: 'a', offsetStart: 0, offsetEnd: 1 },
        },
      ],
      correctionNotices: [
        {
          label: 'Correction',
          detail: 'Adjusted a date reference.',
          issuedAt: '2026-08-18T01:00:00.000Z',
        },
      ],
      changeNotes: [
        { summary: 'Initial acceptance scenario draft.', issuedAt: '2026-08-18T01:00:00.000Z' },
      ],
      now: '2026-08-18T01:00:00.000Z',
    })

    const articleId = String(created.article.id)
    const originalRevisionId = idOf(created.article.currentRevision)
    const firstPreview = await createEditorialPreviewToken(payload, {
      articleId,
      createdBy: previewUser.id,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    const preview = await resolveEditorialPreviewToken(
      payload,
      firstPreview.token,
      'mobile',
      previewUser.id,
    )

    expect(preview.preview).toBe(true)
    expect(preview.previewMode).toBe('mobile')
    expect(preview.tableOfContents.map((entry) => entry.text)).toEqual([
      'Sourced op-ed',
      'Second section',
    ])
    expect(preview.readingTimeMinutes).toBeGreaterThanOrEqual(1)
    expect(preview.authors).toContain('River Morgan')
    expect(preview.taxonomy.sections).toContain('Notes')
    expect(preview.citations.map((citation) => citation.ordinal)).toEqual([1, 2])
    expect(preview.citations.map((citation) => citation.citationId)).toEqual([
      'citation-a',
      'citation-b',
    ])
    expect(preview.correctionNotices).toHaveLength(1)
    expect(preview.changeNotes).toHaveLength(1)

    await requestEditorialReview(payload, {
      articleId,
      actor: { id: 'author-1', role: 'author' },
      now: '2026-08-18T02:00:00.000Z',
    })
    await decideEditorialReview(payload, {
      articleId,
      actor: { id: 'editor-1', role: 'editor' },
      approved: false,
      now: '2026-08-18T02:05:00.000Z',
    })

    const revisedDocument = importMarkdownToRichText(
      [
        '# Sourced op-ed',
        '',
        'Revised sourced body with editorial changes.',
        '',
        '## Second section',
        '',
        'Closing line.',
      ].join('\n'),
    ).document
    const revised = await saveEditorialDraft(payload, {
      articleId,
      actor: { id: 'author-1', role: 'author' },
      document: revisedDocument,
      baseRevisionId: originalRevisionId,
      mutationId: `mutation-${unique}`,
      now: '2026-08-18T02:10:00.000Z',
    })
    const revisedRevisionId = idOf(revised.article.currentRevision)

    await requestEditorialReview(payload, {
      articleId,
      actor: { id: 'author-1', role: 'author' },
      now: '2026-08-18T02:15:00.000Z',
    })
    await decideEditorialReview(payload, {
      articleId,
      actor: { id: 'editor-1', role: 'editor' },
      approved: true,
      now: '2026-08-18T02:20:00.000Z',
    })

    await scheduleEditorialPublication(payload, {
      articleId,
      actor: { id: 'publisher-1', role: 'publisher' },
      scheduledFor: '2026-08-19T12:00:00.000Z',
      timeZone: 'America/Chicago',
      idempotencyKey: `schedule-${unique}`,
      now: '2026-08-18T02:25:00.000Z',
    })

    const scheduled = await findOne('scheduled-publish-jobs', {
      idempotencyKey: { equals: `schedule-${unique}` },
    })
    await payload.jobs.runByID({ id: idOf(scheduled.job), silent: true })
    expect(
      await publishScheduledArticle(payload, {
        articleId,
        actor: { id: 'publisher-1', role: 'publisher' },
        idempotencyKey: `schedule-${unique}`,
        now: '2026-08-19T12:01:00.000Z',
      }),
    ).toBe(false)

    const published = await loadPublishedArticleBySlug(payload, slug)
    expect(published.preview).toBe(false)
    expect(published.firstPublishedAt).toBeTruthy()
    expect(published.bodyText).toContain('Revised sourced body with editorial changes.')
    expect(published.citations.map((citation) => citation.ordinal)).toEqual([1, 2])
    expect(published.tableOfContents).toHaveLength(2)

    const embargoed = importMarkdownToRichText(
      [
        '# Sourced op-ed',
        '',
        'Embargoed update that must stay out of public view.',
        '',
        '## Second section',
        '',
        'Closing line.',
      ].join('\n'),
    ).document
    await saveEditorialDraft(payload, {
      articleId,
      actor: { id: 'author-1', role: 'author' },
      document: embargoed,
      baseRevisionId: revisedRevisionId,
      mutationId: `embargo-${unique}`,
      now: '2026-08-19T13:00:00.000Z',
    })

    const stillPublished = await loadPublishedArticleBySlug(payload, slug)
    expect(stillPublished.bodyText).not.toContain(
      'Embargoed update that must stay out of public view.',
    )

    const secondPreview = await createEditorialPreviewToken(payload, {
      articleId,
      createdBy: previewUser.id,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    const previewAfterEmbargo = await resolveEditorialPreviewToken(
      payload,
      secondPreview.token,
      'desktop',
      previewUser.id,
    )
    expect(previewAfterEmbargo.bodyText).toContain(
      'Embargoed update that must stay out of public view.',
    )

    await restoreEditorialRevision(payload, {
      articleId,
      actor: { id: 'editor-1', role: 'editor' },
      revisionId: originalRevisionId,
      now: '2026-08-19T14:00:00.000Z',
    })
    const restoredRevisions = (await payload.find({
      collection: 'revision-records',
      where: { article: { equals: articleId } },
      sort: 'sequence',
      limit: 20,
      overrideAccess: true,
    } as never)) as { docs: Record<string, any>[] }
    const restoredRevision = restoredRevisions.docs.at(-1)
    expect(restoredRevision?.restoredFromRevision).toBeTruthy()
  }, 30_000)

  it('promotes a public discussion post into an editorial draft while keeping the original post intact', async () => {
    const publication = await findOne('publications', { slug: { equals: 'main' } })
    const site = await findOne('sites', { slug: { equals: 'demo-publication' } })
    const post = await findOne('discussion-posts', {
      permalink: { equals: '/notes/demo-field-report#post-1' },
    })
    const unique = randomUUID().slice(0, 8)

    const promoted = await promoteDiscussionPostToArticle(payload, {
      discussionPostId: post.id,
      actor: { id: 'author-1', role: 'author' },
      siteId: site.id,
      publicationId: publication.id,
      title: 'Promoted Community Draft',
      slug: `promoted-draft-${unique}`,
      canonicalPath: `/articles/promoted-draft-${unique}`,
    })

    expect(promoted.article.promotionProvenance).toMatchObject({
      discussionPostId: post.id,
      originalPermalink: '/notes/demo-field-report#post-1',
    })

    const originalPost = await payload.findByID({
      collection: 'discussion-posts',
      id: post.id,
      overrideAccess: true,
    })
    expect(originalPost.body).toBeTruthy()
  })
})
