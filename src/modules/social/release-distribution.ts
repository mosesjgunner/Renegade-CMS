import type { Payload } from 'payload'
import type { CoordinatedRelease, ReleaseArtifactItem } from '../releases/contracts'
import { executeSocialQueueItem } from './tasks'

type Doc = Record<string, any>
const idOf = (value: unknown): string =>
  typeof value === 'object' && value !== null ? String((value as Doc).id) : String(value ?? '')

/** Release distribution uses the same persisted outbox and provider worker as standalone social jobs. */
export async function executeReleaseDistribution(
  payload: Payload,
  release: Partial<CoordinatedRelease>,
  item: ReleaseArtifactItem,
  actorId: string,
) {
  const draftId = item.distributionDraftId || item.targetId
  const draft = (await payload.findByID({
    collection: 'social-drafts' as never,
    id: draftId,
    depth: 0,
    overrideAccess: true,
  } as never)) as Doc
  if (!['approved', 'published', 'partially-published', 'failed'].includes(draft?.status))
    throw new Error('Distribution draft requires operator approval.')
  if (draft.sourceContent) {
    const source = await payload.findByID({
      collection: 'content',
      id: idOf(draft.sourceContent),
      depth: 0,
      overrideAccess: true,
    })
    if (source.status !== 'published')
      throw new Error('Canonical content must be published before distribution.')
  }
  const variants = (await payload.find({
    collection: 'social-network-variants' as never,
    where: { draft: { equals: draftId } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as { docs: Doc[] }
  if (!variants.docs.length) throw new Error('Distribution draft has no eligible destinations.')
  const failures: string[] = []
  let succeeded = 0
  for (const variant of variants.docs) {
    if (!['approved', 'published', 'failed', 'scheduled'].includes(variant.status)) {
      failures.push(`${variant.label}: variant requires approval`)
      continue
    }
    const key = `release:${release.id}:${item.id}:${variant.id}`
    const existing = (await payload.find({
      collection: 'social-queue-items' as never,
      where: { idempotencyKey: { equals: key } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)) as unknown as { docs: Doc[] }
    let queue = existing.docs[0]
    if (!queue)
      queue = (await payload.create({
        collection: 'social-queue-items' as never,
        data: {
          variant: variant.id,
          account: idOf(variant.account),
          scheduledFor: release.scheduledFor || new Date().toISOString(),
          timeZone: release.timeZone || 'UTC',
          status: 'scheduled',
          idempotencyKey: key,
        },
        overrideAccess: true,
      } as never)) as Doc
    if (queue.status === 'failed') {
      // An explicit release retry reopens only failed work, retaining attempts and failure history.
      await payload.update({
        collection: 'social-queue-items' as never,
        id: queue.id,
        data: { status: 'scheduled', nextAttemptAt: null },
        overrideAccess: true,
      } as never)
    }
    if (queue.status !== 'published') {
      try {
        await executeSocialQueueItem(payload, { queueItemId: String(queue.id), workerId: actorId })
      } catch {
        /* The provider worker persists actionable failure before returning/throwing. */
      }
    }
    queue = (await payload.findByID({
      collection: 'social-queue-items' as never,
      id: queue.id,
      depth: 0,
      overrideAccess: true,
    } as never)) as Doc
    if (queue.status === 'published') succeeded++
    else
      failures.push(
        `${variant.label}: ${queue.deadLetterReason?.message || 'Delivery pending or retryable; inspect publish attempts.'}`,
      )
  }
  await payload.update({
    collection: 'social-drafts' as never,
    id: draftId,
    data: {
      status: failures.length ? (succeeded ? 'partially-published' : 'failed') : 'published',
    },
    overrideAccess: true,
  } as never)
  if (failures.length) throw new Error(failures.join(' '))
  return {
    output: { distributed: true, distributionDraftId: draftId, succeeded },
    lastKnownGoodState: { distributionDraftId: draftId },
    url: item.canonicalUrl,
  }
}
