/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TaskConfig } from 'payload'
import {
  normalizeProviderError,
  retryDelayMs,
  shouldRetryProviderError,
  validateForProvider,
  type SocialVariant,
} from './contracts'
import { credentialsForSocialAccount, socialProviderFor } from './provider-runtime'

const MAX_PROVIDER_ATTEMPTS = 3
const id = (value: unknown) =>
  typeof value === 'object' && value && 'id' in value
    ? String((value as { id: unknown }).id)
    : String(value)

export const socialPublishTask = {
  slug: 'social-publish',
  label: 'Social publication',
  inputSchema: [
    { name: 'queueItemId', type: 'text', required: true },
    { name: 'workerId', type: 'text', required: true },
  ],
  outputSchema: [],
  retries: {
    attempts: MAX_PROVIDER_ATTEMPTS - 1,
    backoff: { delay: 1000, type: 'exponential' },
  },
  concurrency: ({ input }: { input: { queueItemId: string } }) =>
    'social.publish:' + String(input.queueItemId),
  handler: async ({
    input,
    req,
  }: {
    input: { queueItemId: string; workerId: string }
    req: any
  }) => {
    const queue = (await req.payload.findByID({
      collection: 'social-queue-items' as never,
      id: input.queueItemId,
      depth: 2,
      overrideAccess: true,
    } as never)) as any
    if (['cancelled', 'published', 'failed'].includes(queue.status)) return { output: {} }
    const variant = queue.variant as any,
      account = queue.account as any,
      now = new Date().toISOString(),
      attempt = Number(queue.attemptCount ?? 0) + 1
    const existing = (await req.payload.find({
      collection: 'external-posts' as never,
      where: { variant: { equals: id(variant.id) } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    if (existing.docs.length) {
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
      data: {
        status: 'publishing',
        leaseOwner: input.workerId,
        leaseUntil: new Date(Date.now() + 60000).toISOString(),
        attemptCount: attempt,
      } as never,
      overrideAccess: true,
    } as never)
    const provider = socialProviderFor(variant.network)
    const issues = validateForProvider(variant as SocialVariant, provider.capabilities)
    const result = issues.length
      ? {
          status: 'failed' as const,
          error: normalizeProviderError({ kind: 'validation', message: issues.join(' ') }),
        }
      : !provider.publish
        ? {
            status: 'failed' as const,
            error: normalizeProviderError({
              kind: 'unsupported',
              message:
                provider.mode === 'manual-handoff'
                  ? 'This provider is manual handoff only; no automated post was sent.'
                  : 'This provider is not available in Renegade yet.',
            }),
          }
        : await provider.publish(variant as SocialVariant, {
            accountId: id(account),
            credentials: credentialsForSocialAccount(account.connectionReference),
          })
    await req.payload.create({
      collection: 'social-publish-attempts' as never,
      data: {
        queueItem: queue.id,
        variant: variant.id,
        idempotencyKey: queue.idempotencyKey,
        attemptNumber: attempt,
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
          account: id(account),
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
        data: { status: 'published', leaseUntil: null, nextAttemptAt: null } as never,
        overrideAccess: true,
      } as never)
      return { output: {} }
    }
    const retry =
      result.status === 'failed' &&
      shouldRetryProviderError(result.error) &&
      attempt < MAX_PROVIDER_ATTEMPTS
    const nextAttemptAt = retry
      ? new Date(Date.now() + retryDelayMs(result.error, attempt)).toISOString()
      : null
    await req.payload.update({
      collection: 'social-queue-items' as never,
      id: queue.id,
      data: {
        status: retry ? 'scheduled' : 'failed',
        leaseUntil: null,
        nextAttemptAt,
        deadLetterReason: retry ? null : result.error,
      } as never,
      overrideAccess: true,
    } as never)
    if (!retry)
      await req.payload.update({
        collection: 'social-network-variants' as never,
        id: variant.id,
        data: { status: 'failed' } as never,
        overrideAccess: true,
      } as never)
    if (retry)
      throw new Error('Retryable social provider failure; next attempt at ' + nextAttemptAt)
    return { output: {} }
  },
} as unknown as TaskConfig

export const socialTasks = [socialPublishTask]
