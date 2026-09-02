/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomBytes } from 'node:crypto'

import type { Payload } from 'payload'

import {
  createMarkdownImportReport,
  hashRichTextDocument,
  type RichTextDocument,
} from './contracts'
import { importMarkdownToRichText } from './markdown'
import { buildTableOfContents, estimateReadingTimeMinutes, extractPlainText } from './presentation'
import {
  EditorialWorkflow,
  type EditorialActor,
  type EditorialCitation,
  type EditorialRevision,
} from './workflow'
import { OPERATIONS_QUEUE } from '../operations/tasks'
import { canRenderPublic } from '../public/contracts'

type Doc = Record<string, any>

export type EditorialArticleInput = {
  siteId: string
  publicationId: string
  ownerId?: string | null
  spaceId?: string | null
  title: string
  slug: string
  canonicalPath: string
  summary?: string
  subtitle?: string
  excerpt?: string
  authorIds?: string[]
  sectionIds?: string[]
  categoryIds?: string[]
  topicIds?: string[]
  tagIds?: string[]
  seriesIds?: string[]
  relatedContentIds?: string[]
  actor: EditorialActor
  actorUserId?: string | null
  document?: RichTextDocument
  sourceMarkdown?: string
  sourceReferences?: Array<{
    sourceReferenceId: string
    sourceId: string
    locator?: string | null
    bibliographyKey: string
    publicVisibility?: 'public' | 'staff'
  }>
  citations?: Array<Omit<EditorialCitation, 'ordinal'>>
  correctionNotices?: Array<{ label: string; detail: string; issuedAt: string }>
  changeNotes?: Array<{ summary: string; issuedAt: string }>
  promotionProvenance?: Record<string, unknown>
  now?: string
}

export type EditorialPresentation = {
  title: string
  subtitle: string | null
  excerpt: string | null
  canonicalPath: string
  status: string
  bodyText: string
  body: Record<string, unknown>
  readingTimeMinutes: number
  tableOfContents: Array<{ id: string; level: number; text: string }>
  authors: string[]
  taxonomy: {
    sections: string[]
    categories: string[]
    topics: string[]
    tags: string[]
    series: string[]
  }
  citations: Array<{
    citationId: string
    ordinal: number
    bibliographyKey: string
    sourceTitle: string
    sourceUrl: string | null
    locator: string | null
  }>
  correctionNotices: Array<{ label: string; detail: string; issuedAt: string }>
  changeNotes: Array<{ summary: string; issuedAt: string }>
  firstPublishedAt: string | null
  updatedAt: string | null
  previewMode: 'desktop' | 'mobile'
  preview: boolean
  heroMedia: { url: string; altText: string; width?: number; height?: number } | null
}

type EditorialBundle = {
  article: Doc
  content: Doc
  revisions: Doc[]
}

const idOf = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return String((value as Doc).id)
  if (value && typeof value === 'object' && 'value' in value) return String((value as Doc).value)
  return String(value ?? '')
}

const asArray = (value: unknown): Doc[] => (Array.isArray(value) ? (value as Doc[]) : [])

const hashPreviewToken = (token: string): string =>
  `sha256:${createHash('sha256').update(token, 'utf8').digest('hex')}`

const ensureDocument = (
  input: Pick<EditorialArticleInput, 'document' | 'sourceMarkdown'>,
): {
  document: RichTextDocument
  importedFromMarkdown: boolean
} => {
  if (input.document) return { document: input.document, importedFromMarkdown: false }
  if (!input.sourceMarkdown)
    throw new Error('Either a rich-text document or sourceMarkdown is required.')
  return {
    document: importMarkdownToRichText(input.sourceMarkdown).document,
    importedFromMarkdown: true,
  }
}

const authorLinks = (authorIds: string[]) =>
  authorIds.map((authorId, displayOrder) => ({ author: authorId, displayOrder }))

const mapLifecycleToContentStatus = (status: string): string => status

const toStoredCitations = (citations: readonly EditorialCitation[]) =>
  citations.map((citation) => ({
    citationId: citation.id,
    sourceReferenceId: citation.sourceReferenceId,
    nodeKey: citation.anchor.nodeKey,
    offsetStart: citation.anchor.offsetStart,
    offsetEnd: citation.anchor.offsetEnd,
    ordinal: citation.ordinal,
    passageChecksum: null,
  }))

const toWorkflowCitations = (citations: unknown): EditorialCitation[] =>
  asArray(citations).map((citation) => ({
    id: String(citation.citationId),
    sourceReferenceId: String(citation.sourceReferenceId),
    ordinal: Number(citation.ordinal),
    anchor: {
      nodeKey: String(citation.nodeKey),
      offsetStart: Number(citation.offsetStart),
      offsetEnd: Number(citation.offsetEnd),
    },
  }))

const toRichTextDocument = (value: unknown): RichTextDocument => {
  const document = value as RichTextDocument
  if (document?.format === 'payload-lexical' && document?.document) return document
  const source = (value ?? {}) as Record<string, unknown>
  return {
    format: 'payload-lexical',
    schemaVersion: 1,
    document: source,
    canonicalHash: String((source as Doc).canonicalHash ?? ''),
    plainTextProjection: extractPlainText(source).replace(/\s+/g, ' ').trim(),
    unknownNodePolicy: 'preserve',
  }
}

const hydrateWorkflow = (bundle: EditorialBundle): EditorialWorkflow => {
  const first = bundle.revisions[0]
  const fallbackDocument = toRichTextDocument(bundle.article.document)
  const initialDocument = first ? toRichTextDocument(first.document) : fallbackDocument
  const workflow = new EditorialWorkflow({
    articleId: String(bundle.article.id),
    document: initialDocument,
    author: { id: 'system-author', role: 'author' },
    now: String(first?.createdAt ?? bundle.article.createdAt ?? new Date().toISOString()),
  })
  const mutable = workflow as unknown as {
    article: {
      id: string
      status: any
      currentRevisionId: string
      firstPublishedAt: string | null
      updatedAt: string | null
      revisions: EditorialRevision[]
      citations: EditorialCitation[]
      audit: Array<{
        action: string
        actorId: string
        at: string
        detail: Record<string, string | number | null>
      }>
    }
    acceptedMutations: Map<string, string>
  }

  const revisions = bundle.revisions
    .slice()
    .sort((left, right) => Number(left.sequence) - Number(right.sequence))
    .map((revision) => {
      const document = toRichTextDocument(revision.document)
      return {
        id: String(revision.id),
        sequence: Number(revision.sequence),
        document,
        integrityHash: String(revision.integrityHash),
        parentRevisionId: revision.parentRevision ? idOf(revision.parentRevision) : null,
        restoredFromRevisionId: revision.restoredFromRevision
          ? idOf(revision.restoredFromRevision)
          : null,
        createdBy: revision.createdBy ? idOf(revision.createdBy) : 'system-author',
        createdAt: String(revision.createdAt),
      }
    })

  const currentRevisionId = bundle.article.currentRevision
    ? idOf(bundle.article.currentRevision)
    : String(revisions.at(-1)?.id ?? workflow.article.currentRevisionId)

  mutable.article = {
    id: String(bundle.article.id),
    status: bundle.article.lifecycle,
    currentRevisionId,
    firstPublishedAt: bundle.article.firstPublishedAt
      ? String(bundle.article.firstPublishedAt)
      : null,
    updatedAt: bundle.content.updatedAtEditorial ? String(bundle.content.updatedAtEditorial) : null,
    revisions,
    citations: toWorkflowCitations(bundle.article.citations),
    audit: Array.isArray(bundle.article.workflowAudit)
      ? (bundle.article.workflowAudit as Array<{
          action: string
          actorId: string
          at: string
          detail: Record<string, string | number | null>
        }>)
      : [],
  }
  mutable.acceptedMutations = new Map(
    asArray(bundle.article.acceptedMutationKeys).map((entry) => [
      String(entry.key),
      String(entry.revisionId),
    ]),
  )
  return workflow
}

const findOne = async (
  payload: Payload,
  collection: string,
  where: Record<string, unknown>,
  depth = 0,
  req?: any,
) => {
  const result = (await payload.find({
    collection,
    where,
    limit: 1,
    depth,
    overrideAccess: true,
    req,
  } as never)) as { docs: Doc[] }
  return result.docs[0] ?? null
}

const loadBundleByArticleId = async (
  payload: Payload,
  articleId: string,
): Promise<EditorialBundle> => {
  const article = (await payload.findByID({
    collection: 'article-family-content',
    id: articleId,
    depth: 2,
    overrideAccess: true,
  } as never)) as Doc
  const content = (await payload.findByID({
    collection: 'content',
    id: idOf(article.content),
    depth: 2,
    overrideAccess: true,
  })) as Doc
  const revisions = (
    (await payload.find({
      collection: 'revision-records',
      where: { article: { equals: articleId } },
      sort: 'sequence',
      limit: 100,
      depth: 1,
      overrideAccess: true,
    } as never)) as { docs: Doc[] }
  ).docs
  return { article, content, revisions }
}

const createRevisionRecord = async (
  payload: Payload,
  articleId: string,
  revision: EditorialRevision,
  reason: 'created' | 'edited' | 'reviewed' | 'published' | 'restored' | 'imported',
  createdBy: string | null,
) => {
  return (await payload.create({
    collection: 'revision-records',
    data: {
      id: revision.id,
      article: articleId,
      parentRevision: revision.parentRevisionId,
      restoredFromRevision: revision.restoredFromRevisionId,
      sequence: revision.sequence,
      document: revision.document,
      documentHash: revision.document.canonicalHash,
      integrityHash: revision.integrityHash,
      reason,
      immutable: true,
      createdBy,
      createdAt: revision.createdAt,
    },
    overrideAccess: true,
  } as never)) as Doc
}

/**
 * Keeps the workflow index in step with edits made through the normal Content
 * form. The Content.body Lexical value remains canonical; this is deliberately
 * a derived revision/workflow record, not a second authoring surface.
 */
export async function ensureEditorialCompanion(payload: Payload, content: Doc, req?: any) {
  if (!['article', 'page'].includes(String(content.contentType)) || !content.body) return
  const existing = await findOne(
    payload,
    'article-family-content',
    {
      content: { equals: content.id },
    },
    0,
    req,
  )
  const rawBody = content.body as Record<string, unknown>
  const document: RichTextDocument = {
    format: 'payload-lexical',
    schemaVersion: 1,
    document: rawBody,
    canonicalHash: hashRichTextDocument(rawBody),
    plainTextProjection: extractPlainText(rawBody).replace(/\s+/g, ' ').trim(),
    unknownNodePolicy: 'preserve',
  }
  if (existing?.documentHash === document.canonicalHash) {
    if (existing.lifecycle !== content.status)
      await payload.update({
        collection: 'article-family-content',
        id: existing.id,
        data: { lifecycle: content.status ?? 'draft' },
        overrideAccess: true,
        req,
      } as never)
    return
  }
  const sequence = Number(existing?.currentRevisionSequence ?? 0) + 1
  const revisionId = randomBytes(16).toString('hex')
  const integrityHash = `sha256:${createHash('sha256')
    .update(`${content.id}:${sequence}:${document.canonicalHash}`)
    .digest('hex')}`
  const article = existing
    ? existing
    : ((await payload.create({
        collection: 'article-family-content',
        data: {
          content: content.id,
          articleKey: `content:${content.id}`,
          lifecycle: content.status ?? 'draft',
          document,
          documentHash: document.canonicalHash,
          plainTextProjection: document.plainTextProjection,
          currentRevisionSequence: 0,
          previewModes: ['desktop', 'mobile'],
          workflowAudit: [],
          acceptedMutationKeys: [],
        },
        overrideAccess: true,
        req,
      } as never)) as Doc)
  const revision = (await payload.create({
    collection: 'revision-records',
    data: {
      id: revisionId,
      article: article.id,
      parentRevision: existing?.currentRevision ?? null,
      sequence,
      document,
      documentHash: document.canonicalHash,
      integrityHash,
      reason: existing ? 'edited' : 'created',
      immutable: true,
    },
    overrideAccess: true,
    req,
  } as never)) as Doc
  await payload.update({
    collection: 'article-family-content',
    id: article.id,
    data: {
      lifecycle: content.status ?? 'draft',
      document,
      documentHash: document.canonicalHash,
      plainTextProjection: document.plainTextProjection,
      currentRevisionSequence: sequence,
      currentRevision: revision.id,
    },
    overrideAccess: true,
    req,
  } as never)
}

const persistWorkflow = async (
  payload: Payload,
  bundle: EditorialBundle,
  workflow: EditorialWorkflow,
  input: {
    reason: 'created' | 'edited' | 'reviewed' | 'published' | 'restored' | 'imported'
    actorUserId?: string | null
    latestPublishedRevisionId?: string | null
  },
) => {
  const existingRevisionIds = new Set(bundle.revisions.map((revision) => String(revision.id)))
  const persistedRevisionIds = new Map<string, string>()

  for (const revision of workflow.article.revisions) {
    if (existingRevisionIds.has(revision.id)) continue
    const persistedRevision = await createRevisionRecord(
      payload,
      String(bundle.article.id),
      revision,
      input.reason,
      input.actorUserId ?? null,
    )
    persistedRevisionIds.set(revision.id, String(persistedRevision.id))
  }

  const currentRevision = workflow.article.revisions.find(
    (revision) => revision.id === workflow.article.currentRevisionId,
  )
  if (!currentRevision) throw new Error('The editorial workflow lost its current revision.')

  await payload.update({
    collection: 'article-family-content',
    id: bundle.article.id,
    data: {
      lifecycle: workflow.article.status,
      document: currentRevision.document,
      documentHash: currentRevision.document.canonicalHash,
      plainTextProjection: currentRevision.document.plainTextProjection,
      currentRevisionSequence: currentRevision.sequence,
      currentRevision: persistedRevisionIds.get(currentRevision.id) ?? currentRevision.id,
      latestPublishedRevision:
        input.latestPublishedRevisionId ?? bundle.article.latestPublishedRevision,
      firstPublishedAt: workflow.article.firstPublishedAt,
      citations: toStoredCitations(workflow.article.citations),
      workflowAudit: workflow.article.audit,
      acceptedMutationKeys: Array.from(
        (
          (workflow as unknown as { acceptedMutations: Map<string, string> }).acceptedMutations ??
          new Map()
        ).entries(),
      ).map(([key, revisionId]) => ({ key, revisionId })),
    },
    overrideAccess: true,
  } as never)

  await payload.update({
    collection: 'content',
    id: bundle.content.id,
    data: {
      status: mapLifecycleToContentStatus(workflow.article.status),
      publishedAt: workflow.article.firstPublishedAt,
      updatedAtEditorial: workflow.article.updatedAt,
      readingTimeMinutes: estimateReadingTimeMinutes(currentRevision.document.plainTextProjection),
      tableOfContents: buildTableOfContents(currentRevision.document.document),
      body: currentRevision.document.document,
    },
    overrideAccess: true,
  } as never)

  // Revalidate the published path when content status changes
  if (['published', 'updated', 'archived'].includes(workflow.article.status)) {
    try {
      const { revalidatePath } = await import('next/cache')
      revalidatePath(bundle.content.canonicalPath, 'page')

      // Also revalidate the homepage if this is a featured content
      if (bundle.content.featured) {
        revalidatePath('/', 'page')
      }

      // Revalidate any related taxonomy pages
      if (bundle.content.categories || bundle.content.tags) {
        revalidatePath('/topics', 'page')
      }
    } catch (error) {
      console.warn('Failed to revalidate paths:', error)
    }
  }

  return loadBundleByArticleId(payload, String(bundle.article.id))
}

const authorLabels = (content: Doc): string[] =>
  asArray(content.authors)
    .map((entry) => {
      const author = entry.author
      if (author && typeof author === 'object' && 'displayName' in author)
        return String(author.displayName)
      return null
    })
    .filter((value): value is string => Boolean(value))

const relationshipLabels = (value: unknown, field: string): string[] =>
  asArray(value)
    .map((entry) =>
      entry && typeof entry === 'object' && field in entry ? String((entry as Doc)[field]) : null,
    )
    .filter((entry): entry is string => Boolean(entry))

const sourceLookup = async (payload: Payload, article: Doc) => {
  const references = asArray(article.sourceReferences)
  const result = new Map<
    string,
    { bibliographyKey: string; locator: string | null; title: string; url: string | null }
  >()

  for (const reference of references) {
    let source = reference.source
    if (typeof source === 'string') {
      source = (await payload.findByID({
        collection: 'sources',
        id: source,
        depth: 0,
        overrideAccess: true,
      })) as Doc
    }
    result.set(String(reference.sourceReferenceId), {
      bibliographyKey: String(reference.bibliographyKey),
      locator: reference.locator ? String(reference.locator) : null,
      title: source?.title ? String(source.title) : 'Untitled source',
      url: source?.url ? String(source.url) : null,
    })
  }

  return result
}

export async function createEditorialArticle(
  payload: Payload,
  input: EditorialArticleInput,
): Promise<EditorialBundle> {
  const now = input.now ?? new Date().toISOString()
  const { document, importedFromMarkdown } = ensureDocument(input)
  const workflow = new EditorialWorkflow({
    document,
    author: input.actor,
    now,
  })

  if (input.citations?.length) workflow.setCitations(input.actor, input.citations, now)

  const content = (await payload.create({
    collection: 'content',
    data: {
      site: input.siteId,
      publication: input.publicationId,
      space: input.spaceId ?? null,
      owner: input.ownerId ?? null,
      contentType: 'article',
      title: input.title,
      subtitle: input.subtitle,
      slug: input.slug,
      canonicalPath: input.canonicalPath,
      summary: input.summary,
      excerpt: input.excerpt ?? input.summary,
      body: document.document,
      status: 'draft',
      authors: authorLinks(input.authorIds ?? []),
      sections: input.sectionIds ?? [],
      categories: input.categoryIds ?? [],
      topics: input.topicIds ?? [],
      tags: input.tagIds ?? [],
      series: input.seriesIds ?? [],
      relatedContent: input.relatedContentIds ?? [],
      correctionNotices: input.correctionNotices ?? [],
      changeNotes: input.changeNotes ?? [],
      readingTimeMinutes: estimateReadingTimeMinutes(document.plainTextProjection),
      tableOfContents: buildTableOfContents(document.document),
      commentsPolicy: 'closed',
      publicChangeHistoryPolicy: 'summary',
    },
    overrideAccess: true,
  } as never)) as Doc

  const existingCompanion = await findOne(
    payload,
    'article-family-content',
    { content: { equals: content.id } },
    0,
  )
  const articleData = {
    content: content.id,
    articleKey: `content:${content.id}`,
    lifecycle: workflow.article.status,
    document,
    documentHash: document.canonicalHash,
    plainTextProjection: document.plainTextProjection,
    currentRevisionSequence: 1,
    previewModes: ['desktop', 'mobile'],
    permissions: [
      {
        user: input.actorUserId ?? null,
        actions: ['read', 'edit', 'request-review'],
        grantedAt: now,
      },
    ].filter((entry) => entry.user),
    sourceReferences: (input.sourceReferences ?? []).map((reference) => ({
      sourceReferenceId: reference.sourceReferenceId,
      source: reference.sourceId,
      locator: reference.locator ?? null,
      bibliographyKey: reference.bibliographyKey,
      publicVisibility: reference.publicVisibility ?? 'public',
    })),
    citations: toStoredCitations(workflow.article.citations),
    citationAttachments: [],
    bibliography: null,
    workflowAudit: workflow.article.audit,
    acceptedMutationKeys: [],
    promotionProvenance: input.promotionProvenance ?? null,
  }
  const article = existingCompanion
    ? ((await payload.update({
        collection: 'article-family-content',
        id: existingCompanion.id,
        data: articleData,
        overrideAccess: true,
      } as never)) as Doc)
    : ((await payload.create({
        collection: 'article-family-content',
        data: articleData,
        overrideAccess: true,
      } as never)) as Doc)

  const initialRevision = workflow.article.revisions[0]
  const existingRevision = existingCompanion
    ? await findOne(
        payload,
        'revision-records',
        {
          and: [
            { article: { equals: article.id } },
            { sequence: { equals: initialRevision.sequence } },
          ],
        },
        0,
      )
    : null
  const persistedInitialRevision = existingRevision
    ? existingRevision
    : await createRevisionRecord(
        payload,
        String(article.id),
        initialRevision,
        importedFromMarkdown ? 'imported' : 'created',
        input.actorUserId ?? null,
      )
  await payload.update({
    collection: 'article-family-content',
    id: article.id,
    data: {
      currentRevision: persistedInitialRevision.id,
    },
    overrideAccess: true,
  } as never)

  if (input.sourceMarkdown) {
    const report = createMarkdownImportReport({
      id: `markdown-import:${content.id}` as never,
      articleId: String(article.id) as never,
      sourceMarkdown: input.sourceMarkdown,
      targetDocument: document,
      createdBy: (input.actorUserId ?? null) as never,
      createdAt: now,
    })
    await payload.create({
      collection: 'markdown-conversion-reports',
      data: {
        article: article.id,
        sourceChecksum: report.sourceChecksum,
        targetDocumentHash: report.targetDocumentHash,
        formatVersion: report.formatVersion,
        status: report.status,
        fidelityBoundary: report.fidelityBoundary,
        warnings: report.warnings,
        unsupportedConstructs: report.unsupportedConstructs,
        createdBy: input.actorUserId ?? null,
        createdAt: now,
      },
      overrideAccess: true,
    } as never)
  }

  return loadBundleByArticleId(payload, String(article.id))
}

export async function saveEditorialDraft(
  payload: Payload,
  input: {
    articleId: string
    actor: EditorialActor
    actorUserId?: string | null
    document: RichTextDocument
    baseRevisionId: string
    mutationId: string
    now?: string
  },
) {
  const bundle = await loadBundleByArticleId(payload, input.articleId)
  const workflow = hydrateWorkflow(bundle)
  workflow.saveDraft({
    actor: input.actor,
    document: input.document,
    baseRevisionId: input.baseRevisionId,
    mutationId: input.mutationId,
    now: input.now,
  })
  return persistWorkflow(payload, bundle, workflow, {
    reason: 'edited',
    actorUserId: input.actorUserId,
  })
}

export async function requestEditorialReview(
  payload: Payload,
  input: { articleId: string; actor: EditorialActor; actorUserId?: string | null; now?: string },
) {
  const bundle = await loadBundleByArticleId(payload, input.articleId)
  const workflow = hydrateWorkflow(bundle)
  workflow.requestReview(input.actor, input.now)
  return persistWorkflow(payload, bundle, workflow, {
    reason: 'reviewed',
    actorUserId: input.actorUserId,
  })
}

export async function decideEditorialReview(
  payload: Payload,
  input: {
    articleId: string
    actor: EditorialActor
    actorUserId?: string | null
    approved: boolean
    now?: string
  },
) {
  const bundle = await loadBundleByArticleId(payload, input.articleId)
  const workflow = hydrateWorkflow(bundle)
  workflow.decideReview(input.actor, input.approved, input.now)
  return persistWorkflow(payload, bundle, workflow, {
    reason: 'reviewed',
    actorUserId: input.actorUserId,
  })
}

export async function restoreEditorialRevision(
  payload: Payload,
  input: {
    articleId: string
    actor: EditorialActor
    actorUserId?: string | null
    revisionId: string
    now?: string
  },
) {
  const bundle = await loadBundleByArticleId(payload, input.articleId)
  const workflow = hydrateWorkflow(bundle)
  workflow.restore(input.actor, input.revisionId, input.now)
  return persistWorkflow(payload, bundle, workflow, {
    reason: 'restored',
    actorUserId: input.actorUserId,
  })
}

export async function scheduleEditorialPublication(
  payload: Payload,
  input: {
    articleId: string
    actor: EditorialActor
    actorUserId?: string | null
    scheduledFor: string
    timeZone: string
    idempotencyKey: string
    now?: string
  },
) {
  const existingSchedule = await findOne(payload, 'scheduled-publish-jobs', {
    idempotencyKey: { equals: input.idempotencyKey },
  })
  if (existingSchedule) {
    if (idOf(existingSchedule.article) !== input.articleId)
      throw new Error('A scheduled publication key cannot be reused for a different article.')
    return loadBundleByArticleId(payload, input.articleId)
  }

  const bundle = await loadBundleByArticleId(payload, input.articleId)
  const workflow = hydrateWorkflow(bundle)
  workflow.schedule(
    input.actor,
    input.scheduledFor,
    input.timeZone,
    input.idempotencyKey,
    input.now,
  )
  const persisted = await persistWorkflow(payload, bundle, workflow, {
    reason: 'reviewed',
    actorUserId: input.actorUserId,
  })
  const currentRevisionId = idOf(persisted.article.currentRevision)

  const queued = (await payload.jobs.queue({
    task: 'editorial-publish',
    input: { articleId: input.articleId, actorId: input.actor.id, key: input.idempotencyKey },
    queue: OPERATIONS_QUEUE,
    waitUntil: new Date(input.scheduledFor),
  } as never)) as Doc

  await payload.create({
    collection: 'scheduled-publish-jobs',
    data: {
      article: input.articleId,
      job: queued.id,
      revision: currentRevisionId,
      scheduledFor: input.scheduledFor,
      timeZone: input.timeZone,
      idempotencyKey: input.idempotencyKey,
      status: 'queued',
      createdBy: input.actorUserId ?? null,
      createdAt: input.now ?? new Date().toISOString(),
    },
    overrideAccess: true,
  } as never)

  return loadBundleByArticleId(payload, input.articleId)
}

export async function publishScheduledArticle(
  payload: Payload,
  input: {
    articleId: string
    actor: EditorialActor
    idempotencyKey: string
    actorUserId?: string | null
    now?: string
  },
): Promise<boolean> {
  const bundle = await loadBundleByArticleId(payload, input.articleId)
  const scheduledJob = await findOne(payload, 'scheduled-publish-jobs', {
    idempotencyKey: { equals: input.idempotencyKey },
  })
  if (!scheduledJob || idOf(scheduledJob.article) !== input.articleId)
    throw new Error('Scheduled publication contract was not found.')
  const scheduledRevisionId = idOf(scheduledJob.revision)
  if (!bundle.revisions.some((revision) => String(revision.id) === scheduledRevisionId))
    throw new Error('Scheduled publication revision was not found.')
  // A later draft must never replace the revision chosen at schedule time.
  if (idOf(bundle.article.latestPublishedRevision) === scheduledRevisionId) return false
  const workflow = hydrateWorkflow(bundle)
  const published = workflow.publishScheduled(input.actor, input.idempotencyKey, input.now)
  const latestPublishedRevisionId = published
    ? scheduledRevisionId
    : idOf(bundle.article.latestPublishedRevision)

  await persistWorkflow(payload, bundle, workflow, {
    reason: 'published',
    actorUserId: input.actorUserId,
    latestPublishedRevisionId,
  })

  await payload.update({
    collection: 'scheduled-publish-jobs',
    id: scheduledJob.id,
    data: { status: published ? 'completed' : scheduledJob.status },
    overrideAccess: true,
  } as never)

  return published
}

export async function createEditorialPreviewToken(
  payload: Payload,
  input: {
    articleId: string
    revisionId?: string | null
    createdBy?: string | null
    expiresAt: string
  },
): Promise<{ token: string }> {
  if (!input.createdBy) throw new Error('Preview tokens require an authenticated creator.')
  if (new Date(input.expiresAt).getTime() - Date.now() > 60 * 60 * 1000)
    throw new Error('Preview tokens may not last longer than one hour.')
  const token = randomBytes(24).toString('hex')
  await payload.create({
    collection: 'preview-tokens',
    data: {
      article: input.articleId,
      revision: input.revisionId ?? null,
      tokenHash: hashPreviewToken(token),
      scope: 'article-preview',
      expiresAt: input.expiresAt,
      createdBy: input.createdBy ?? null,
      createdAt: new Date().toISOString(),
    },
    overrideAccess: true,
  } as never)
  await payload.update({
    collection: 'article-family-content',
    id: input.articleId,
    data: { lastPreviewedAt: new Date().toISOString() },
    overrideAccess: true,
  } as never)
  return { token }
}

export async function buildArticlePresentation(
  payload: Payload,
  input: {
    articleId: string
    revisionId?: string | null
    preview?: boolean
    previewMode?: 'desktop' | 'mobile'
  },
): Promise<EditorialPresentation> {
  const bundle = await loadBundleByArticleId(payload, input.articleId)
  const revisionId =
    input.revisionId ??
    (input.preview
      ? idOf(bundle.article.currentRevision)
      : bundle.article.latestPublishedRevision
        ? idOf(bundle.article.latestPublishedRevision)
        : idOf(bundle.article.currentRevision))
  const revision = bundle.revisions.find((entry) => String(entry.id) === revisionId)
  if (!revision) throw new Error('Requested revision does not exist.')
  const document = toRichTextDocument(revision.document)
  const sources = await sourceLookup(payload, bundle.article)
  const heroMediaId = idOf(bundle.content.heroMedia)
  const heroMedia = heroMediaId
    ? ((await payload
        .findByID({
          collection: 'media-assets',
          id: heroMediaId,
          depth: 0,
          overrideAccess: true,
        } as never)
        .catch(() => undefined)) as Doc | undefined)
    : undefined

  return {
    title: String(bundle.content.title),
    subtitle: bundle.content.subtitle ? String(bundle.content.subtitle) : null,
    excerpt: bundle.content.summary
      ? String(bundle.content.summary)
      : bundle.content.excerpt
        ? String(bundle.content.excerpt)
        : null,
    canonicalPath: String(bundle.content.canonicalPath),
    status: String(bundle.article.lifecycle),
    bodyText: document.plainTextProjection,
    body: document.document,
    readingTimeMinutes: estimateReadingTimeMinutes(document.plainTextProjection),
    tableOfContents: buildTableOfContents(document.document),
    authors: authorLabels(bundle.content),
    taxonomy: {
      sections: relationshipLabels(bundle.content.sections, 'name'),
      categories: relationshipLabels(bundle.content.categories, 'name'),
      topics: relationshipLabels(bundle.content.topics, 'name'),
      tags: relationshipLabels(bundle.content.tags, 'name'),
      series: relationshipLabels(bundle.content.series, 'name'),
    },
    citations: toWorkflowCitations(bundle.article.citations)
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((citation) => {
        const source = sources.get(citation.sourceReferenceId)
        return {
          citationId: citation.id,
          ordinal: citation.ordinal,
          bibliographyKey: source?.bibliographyKey ?? citation.sourceReferenceId,
          sourceTitle: source?.title ?? 'Untitled source',
          sourceUrl: source?.url ?? null,
          locator: source?.locator ?? null,
        }
      }),
    correctionNotices: asArray(bundle.content.correctionNotices).map((notice) => ({
      label: String(notice.label),
      detail: String(notice.detail),
      issuedAt: String(notice.issuedAt),
    })),
    changeNotes: asArray(bundle.content.changeNotes).map((note) => ({
      summary: String(note.summary),
      issuedAt: String(note.issuedAt),
    })),
    firstPublishedAt: bundle.article.firstPublishedAt
      ? String(bundle.article.firstPublishedAt)
      : null,
    updatedAt: bundle.content.updatedAtEditorial ? String(bundle.content.updatedAtEditorial) : null,
    previewMode: input.previewMode ?? 'desktop',
    preview: Boolean(input.preview),
    heroMedia:
      heroMedia && heroMedia.kind === 'image'
        ? {
            url: `/media/${heroMedia.id}`,
            altText: String(heroMedia.altText || heroMedia.title || ''),
            width: typeof heroMedia.width === 'number' ? heroMedia.width : undefined,
            height: typeof heroMedia.height === 'number' ? heroMedia.height : undefined,
          }
        : null,
  }
}

export async function resolveEditorialPreviewToken(
  payload: Payload,
  token: string,
  previewMode: 'desktop' | 'mobile' = 'desktop',
  viewerId?: string | null,
) {
  const hashed = hashPreviewToken(token)
  const preview = await findOne(payload, 'preview-tokens', { tokenHash: { equals: hashed } }, 1)
  if (!preview) throw new Error('Preview token was not found.')
  if (preview.revokedAt) throw new Error('Preview token has been revoked.')
  if (new Date(String(preview.expiresAt)).getTime() <= Date.now())
    throw new Error('Preview token has expired.')
  if (!viewerId || idOf(preview.createdBy) !== viewerId)
    throw new Error('Preview requires the authenticated creator session.')

  return buildArticlePresentation(payload, {
    articleId: idOf(preview.article),
    revisionId: preview.revision ? idOf(preview.revision) : null,
    preview: true,
    previewMode,
  })
}

export async function loadPublishedArticleBySlug(payload: Payload, slug: string) {
  const content = await findOne(
    payload,
    'content',
    {
      and: [
        { slug: { equals: slug } },
        { contentType: { equals: 'article' } },
        { status: { in: ['published', 'updated'] } },
      ],
    },
    2,
  )
  if (!content) throw new Error('Published article not found.')
  if (!canRenderPublic(content)) throw new Error('Published article is not publicly available.')
  const article = await findOne(
    payload,
    'article-family-content',
    { content: { equals: content.id } },
    2,
  )
  if (!article) throw new Error('Editorial article metadata not found.')
  if (!idOf(article.latestPublishedRevision)) throw new Error('Published revision was not found.')
  return buildArticlePresentation(payload, {
    articleId: String(article.id),
    revisionId: idOf(article.latestPublishedRevision),
    preview: false,
  })
}

/** The only public content resolver. It reads the explicitly published immutable revision. */
export async function loadPublishedArticleByPath(
  payload: Payload,
  input: { siteId: string; path: string },
) {
  const content = await findOne(
    payload,
    'content',
    {
      and: [
        { site: { equals: input.siteId } },
        { canonicalPath: { equals: input.path } },
        { contentType: { in: ['article', 'page'] } },
      ],
    },
    1,
  )
  if (!content || String(content.status) === 'archived' || !canRenderPublic(content))
    throw new Error('Published content was not found.')
  const article = await findOne(
    payload,
    'article-family-content',
    { content: { equals: content.id } },
    1,
  )
  if (!article || !idOf(article.latestPublishedRevision))
    throw new Error('Published revision was not found.')
  return buildArticlePresentation(payload, {
    articleId: String(article.id),
    revisionId: idOf(article.latestPublishedRevision),
  })
}

export async function promoteDiscussionPostToArticle(
  payload: Payload,
  input: {
    discussionPostId: string
    actor: EditorialActor
    actorUserId?: string | null
    siteId: string
    publicationId: string
    title: string
    slug: string
    canonicalPath: string
  },
) {
  const post = (await payload.findByID({
    collection: 'discussion-posts',
    id: input.discussionPostId,
    depth: 1,
    overrideAccess: true,
  })) as Doc
  if (post.visibility !== 'public' || post.status !== 'published') {
    throw new Error('Only published public discussion posts can be promoted.')
  }

  let authorIds: string[] = []
  if (post.authorGuest) {
    authorIds = [idOf(post.authorGuest)]
  } else if (post.authorMember) {
    const author = await findOne(payload, 'authors', {
      member: { equals: idOf(post.authorMember) },
    })
    if (author) authorIds = [String(author.id)]
  }

  return createEditorialArticle(payload, {
    siteId: input.siteId,
    publicationId: input.publicationId,
    title: input.title,
    slug: input.slug,
    canonicalPath: input.canonicalPath,
    summary: String(post.body).slice(0, 180),
    excerpt: String(post.body).slice(0, 180),
    authorIds,
    actor: input.actor,
    actorUserId: input.actorUserId,
    document: {
      format: 'payload-lexical',
      schemaVersion: 1,
      document: {
        root: {
          type: 'root',
          children: [{ type: 'paragraph', children: [{ type: 'text', text: String(post.body) }] }],
        },
      },
      canonicalHash: `sha256:${createHash('sha256').update(String(post.body)).digest('hex')}`,
      plainTextProjection: String(post.body),
      unknownNodePolicy: 'preserve',
    },
    sourceReferences: asArray(post.sources).map((source, index) => ({
      sourceReferenceId: `promoted-source-${index + 1}`,
      sourceId: idOf(source),
      bibliographyKey: `PROMO-${index + 1}`,
      publicVisibility: 'public',
    })),
    promotionProvenance: {
      discussionId: idOf(post.discussion),
      discussionPostId: String(post.id),
      originalPermalink: String(post.permalink),
      authorMemberId: post.authorMember ? idOf(post.authorMember) : null,
      authorGuestId: post.authorGuest ? idOf(post.authorGuest) : null,
    },
  })
}
