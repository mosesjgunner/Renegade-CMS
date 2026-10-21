/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Payload, TaskConfig } from 'payload'
import { withExecutionLock } from '../operations/execution-lock'
import {
  campaignState,
  normalizeProviderError,
  retryDelayMs,
  shouldRetryProviderError,
  validateForProvider,
  type SocialState,
  type SocialVariant,
} from './contracts'
import { credentialsForSocialAccount, socialProviderFor } from './provider-runtime'
import { assertMediaIdsPublishable } from '../media/workflow'

export const MAX_PROVIDER_ATTEMPTS = 3
const id = (value: unknown) => {
  if (!value) return ''
  if (typeof value === 'object' && 'id' in value) {
    return String((value as { id: unknown }).id)
  }
  return String(value)
}

async function updateParentDraftStatus(payload: Payload, variant: any) {
  const draftId = id(variant.draft)
  if (!draftId || draftId === 'null' || draftId === 'undefined') return
  const allVariants = (await payload.find({
    collection: 'social-network-variants' as never,
    where: { draft: { equals: draftId } },
    depth: 0,
    overrideAccess: true,
  })) as any
  const states: SocialState[] = allVariants.docs.map((v: any) => v.status)
  const nextDraftState = campaignState(states)
  await payload.update({
    collection: 'social-drafts' as never,
    id: draftId,
    data: { status: nextDraftState } as never,
    overrideAccess: true,
  }).catch(() => undefined)
}

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
    req: { payload: Payload }
  }) => executeSocialQueueItem(req.payload, input),
} as unknown as TaskConfig

export async function executeSocialQueueItem(
  payload: Payload,
  input: { queueItemId: string; workerId: string },
) {
  return withExecutionLock(payload, `social:${input.queueItemId}`, async () => {
    const queue = (await payload.findByID({
      collection: 'social-queue-items' as never,
      id: input.queueItemId,
      depth: 2,
      overrideAccess: true,
    } as never)) as any

    if (!queue) return { output: { skipped: true, reason: 'not-found' } }
    if (['cancelled', 'published'].includes(queue.status)) {
      return { output: { skipped: true, status: queue.status } }
    }

    const variant = queue.variant as any,
      account = queue.account as any,
      now = new Date().toISOString(),
      currentAttempts = Number(queue.attemptCount ?? 0)

    // Bounded retry check: do not exceed MAX_PROVIDER_ATTEMPTS
    if (queue.status === 'failed' && currentAttempts >= MAX_PROVIDER_ATTEMPTS) {
      return { output: { bounded: true, status: 'failed', attemptCount: currentAttempts } }
    }

    // Check if another worker holds an unexpired lease
    if (
      queue.status === 'publishing' &&
      queue.leaseUntil &&
      Date.parse(queue.leaseUntil) > Date.now() &&
      queue.leaseOwner &&
      queue.leaseOwner !== input.workerId
    ) {
      return { output: { locked: true, leaseOwner: queue.leaseOwner } }
    }

    const attempt = currentAttempts + 1

    // Idempotent recovery check: was external-posts already created for this variant?
    const existing = (await payload.find({
      collection: 'external-posts' as never,
      where: { variant: { equals: id(variant.id) } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    if (existing.docs.length) {
      await payload.update({
        collection: 'social-queue-items' as never,
        id: queue.id,
        data: { status: 'published', leaseUntil: null, nextAttemptAt: null } as never,
        overrideAccess: true,
      } as never)
      await payload.update({
        collection: 'social-network-variants' as never,
        id: variant.id,
        data: { status: 'published' } as never,
        overrideAccess: true,
      } as never)
      await updateParentDraftStatus(payload, variant)
      return { output: { status: 'published', reconciled: true } }
    }

    // Acquire lease and mark publishing
    await payload.update({
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

    // Safe Disconnect Check: If account is revoked/disconnected, record reconnect-required terminal failure
    const isDisconnected =
      account.credentialHealth === 'revoked' ||
      !account.connectionReference ||
      account.capabilityState === 'unavailable'

    if (isDisconnected) {
      const disconnectError = normalizeProviderError({
        kind: 'reconnect-required',
        message: 'Account is disconnected or credentials revoked; reconnect account before publishing.',
      })
      await payload.create({
        collection: 'social-publish-attempts' as never,
        data: {
          queueItem: queue.id,
          variant: variant.id,
          idempotencyKey: queue.idempotencyKey,
          attemptNumber: attempt,
          status: 'failed',
          response: null,
          error: disconnectError,
          startedAt: now,
          finishedAt: new Date().toISOString(),
        } as never,
        overrideAccess: true,
      } as never)
      await payload.update({
        collection: 'social-queue-items' as never,
        id: queue.id,
        data: {
          status: 'failed',
          attemptCount: attempt,
          leaseUntil: null,
          nextAttemptAt: null,
          deadLetterReason: disconnectError,
        } as never,
        overrideAccess: true,
      } as never)
      await payload.update({
        collection: 'social-network-variants' as never,
        id: variant.id,
        data: { status: 'failed' } as never,
        overrideAccess: true,
      } as never)
      await updateParentDraftStatus(payload, variant)
      return { output: { status: 'failed', error: disconnectError } }
    }

    const provider = socialProviderFor(variant.network)
    const credentials = credentialsForSocialAccount(account.connectionReference)

    let rightsIssue: string | undefined
    try {
      const attachmentIds = Array.isArray(variant.attachments) ? variant.attachments.map(id) : []
      await assertMediaIdsPublishable(payload, attachmentIds)
    } catch (error) {
      rightsIssue = error instanceof Error ? error.message : 'Attached media cannot publish.'
    }

    const issues = [
      ...validateForProvider(variant as SocialVariant, provider.capabilities),
      ...(rightsIssue ? [rightsIssue] : []),
    ]

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
        : await provider.publish(
            {
              ...(variant as SocialVariant),
              idempotencyKey: queue.idempotencyKey || variant.idempotencyKey,
            },
            {
              accountId: id(account),
              accountHandle: account.displayName || `@${variant.network}-user`,
              network: variant.network,
              credentials: credentials || {},
            },
          )

    const providerMode =
      account.diagnostics?.mode ||
      (result as any).receipt?.providerMode ||
      (credentials?.service?.includes('127.0.0.1') || credentials?.service?.includes('localhost')
        ? 'local-harness'
        : provider.mode) ||
      'local-harness'

    const attemptResponse =
      result.status === 'published'
        ? {
            status: 'published',
            remoteId: result.remoteId,
            remoteUrl: result.remoteUrl,
            providerMode,
            receipt: {
              remotePostId: result.remoteId,
              remoteUrl: result.remoteUrl,
              publishedAt: now,
              providerMode,
              rawResponse:
                (result as any).receipt?.rawResponse || (result as any).rawResponse || result,
            },
          }
        : null

    await payload.create({
      collection: 'social-publish-attempts' as never,
      data: {
        queueItem: queue.id,
        variant: variant.id,
        idempotencyKey: queue.idempotencyKey,
        attemptNumber: attempt,
        status: result.status === 'published' ? 'published' : 'failed',
        response: attemptResponse,
        error: result.status === 'published' ? null : result.error,
        startedAt: now,
        finishedAt: new Date().toISOString(),
      } as never,
      overrideAccess: true,
    } as never)

    if (result.status === 'published') {
      await payload.create({
        collection: 'external-posts' as never,
        data: {
          variant: variant.id,
          account: id(account),
          remoteId: result.remoteId,
          remoteUrl: result.remoteUrl,
          publishedAt: now,
          remoteState: 'published',
        } as never,
        overrideAccess: true,
      } as never)
      await payload.update({
        collection: 'social-network-variants' as never,
        id: variant.id,
        data: { status: 'published' } as never,
        overrideAccess: true,
      } as never)
      await payload.update({
        collection: 'social-queue-items' as never,
        id: queue.id,
        data: {
          status: 'published',
          attemptCount: attempt,
          leaseUntil: null,
          nextAttemptAt: null,
        } as never,
        overrideAccess: true,
      } as never)
      await updateParentDraftStatus(payload, variant)
      return { output: { status: 'published', remoteId: result.remoteId, remoteUrl: result.remoteUrl } }
    }

    const retry =
      result.status === 'failed' &&
      shouldRetryProviderError(result.error) &&
      attempt < MAX_PROVIDER_ATTEMPTS

    const nextAttemptAt = retry
      ? new Date(Date.now() + retryDelayMs(result.error, attempt)).toISOString()
      : null

    await payload.update({
      collection: 'social-queue-items' as never,
      id: queue.id,
      data: {
        status: 'failed',
        attemptCount: attempt,
        leaseUntil: null,
        nextAttemptAt,
        deadLetterReason: result.error,
      } as never,
      overrideAccess: true,
    } as never)

    await payload.update({
      collection: 'social-network-variants' as never,
      id: variant.id,
      data: { status: 'failed' } as never,
      overrideAccess: true,
    } as never)

    await updateParentDraftStatus(payload, variant)

    return {
      output: {
        status: 'failed',
        error: result.error,
        attemptCount: attempt,
        nextAttemptAt,
      },
    }
  })
}

export const socialTasks = [socialPublishTask]
