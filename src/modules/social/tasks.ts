/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TaskConfig } from 'payload'
import { fixtureAdapter, normalizeProviderError, type SocialVariant } from './contracts'

type Input = { queueItemId: string; workerId: string }
export const socialPublishTask = {
  slug: 'social-publish',
  label: 'Social publication',
  inputSchema: [
    { name: 'queueItemId', type: 'text', required: true },
    { name: 'workerId', type: 'text', required: true },
  ],
  outputSchema: [],
  retries: { attempts: 2, backoff: { delay: 500, type: 'exponential' } },
  concurrency: ({ input }: { input: Input }) => `social.publish:${String(input.queueItemId)}`,
  handler: async ({ input, req }: { input: Input; req: any }) => {
    const queue = (await req.payload.findByID({
      collection: 'social-queue-items' as never,
      id: input.queueItemId,
      depth: 2,
      overrideAccess: true,
    } as never)) as any
    if (['cancelled', 'published'].includes(queue.status)) return { output: {} }
    const now = new Date().toISOString()
    await req.payload.update({
      collection: 'social-queue-items' as never,
      id: queue.id,
      data: {
        status: 'publishing',
        leaseOwner: input.workerId,
        leaseUntil: new Date(Date.now() + 60000).toISOString(),
        attemptCount: Number(queue.attemptCount ?? 0) + 1,
      } as never,
      overrideAccess: true,
    } as never)
    const variant = queue.variant as any
    const adapter =
      variant.network === 'bluesky' || variant.network === 'activitypub'
        ? fixtureAdapter(variant.network)
        : null
    const result = adapter
      ? await adapter.publish(variant as SocialVariant)
      : {
          status: 'failed' as const,
          error: normalizeProviderError({
            kind: 'unsupported',
            message: 'This account is configured for manual handoff, not automatic publishing.',
          }),
        }
    await req.payload.create({
      collection: 'social-publish-attempts' as never,
      data: {
        queueItem: queue.id,
        variant: variant.id,
        idempotencyKey: queue.idempotencyKey,
        attemptNumber: Number(queue.attemptCount ?? 0) + 1,
        status: result.status === 'published' ? 'published' : result.status,
        response: result.status === 'published' ? result : null,
        error: result.status === 'published' ? null : result.error,
        startedAt: now,
        finishedAt: new Date().toISOString(),
      } as never,
      overrideAccess: true,
    } as never)
    if (result.status === 'published') {
      await req.payload.create({
        collection: 'external-posts' as never,
        data: {
          variant: variant.id,
          account: queue.account.id ?? queue.account,
          remoteId: result.remoteId,
          remoteUrl: result.remoteUrl,
          publishedAt: now,
        } as never,
        overrideAccess: true,
      } as never)
      await req.payload.update({
        collection: 'social-network-variants' as never,
        id: variant.id,
        data: { status: 'published' } as never,
        overrideAccess: true,
      } as never)
      await req.payload.update({
        collection: 'social-queue-items' as never,
        id: queue.id,
        data: { status: 'published', leaseUntil: null } as never,
        overrideAccess: true,
      } as never)
      return { output: {} }
    }
    await req.payload.update({
      collection: 'social-queue-items' as never,
      id: queue.id,
      data: { status: 'failed', leaseUntil: null, deadLetterReason: result.error } as never,
      overrideAccess: true,
    } as never)
    await req.payload.update({
      collection: 'social-network-variants' as never,
      id: variant.id,
      data: { status: 'failed' } as never,
      overrideAccess: true,
    } as never)
    return { output: {} }
  },
} as unknown as TaskConfig
export const socialTasks = [socialPublishTask]
