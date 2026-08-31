import type { Payload } from 'payload'

import { buildTableOfContents } from '../editorial/presentation'
import { OPERATIONS_QUEUE } from '../operations/tasks'
import { canIgnore, canWaive, qualityDedupeKey, scanLocal, type QualityFinding } from './contracts'

type Doc = Record<string, unknown>
type QualityScanSummary = { created: number; updated: number; reopened: number; resolved: number; findings: number }
type ScanTargetType =
  | 'document'
  | 'book'
  | 'book-chapter'
  | 'content-release'
  | 'publication'
  | 'space'
  | 'site'
const idOf = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id: unknown }).id
    return typeof id === 'string' || typeof id === 'number' ? String(id) : ''
  }
  return ''
}
const docs = (value: unknown): Doc[] => {
  if (
    typeof value === 'object' &&
    value !== null &&
    'docs' in value &&
    Array.isArray((value as { docs: unknown }).docs)
  ) {
    return (value as { docs: Doc[] }).docs
  }
  return []
}
const categoryFor = (rule: string) =>
  rule.startsWith('media-')
    ? 'media'
    : rule.startsWith('translation')
      ? 'translation'
      : rule.startsWith('canonical')
        ? 'seo'
        : 'editorial'

async function findOne(payload: Payload, collection: string, where: Record<string, unknown>) {
  return (
    docs(
      await payload.find({
        collection: collection as never,
        where,
        depth: 0,
        limit: 1,
        overrideAccess: true,
      } as never),
    )[0] ?? null
  )
}

async function targetSiteId(payload: Payload, targetType: ScanTargetType, targetId: string) {
  if (targetType === 'book') return idOf((await payload.findByID({ collection: 'books' as never, id: targetId, depth: 0, overrideAccess: true } as never) as unknown as Doc).site)
  if (targetType === 'book-chapter') {
    const chapter = await payload.findByID({ collection: 'book-chapters' as never, id: targetId, depth: 0, overrideAccess: true } as never) as unknown as Doc
    const book = await payload.findByID({ collection: 'books' as never, id: idOf(chapter.book), depth: 0, overrideAccess: true } as never) as unknown as Doc
    return idOf(book.site)
  }
  if (targetType === 'document') {
    const article = await payload.findByID({ collection: 'article-family-content' as never, id: targetId, depth: 0, overrideAccess: true } as never) as unknown as Doc
    const content = await payload.findByID({ collection: 'content' as never, id: idOf(article.content), depth: 0, overrideAccess: true } as never) as unknown as Doc
    return idOf(content.site)
  }
  return ''
}

const linksFrom = (value: unknown) => {
  const serialized = JSON.stringify(value ?? {})
  return [...serialized.matchAll(/(?:href|url)\\?"\\s*:\\s*\\?"([^"\\]+)\\?"/g)]
    .map((match) => match[1])
    .filter((href) => href.startsWith('/'))
}

/** Local-only producer. External URL checks stay disabled until a guarded fetch boundary exists. */
export async function produceLocalFindings(
  payload: Payload,
  input: { targetType: ScanTargetType; targetId: string },
) {
  if (input.targetType === 'book') {
    const book = (await payload.findByID({ collection: 'books' as never, id: input.targetId, depth: 0, overrideAccess: true } as never)) as unknown as Doc | null
    if (!book) return []
    const samePath = await payload.find({ collection: 'books' as never, where: { and: [{ site: { equals: idOf(book.site) } }, { canonicalPath: { equals: book.canonicalPath } }] }, limit: 2, depth: 0, overrideAccess: true } as never)
    const findings = scanLocal({ targetId: input.targetId, title: typeof book.title === 'string' ? book.title : undefined, description: typeof book.description === 'string' ? book.description : undefined, canonicalUrl: typeof book.seoCanonicalURL === 'string' ? book.seoCanonicalURL : undefined })
    if (docs(samePath).length > 1) findings.push({ rule: 'canonical-duplicate', severity: 'publication_blocking', message: 'Another book in this site uses the same canonical path.', remediation: 'Choose one canonical path and redirect the duplicate.', location: 'canonicalPath' })
    return findings
  }
  const chapter = input.targetType === 'book-chapter'
    ? ((await payload.findByID({ collection: 'book-chapters' as never, id: input.targetId, depth: 0, overrideAccess: true } as never)) as unknown as Doc | null)
    : null
  const articleId = input.targetType === 'document' ? input.targetId : idOf(chapter?.content)
  if (!articleId) return [] as QualityFinding[]
  const article = (await payload.findByID({
    collection: 'article-family-content' as never,
    id: articleId,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as Doc | null
  if (!article) return [] as QualityFinding[]
  const contentId = idOf(article.content)
  const content = contentId
    ? ((await payload.findByID({
        collection: 'content' as never,
        id: contentId,
        depth: 0,
        overrideAccess: true,
      } as never)) as unknown as Doc | null)
    : null
  const mediaId = idOf(content?.heroMedia)
  const media = mediaId
    ? ((await payload.findByID({
        collection: 'media-assets' as never,
        id: mediaId,
        depth: 0,
        overrideAccess: true,
      } as never)) as unknown as Doc | null)
    : null
  const localeStatus =
    typeof content?.localeCompleteness === 'object' &&
    content?.localeCompleteness !== null &&
    'status' in content.localeCompleteness &&
    typeof (content.localeCompleteness as { status?: unknown }).status === 'string'
      ? (content.localeCompleteness as { status: string }).status
      : undefined
  const translation =
    typeof content?.translationStatus === 'string' ? content.translationStatus : localeStatus
  const docObj =
    typeof article.document === 'object' && article.document !== null
      ? (article.document as Record<string, unknown>)
      : {}
  const internalLinks = await Promise.all(linksFrom(docObj).map(async (href) => {
    const result = await payload.find({ collection: 'content' as never, where: { canonicalPath: { equals: href } }, limit: 1, depth: 0, overrideAccess: true } as never)
    const target = docs(result)[0]
    return { href, exists: Boolean(target), visible: Boolean(target?.status && ['published', 'updated'].includes(String(target.status))) }
  }))
  return scanLocal({
    targetId: input.targetId,
    title: typeof content?.title === 'string' ? content.title : undefined,
    description: typeof content?.seoDescription === 'string' ? content.seoDescription : typeof content?.summary === 'string' ? content.summary : undefined,
    canonicalUrl:
      typeof content?.seoCanonicalURL === 'string' ? content.seoCanonicalURL : undefined,
    headings: buildTableOfContents(docObj).map((heading) => heading.level),
    images: media
      ? [
          {
            id: idOf(media.id) || mediaId,
            altText: typeof media.altText === 'string' ? media.altText : undefined,
            rightsStatus: typeof media.rightsStatus === 'string' ? media.rightsStatus : undefined,
            rightsExpiresAt:
              typeof media.rightsExpiresAt === 'string' ? media.rightsExpiresAt : undefined,
          },
        ]
      : [],
    internalLinks,
    translationStatus: translation,
  })
}

async function activeWaiver(payload: Payload, issueId: string, now: Date) {
  return Boolean(
    await findOne(payload, 'quality-waivers', {
      issue: { equals: issueId },
      expiresAt: { greater_than: now.toISOString() },
    }),
  )
}

export async function persistQualityFindings(
  payload: Payload,
  input: { scan: Doc; findings: readonly QualityFinding[]; now?: Date },
) {
  const now = input.now ?? new Date()
  const seen = new Set<string>()
  let created = 0,
    updated = 0,
    reopened = 0
  const scanTargetId = String(input.scan.targetId ?? '')
  const scanTargetType = String(input.scan.targetType ?? '')
  for (const finding of input.findings) {
    const dedupeKey = qualityDedupeKey({
      siteId: idOf(input.scan.site),
      rule: finding.rule,
      targetId: scanTargetId,
      location: finding.location,
    })
    seen.add(dedupeKey)
    const existing = await findOne(payload, 'quality-issues', { dedupeKey: { equals: dedupeKey } })
    const base = {
      site: idOf(input.scan.site),
      scan: input.scan.id,
      revisionId: input.scan.revisionId,
      targetType: input.scan.targetType,
      targetId: input.scan.targetId,
      severity: finding.severity,
      status: finding.uncertain ? 'uncertain' : 'open',
      category: categoryFor(finding.rule),
      message: finding.message,
      remediation: { text: finding.remediation, location: finding.location },
      dependencyFingerprint: finding.location,
      repairUrl: finding.repairUrl ?? `/admin/collections/${input.scan.targetType === 'book-chapter' ? 'book-chapters' : 'article-family-content'}/${scanTargetId}`,
      lastSeenAt: now.toISOString(),
    }
    if (!existing) {
      await payload.create({
        collection: 'quality-issues' as never,
        data: { ...base, dedupeKey, workflowState: 'new', firstSeenAt: now.toISOString() },
        overrideAccess: true,
      } as never)
      created++
    } else if (
      existing.status === 'waived' &&
      (await activeWaiver(payload, String(existing.id), now))
    ) {
      await payload.update({
        collection: 'quality-issues' as never,
        id: String(existing.id),
        data: { ...base, status: 'waived' },
        overrideAccess: true,
      } as never)
      updated++
    } else {
      if (existing.status === 'resolved') reopened++
      const currentWorkflowState =
        typeof existing.workflowState === 'string' ? existing.workflowState : 'new'
      await payload.update({
        collection: 'quality-issues' as never,
        id: String(existing.id),
        data: {
          ...base,
          workflowState: existing.status === 'resolved' ? 'new' : currentWorkflowState,
          resolvedAt: null,
        },
        overrideAccess: true,
      } as never)
      updated++
    }
  }
  const open = docs(
    await payload.find({
      collection: 'quality-issues' as never,
      where: {
        and: [
          { targetType: { equals: scanTargetType } },
          { targetId: { equals: scanTargetId } },
          { status: { in: ['open', 'uncertain'] } },
        ],
      },
      depth: 0,
      limit: 500,
      overrideAccess: true,
    } as never),
  )
  let resolved = 0
  for (const issue of open)
    if (!seen.has(String(issue.dedupeKey ?? ''))) {
      await payload.update({
        collection: 'quality-issues' as never,
        id: String(issue.id),
        data: {
          status: 'resolved',
          resolvedAt: now.toISOString(),
          workflowState: 'ready_for_rescan',
        },
        overrideAccess: true,
      } as never)
      resolved++
    }
  return { created, updated, reopened, resolved, findings: input.findings.length }
}

export async function executeQualityScan(payload: Payload, input: { scanId: string; now?: Date }): Promise<QualityScanSummary> {
  const scan = (await payload.findByID({
    collection: 'quality-scans' as never,
    id: input.scanId,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as Doc
  const now = input.now ?? new Date()
  if (scan.status === 'completed' || scan.status === 'stale')
    return { created: 0, updated: 0, reopened: 0, resolved: 0, findings: 0 }
  await payload.update({
    collection: 'quality-scans' as never,
    id: String(scan.id),
    data: { status: 'running', startedAt: now.toISOString() },
    overrideAccess: true,
  } as never)
  try {
    const targetType = scan.targetType as ScanTargetType
    const targetId = String(scan.targetId ?? '')
    const findings = await produceLocalFindings(payload, { targetType, targetId })
    const summary = await persistQualityFindings(payload, { scan, findings, now })
    await payload.update({
      collection: 'quality-scans' as never,
      id: String(scan.id),
      data: { status: 'completed', completedAt: now.toISOString(), summary },
      overrideAccess: true,
    } as never)
    return summary as QualityScanSummary
  } catch (error) {
    await payload.update({
      collection: 'quality-scans' as never,
      id: String(scan.id),
      data: {
        status: 'failed',
        completedAt: now.toISOString(),
        summary: { error: error instanceof Error ? error.message : 'Unknown scan failure' },
      },
      overrideAccess: true,
    } as never)
    throw error
  }
}

export async function queueQualityScan(
  payload: Payload,
  input: { siteId: string; targetType: ScanTargetType; targetId: string; revisionId?: string },
) {
  const targetSite = await targetSiteId(payload, input.targetType, input.targetId)
  if (targetSite && targetSite !== input.siteId)
    throw new Error('Quality scans cannot cross tenant boundaries.')
  const scan = (await payload.create({
    collection: 'quality-scans' as never,
    data: {
      site: input.siteId,
      targetType: input.targetType,
      targetId: input.targetId,
      revisionId: input.revisionId,
      status: 'queued',
    },
    overrideAccess: true,
  } as never)) as unknown as Doc
  const job = (await payload.jobs.queue({
    task: 'quality-scan',
    input: { scanId: String(scan.id) },
    queue: OPERATIONS_QUEUE,
  } as never)) as unknown as Doc
  return payload.update({
    collection: 'quality-scans' as never,
    id: String(scan.id),
    data: { job: job.id },
    overrideAccess: true,
  } as never)
}

/** A worker can call this before polling to make abandoned scan jobs visible and rescanable. */
export async function markStaleQualityScans(payload: Payload, input: { olderThan: Date }) {
  const result = await payload.find({ collection: 'quality-scans' as never, where: { and: [{ status: { equals: 'running' } }, { startedAt: { less_than: input.olderThan.toISOString() } }] }, limit: 500, depth: 0, overrideAccess: true } as never)
  await Promise.all((result.docs as unknown as Doc[]).map((scan) => payload.update({ collection: 'quality-scans' as never, id: String(scan.id), data: { status: 'stale', completedAt: input.olderThan.toISOString(), summary: { error: 'Scan exceeded its worker lease; rescan required.' } }, overrideAccess: true } as never)))
  return result.docs.length
}

export async function ignoreQualityIssue(
  payload: Payload,
  input: { issueId: string; actorRole: 'owner' | 'staff'; reason: string; now?: Date },
) {
  if (!input.reason.trim()) throw new Error('Ignoring a finding requires a false-positive reason.')
  const issue = (await payload.findByID({ collection: 'quality-issues' as never, id: input.issueId, depth: 0, overrideAccess: true } as never)) as unknown as Doc
  const severity = issue.severity as 'informational' | 'warning' | 'publication_blocking'
  if (!canIgnore({ severity, actorRole: input.actorRole })) throw new Error('This quality issue cannot be ignored.')
  return payload.update({ collection: 'quality-issues' as never, id: input.issueId, data: { status: 'ignored', ignoredAt: (input.now ?? new Date()).toISOString(), ignoredReason: input.reason }, overrideAccess: true } as never)
}

/** Waivers require an owner and retain a separate authorization record. */
export async function waiveQualityIssue(
  payload: Payload,
  input: {
    issueId: string
    actorId: string
    actorRole: 'owner' | 'staff'
    reason: string
    expiresAt: string
  },
) {
  if (
    !input.reason.trim() ||
    Number.isNaN(Date.parse(input.expiresAt)) ||
    new Date(input.expiresAt) <= new Date()
  )
    throw new Error('A waiver requires a future expiry and reason.')
  const issue = (await payload.findByID({
    collection: 'quality-issues' as never,
    id: input.issueId,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as Doc
  const severity =
    issue.severity === 'informational' ||
    issue.severity === 'warning' ||
    issue.severity === 'publication_blocking'
      ? issue.severity
      : 'warning'
  const category = typeof issue.category === 'string' ? issue.category : 'content'
  if (
    !canWaive({
      severity,
      category,
      actorRole: input.actorRole,
    })
  )
    throw new Error('This quality issue is not eligible for waiver.')
  await payload.create({
    collection: 'quality-waivers' as never,
    data: {
      issue: issue.id,
      reason: input.reason,
      actor: input.actorId,
      authorizedBy: input.actorId,
      expiresAt: input.expiresAt,
    },
    overrideAccess: true,
  } as never)
  return payload.update({
    collection: 'quality-issues' as never,
    id: String(issue.id),
    data: { status: 'waived' },
    overrideAccess: true,
  } as never)
}
