import type { Payload } from 'payload'

import { buildTableOfContents } from '../editorial/presentation'
import { OPERATIONS_QUEUE } from '../operations/tasks'
import { canWaive, qualityDedupeKey, scanLocal, type QualityFinding } from './contracts'

type Doc = Record<string, any>
type ScanTargetType = 'document' | 'content-release' | 'publication' | 'space' | 'site'
const idOf = (value: unknown) =>
  typeof value === 'string' ? value : String((value as Doc | undefined)?.id ?? '')
const docs = (value: unknown) => (value as { docs?: Doc[] }).docs ?? []
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

/** Local-only producer. External URL checks stay disabled until a guarded fetch boundary exists. */
export async function produceLocalFindings(
  payload: Payload,
  input: { targetType: ScanTargetType; targetId: string },
) {
  if (input.targetType !== 'document') return [] as QualityFinding[]
  const article = (await payload.findByID({
    collection: 'article-family-content' as never,
    id: input.targetId,
    depth: 0,
    overrideAccess: true,
  } as never)) as Doc
  const contentId = idOf(article.content)
  const content = contentId
    ? ((await payload.findByID({
        collection: 'content' as never,
        id: contentId,
        depth: 0,
        overrideAccess: true,
      } as never)) as Doc)
    : null
  const mediaId = idOf(content?.heroMedia)
  const media = mediaId
    ? ((await payload.findByID({
        collection: 'media-assets' as never,
        id: mediaId,
        depth: 0,
        overrideAccess: true,
      } as never)) as Doc)
    : null
  const translation = content?.translationStatus ?? content?.localeCompleteness?.status
  return scanLocal({
    targetId: input.targetId,
    canonicalUrl: content?.seoCanonicalURL,
    headings: buildTableOfContents(article.document ?? {}).map((heading) => heading.level),
    images: media
      ? [
          {
            id: String(media.id),
            altText: media.altText,
            rightsStatus: media.rightsStatus,
            rightsExpiresAt: media.rightsExpiresAt,
          },
        ]
      : [],
    translationStatus: typeof translation === 'string' ? translation : undefined,
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
  for (const finding of input.findings) {
    const dedupeKey = qualityDedupeKey({
      rule: finding.rule,
      targetId: String(input.scan.targetId),
      location: finding.location,
    })
    seen.add(dedupeKey)
    const existing = await findOne(payload, 'quality-issues', { dedupeKey: { equals: dedupeKey } })
    const base = {
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
        id: existing.id,
        data: { ...base, status: 'waived' },
        overrideAccess: true,
      } as never)
      updated++
    } else {
      if (existing.status === 'resolved') reopened++
      await payload.update({
        collection: 'quality-issues' as never,
        id: existing.id,
        data: {
          ...base,
          workflowState: existing.status === 'resolved' ? 'new' : (existing.workflowState ?? 'new'),
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
          { targetType: { equals: input.scan.targetType } },
          { targetId: { equals: input.scan.targetId } },
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
    if (!seen.has(String(issue.dedupeKey))) {
      await payload.update({
        collection: 'quality-issues' as never,
        id: issue.id,
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

export async function executeQualityScan(payload: Payload, input: { scanId: string }) {
  const scan = (await payload.findByID({
    collection: 'quality-scans' as never,
    id: input.scanId,
    depth: 0,
    overrideAccess: true,
  } as never)) as Doc
  await payload.update({
    collection: 'quality-scans' as never,
    id: scan.id,
    data: { status: 'running', startedAt: new Date().toISOString() },
    overrideAccess: true,
  } as never)
  try {
    const findings = await produceLocalFindings(
      payload,
      scan as { targetType: ScanTargetType; targetId: string },
    )
    const summary = await persistQualityFindings(payload, { scan, findings })
    await payload.update({
      collection: 'quality-scans' as never,
      id: scan.id,
      data: { status: 'completed', completedAt: new Date().toISOString(), summary },
      overrideAccess: true,
    } as never)
    return summary
  } catch (error) {
    await payload.update({
      collection: 'quality-scans' as never,
      id: scan.id,
      data: {
        status: 'failed',
        completedAt: new Date().toISOString(),
        summary: { error: error instanceof Error ? error.message : 'Unknown scan failure' },
      },
      overrideAccess: true,
    } as never)
    throw error
  }
}

export async function queueQualityScan(
  payload: Payload,
  input: { targetType: ScanTargetType; targetId: string; revisionId?: string },
) {
  const scan = (await payload.create({
    collection: 'quality-scans' as never,
    data: {
      targetType: input.targetType,
      targetId: input.targetId,
      revisionId: input.revisionId,
      status: 'queued',
    },
    overrideAccess: true,
  } as never)) as Doc
  const job = (await payload.jobs.queue({
    task: 'quality-scan',
    input: { scanId: String(scan.id) },
    queue: OPERATIONS_QUEUE,
  } as never)) as Doc
  return payload.update({
    collection: 'quality-scans' as never,
    id: scan.id,
    data: { job: job.id },
    overrideAccess: true,
  } as never)
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
  } as never)) as Doc
  if (
    !canWaive({
      severity: issue.severity,
      category: issue.category ?? 'content',
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
    id: issue.id,
    data: { status: 'waived' },
    overrideAccess: true,
  } as never)
}
