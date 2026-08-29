/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'

import { assertIanaTimeZone } from '../calendar/contracts'
import { publishScheduledArticle } from '../editorial/persistence'
import { OPERATIONS_QUEUE } from '../operations/tasks'
import { publishProductRelease } from '../commerce/service'

type Doc = Record<string, any>
type ItemStatus = 'pending' | 'succeeded' | 'failed' | 'blocked' | 'skipped'
type ReleaseItem = {
  key: string
  type: 'article' | 'product'
  targetId: string
  revisionId?: string
  status: ItemStatus
  attempts: number
  error?: string
  updatedAt: string
}
const idOf = (value: unknown) =>
  typeof value === 'string' ? value : String((value as Doc)?.id ?? (value as Doc)?.value ?? '')
const list = (value: unknown): ReleaseItem[] =>
  Array.isArray(value) ? (value as ReleaseItem[]) : []
const findOne = async (payload: Payload, collection: string, where: Record<string, unknown>) => {
  const result = (await payload.find({
    collection: collection as never,
    where,
    depth: 0,
    limit: 1,
    overrideAccess: true,
  } as never)) as { docs: Doc[] }
  return result.docs[0] ?? null
}

async function releaseTargets(payload: Payload, release: Doc): Promise<ReleaseItem[]> {
  const targets = new Map<string, ReleaseItem>()
  const addArticle = async (articleId: string) => {
    const article = (await payload.findByID({
      collection: 'article-family-content' as never,
      id: articleId,
      depth: 0,
      overrideAccess: true,
    } as never)) as Doc
    targets.set(`article:${article.id}`, {
      key: `article:${article.id}`,
      type: 'article',
      targetId: String(article.id),
      revisionId: idOf(article.currentRevision),
      status: 'pending',
      attempts: 0,
      updatedAt: new Date().toISOString(),
    })
  }
  if (release.article) await addArticle(idOf(release.article))
  if (release.content) {
    const article = await findOne(payload, 'article-family-content', {
      content: { equals: idOf(release.content) },
    })
    if (!article)
      throw new Error(
        `Content target ${idOf(release.content)} has no supported article publication service.`,
      )
    await addArticle(String(article.id))
  }
  if (release.product) {
    const productId = idOf(release.product)
    targets.set(`product:${productId}`, {
      key: `product:${productId}`,
      type: 'product',
      targetId: productId,
      revisionId: release.productRevision ? String(release.productRevision) : undefined,
      status: 'pending',
      attempts: 0,
      updatedAt: new Date().toISOString(),
    })
  }
  if (!targets.size) throw new Error('ContentRelease has no supported target.')
  return [...targets.values()]
}

const appendAudit = (release: Doc, event: Record<string, unknown>) => [
  ...(Array.isArray(release.executionAudit) ? release.executionAudit : []),
  event,
]
async function queueRelease(payload: Payload, release: Doc, actorId: string, waitUntil: Date) {
  return payload.jobs.queue({
    task: 'content-release-execute',
    input: {
      releaseId: String(release.id),
      scheduleMutationId: String(release.lastScheduleMutationId),
      actorId,
    },
    queue: OPERATIONS_QUEUE,
    waitUntil,
  } as never) as Promise<Doc>
}

/** Canonical scheduling command. Calendar callers use this boundary and receive a durable Payload job. */
export async function scheduleContentRelease(
  payload: Payload,
  input: {
    releaseId: string
    scheduledFor: string
    timeZone: string
    actorId: string
    idempotencyKey: string
  },
) {
  assertIanaTimeZone(input.timeZone)
  if (Number.isNaN(new Date(input.scheduledFor).getTime()))
    throw new Error('ContentRelease schedule must be a valid instant.')
  const release = (await payload.findByID({
    collection: 'content-releases' as never,
    id: input.releaseId,
    depth: 0,
    overrideAccess: true,
  } as never)) as Doc
  if (release.lastScheduleMutationId === input.idempotencyKey && release.executionJob)
    return release
  const items = await releaseTargets(payload, release)
  const blockers = await blockingIssues(payload, [
    String(release.id),
    ...items.flatMap((item) => [item.targetId, ...(item.revisionId ? [item.revisionId] : [])]),
  ])
  if (blockers.length)
    throw new Error('ContentRelease is blocked by unresolved publication-blocking quality issues.')
  const queued = (await payload.jobs.queue({
    task: 'content-release-execute',
    input: {
      releaseId: input.releaseId,
      scheduleMutationId: input.idempotencyKey,
      actorId: input.actorId,
    },
    queue: OPERATIONS_QUEUE,
    waitUntil: new Date(input.scheduledFor),
  } as never)) as Doc
  const before = { scheduledFor: release.scheduledFor ?? null, timeZone: release.timeZone ?? null }
  return payload.update({
    collection: 'content-releases' as never,
    id: input.releaseId,
    data: {
      scheduledFor: input.scheduledFor,
      timeZone: input.timeZone,
      status: 'scheduled',
      lastScheduleMutationId: input.idempotencyKey,
      executionJob: queued.id,
      executionItems: items,
      scheduleAudit: [
        ...(Array.isArray(release.scheduleAudit) ? release.scheduleAudit : []),
        {
          action: 'release.scheduled',
          actorId: input.actorId,
          at: new Date().toISOString(),
          before,
          after: { scheduledFor: input.scheduledFor, timeZone: input.timeZone },
          jobId: queued.id,
        },
      ],
      executionAudit: appendAudit(release, {
        action: 'release.execution.queued',
        actorId: input.actorId,
        at: new Date().toISOString(),
        jobId: queued.id,
      }),
    },
    overrideAccess: true,
  } as never)
}

async function blockingIssues(payload: Payload, ids: string[]) {
  const result = (await payload.find({
    collection: 'quality-issues' as never,
    where: {
      and: [
        { targetId: { in: ids } },
        { severity: { equals: 'publication_blocking' } },
        { status: { in: ['open', 'uncertain'] } },
      ],
    },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  } as never)) as { docs: Doc[] }
  return result.docs
}

export async function executeContentRelease(
  payload: Payload,
  input: { releaseId: string; scheduleMutationId: string; actorId: string },
) {
  const release = (await payload.findByID({
    collection: 'content-releases' as never,
    id: input.releaseId,
    depth: 0,
    overrideAccess: true,
  } as never)) as Doc
  if (release.lastScheduleMutationId !== input.scheduleMutationId)
    return {
      releaseId: input.releaseId,
      status: String(release.status),
      succeeded: 0,
      unresolved: 0,
    }
  if (release.status === 'cancelled' || release.status === 'released') {
    const succeeded = list(release.executionItems).filter((i) => i.status === 'succeeded').length
    return { releaseId: input.releaseId, status: String(release.status), succeeded, unresolved: 0 }
  }
  let items = list(release.executionItems)
  if (!items.length) items = await releaseTargets(payload, release)
  const next = [...items]
  for (let index = 0; index < next.length; index++) {
    const item = next[index]
    if (item.status === 'succeeded' || item.status === 'skipped') continue
    const at = new Date().toISOString()
    let updated: ReleaseItem
    try {
      if (item.type === 'article') {
        const article = (await payload.findByID({
          collection: 'article-family-content' as never,
          id: item.targetId,
          depth: 0,
          overrideAccess: true,
        } as never)) as Doc
        const currentRevision = idOf(article.currentRevision)
        if (!item.revisionId || currentRevision !== item.revisionId)
          throw new Error('Pinned article revision is stale.')
        const blockers = await blockingIssues(payload, [
          String(release.id),
          item.targetId,
          currentRevision,
        ])
        if (blockers.length) {
          updated = {
            ...item,
            status: 'blocked',
            attempts: item.attempts + 1,
            error: `Blocked by quality issue(s): ${blockers.map((issue) => issue.id).join(', ')}`,
            updatedAt: at,
          }
          next[index] = updated
          continue
        }
        if (
          article.lifecycle === 'published' &&
          idOf(article.latestPublishedRevision) === currentRevision
        ) {
          updated = {
            ...item,
            status: 'succeeded',
            attempts: item.attempts + 1,
            error: undefined,
            updatedAt: at,
          }
        } else {
          await publishScheduledArticle(payload, {
            articleId: item.targetId,
            actor: { id: input.actorId, role: 'publisher' },
            actorUserId: input.actorId,
            idempotencyKey: `release:${release.id}:${item.key}`,
          })
          updated = {
            ...item,
            status: 'succeeded',
            attempts: item.attempts + 1,
            error: undefined,
            updatedAt: at,
          }
        }
      } else {
        const blockers = await blockingIssues(payload, [String(release.id), item.targetId])
        if (blockers.length) {
          updated = {
            ...item,
            status: 'blocked',
            attempts: item.attempts + 1,
            error: `Blocked by quality issue(s): ${blockers.map((issue) => issue.id).join(', ')}`,
            updatedAt: at,
          }
          next[index] = updated
          continue
        }
        await publishProductRelease(payload, {
          productId: item.targetId,
          revisionId: item.revisionId,
          idempotencyKey: `release:${release.id}:${item.key}`,
        })
        updated = {
          ...item,
          status: 'succeeded',
          attempts: item.attempts + 1,
          error: undefined,
          updatedAt: at,
        }
      }
    } catch (error) {
      updated = {
        ...item,
        status: 'failed',
        attempts: item.attempts + 1,
        error: error instanceof Error ? error.message : 'Unknown execution failure',
        updatedAt: at,
      }
    }
    next[index] = updated!
  }
  const unresolved = next.filter((item) => !['succeeded', 'skipped'].includes(item.status))
  const succeeded = next.filter((item) => item.status === 'succeeded').length
  const status =
    unresolved.length === 0
      ? 'released'
      : unresolved.some((item) => item.status === 'blocked')
        ? 'blocked'
        : 'partial-failure'
  await payload.update({
    collection: 'content-releases' as never,
    id: release.id,
    data: {
      status,
      executionItems: next,
      executionAudit: appendAudit(release, {
        action: 'release.execution.completed',
        actorId: input.actorId,
        at: new Date().toISOString(),
        status,
        succeeded,
        unresolved: unresolved.map((item) => ({
          key: item.key,
          status: item.status,
          error: item.error,
        })),
      }),
    },
    overrideAccess: true,
  } as never)
  return { releaseId: String(release.id), status, succeeded, unresolved: unresolved.length }
}

/** Operator retry affordance; creates another durable job but never replays succeeded items. */
export async function retryContentRelease(
  payload: Payload,
  input: { releaseId: string; actorId: string },
) {
  const release = (await payload.findByID({
    collection: 'content-releases' as never,
    id: input.releaseId,
    depth: 0,
    overrideAccess: true,
  } as never)) as Doc
  if (!release.lastScheduleMutationId) throw new Error('Only a scheduled release can be retried.')
  const unresolved = list(release.executionItems).filter(
    (item) => !['succeeded', 'skipped'].includes(item.status),
  )
  if (!unresolved.length) return release
  const queued = await queueRelease(payload, release, input.actorId, new Date())
  return payload.update({
    collection: 'content-releases' as never,
    id: release.id,
    data: {
      status: 'scheduled',
      executionJob: queued.id,
      executionAudit: appendAudit(release, {
        action: 'release.execution.retry-queued',
        actorId: input.actorId,
        at: new Date().toISOString(),
        jobId: queued.id,
        retryId: randomUUID(),
        unresolved: unresolved.map((item) => item.key),
      }),
    },
    overrideAccess: true,
  } as never)
}
