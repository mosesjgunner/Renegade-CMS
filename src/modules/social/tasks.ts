/* eslint-disable @typescript-eslint/no-explicit-any -- Payload relationship normalization at the worker boundary */
import { createLocalReq, type Payload, type TaskConfig } from 'payload'
import { withExecutionLock } from '../operations/execution-lock'
import { transactionPayload } from '../core/transaction-payload'
import { loadConfig } from '../core/config'
import { mediaStorage } from '../media/storage'
import { assertMediaIdsPublishable } from '../media/workflow'
import {
  campaignState,
  normalizeProviderError,
  retryDelayMs,
  shouldRetryProviderError,
  socialHash,
  validateForProvider,
  type AdapterResult,
  type MediaResolver,
  type SocialVariant,
} from './contracts'
import { credentialsForSocialAccount, socialProviderFor } from './provider-runtime'

export const MAX_PROVIDER_ATTEMPTS = 3
export const socialRecordId = (value: any): string => String(value?.id ?? value ?? '')
const id = socialRecordId
export type SocialDispatchInput = {
  queueItemId: string
  workerId: string
  mode?: 'dispatch' | 'retry' | 'reconcile'
}

async function atomic<T>(payload: Payload, operation: (tx: Payload) => Promise<T>): Promise<T> {
  if (!payload.db?.beginTransaction) return operation(payload) // in-memory contract doubles only
  const transactionID = await payload.db.beginTransaction()
  if (!transactionID) throw new Error('Social result persistence requires transactional storage.')
  const req = await createLocalReq({}, payload)
  req.transactionID = transactionID
  try {
    const result = await operation(transactionPayload(payload, req))
    await payload.db.commitTransaction(transactionID)
    return result
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    throw error
  }
}

async function updateParent(payload: Payload, variant: any) {
  const variants: any = await payload.find({
    collection: 'social-network-variants',
    where: { draft: { equals: id(variant.draft) } },
    pagination: false,
    limit: 0,
    depth: 0,
    overrideAccess: true,
  })
  await payload.update({
    collection: 'social-drafts',
    id: id(variant.draft),
    data: { status: campaignState(variants.docs.map((row: any) => row.status)) },
    overrideAccess: true,
  })
}

export function canRetrySocialQueueItem(queue: any, now = Date.now()): boolean {
  return (
    queue.status === 'failed' &&
    Number(queue.attemptCount ?? 0) < MAX_PROVIDER_ATTEMPTS &&
    queue.deadLetterReason?.remoteOutcome !== 'unknown' &&
    shouldRetryProviderError(queue.deadLetterReason ?? { kind: 'validation' }) &&
    (!queue.nextAttemptAt || Date.parse(queue.nextAttemptAt) <= now)
  )
}

export async function executeSocialQueueItem(payload: Payload, input: SocialDispatchInput) {
  const initial: any = await payload.findByID({
    collection: 'social-queue-items',
    id: input.queueItemId,
    depth: 0,
    overrideAccess: true,
  })
  return withExecutionLock(payload, `social-variant:${id(initial.variant)}`, async () => {
    const queue: any = await payload.findByID({
      collection: 'social-queue-items',
      id: input.queueItemId,
      depth: 0,
      overrideAccess: true,
    })
    const mode = input.mode ?? 'dispatch'
    if (['cancelled', 'published'].includes(queue.status))
      return { output: { skipped: true, status: queue.status } }
    if (
      queue.status === 'publishing' &&
      queue.leaseUntil &&
      Date.parse(queue.leaseUntil) > Date.now()
    )
      return { output: { skipped: true, locked: true, status: 'publishing' } }
    const recovery = queue.status === 'unknown' || queue.status === 'publishing'
    if (queue.status === 'unknown' && mode !== 'reconcile')
      return {
        output: {
          skipped: true,
          status: 'unknown',
          reason: 'Reconcile uncertain delivery before any retry.',
        },
      }
    if (!recovery) {
      if (!['scheduled', 'failed'].includes(queue.status))
        return { output: { skipped: true, status: queue.status } }
      if (
        Date.parse(queue.scheduledFor) > Date.now() ||
        (queue.nextAttemptAt && Date.parse(queue.nextAttemptAt) > Date.now())
      )
        return { output: { skipped: true, reason: 'not-due', status: queue.status } }
      if (queue.status === 'failed' && (mode !== 'retry' || !canRetrySocialQueueItem(queue)))
        return { output: { skipped: true, reason: 'not-retryable', status: queue.status } }
      if (Number(queue.attemptCount ?? 0) >= MAX_PROVIDER_ATTEMPTS)
        return { output: { skipped: true, bounded: true, status: queue.status } }
    }
    const variant: any = await payload.findByID({
      collection: 'social-network-variants',
      id: id(queue.variant),
      depth: 0,
      overrideAccess: true,
    })
    const account: any = await payload.findByID({
      collection: 'social-accounts',
      id: id(queue.account),
      depth: 0,
      overrideAccess: true,
    })
    const draft: any = await payload.findByID({
      collection: 'social-drafts',
      id: id(variant.draft),
      depth: 0,
      overrideAccess: true,
    })
    const attachments = (variant.attachments ?? []).map((value: any) => ({
      mediaAssetId: id(value),
      role: 'image' as const,
    }))
    const approved: SocialVariant = {
      ...variant,
      accountId: id(account),
      attachments,
      idempotencyKey: queue.idempotencyKey,
    }
    const hash = socialHash({
      network: variant.network,
      text: variant.text,
      linkUrl: variant.linkUrl,
      attachments,
    })
    const invalid =
      id(variant.account) !== id(account) ||
      id(draft.site) !== id(account.site) ||
      !variant.approvalHash ||
      hash !== variant.approvalHash ||
      !queue.idempotencyKey.endsWith(variant.approvalHash) ||
      ['cancelled', 'draft', 'review'].includes(draft.status)
    // Read-only recovery never sends content even if a legacy row is inconsistent.
    if (invalid)
      throw new Error(
        'Queue account, site or approved content no longer matches its authorization. No provider request was made.',
      )
    const provider = socialProviderFor(variant.network)
    const credentials = credentialsForSocialAccount(account.connectionReference)
    const canConnect =
      ['healthy', 'expiring'].includes(account.credentialHealth) &&
      account.connectionReference &&
      (!account.credentialExpiresAt || Date.parse(account.credentialExpiresAt) > Date.now())
    const context = {
      accountId: id(account),
      accountHandle: account.displayName,
      network: variant.network,
      credentials: credentials ?? {},
    }
    const attempt = recovery
      ? Math.max(1, Number(queue.attemptCount ?? 0))
      : Number(queue.attemptCount ?? 0) + 1
    const startedAt = new Date().toISOString()
    let audit: any
    if (recovery) {
      const attempts: any = await payload.find({
        collection: 'social-publish-attempts',
        where: {
          and: [{ queueItem: { equals: queue.id } }, { attemptNumber: { equals: attempt } }],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      audit = attempts.docs[0]
      await atomic(payload, async (tx) => {
        await tx.update({
          collection: 'social-queue-items',
          id: queue.id,
          data: {
            status: 'unknown',
            leaseOwner: null,
            leaseUntil: null,
            nextAttemptAt: null,
            deadLetterReason: normalizeProviderError({
              kind: 'remote-unknown',
              remoteOutcome: 'unknown',
              message: 'Interrupted publication requires read-only provider reconciliation.',
            }),
          },
          overrideAccess: true,
        })
        await tx.update({
          collection: 'social-network-variants',
          id: variant.id,
          data: { status: 'unknown' },
          overrideAccess: true,
        })
        if (!audit)
          audit = await tx.create({
            collection: 'social-publish-attempts',
            data: {
              queueItem: queue.id,
              variant: variant.id,
              idempotencyKey: queue.idempotencyKey,
              attemptNumber: attempt,
              status: 'unknown',
              startedAt,
            },
            overrideAccess: true,
          })
        await updateParent(tx, variant)
      })
    } else {
      await atomic(payload, async (tx) => {
        await tx.update({
          collection: 'social-queue-items',
          id: queue.id,
          data: {
            status: 'publishing',
            attemptCount: attempt,
            leaseOwner: input.workerId,
            leaseUntil: new Date(Date.now() + 60000).toISOString(),
            nextAttemptAt: null,
          },
          overrideAccess: true,
        })
        await tx.update({
          collection: 'social-network-variants',
          id: variant.id,
          data: { status: 'publishing' },
          overrideAccess: true,
        })
        audit = await tx.create({
          collection: 'social-publish-attempts',
          data: {
            queueItem: queue.id,
            variant: variant.id,
            idempotencyKey: queue.idempotencyKey,
            attemptNumber: attempt,
            status: 'started',
            request: {
              network: variant.network,
              text: variant.text,
              attachments,
              approvalHash: hash,
            },
            startedAt,
          },
          overrideAccess: true,
        })
        await updateParent(tx, variant)
      })
    }
    let result: AdapterResult
    if (recovery && !canConnect) {
      result = {
        status: 'unknown',
        error: normalizeProviderError({
          kind: 'remote-unknown',
          remoteOutcome: 'unknown',
          message:
            'Reconnect the account before read-only reconciliation. No provider request was made.',
        }),
      }
    } else if (recovery) {
      result = provider.reconcile
        ? await provider.reconcile(approved, context)
        : {
            status: 'unknown',
            error: normalizeProviderError({
              kind: 'remote-unknown',
              remoteOutcome: 'unknown',
              message:
                'This adapter cannot verify an uncertain post automatically. Inspect the provider; automatic resend is disabled.',
            }),
          }
    } else if (!canConnect || account.capabilityState === 'unavailable') {
      result = {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'reconnect-required',
          message:
            'Account is disconnected or credentials are not healthy; reconnect before publishing.',
        }),
      }
    } else {
      const resolver: MediaResolver = {
        resolveUrl: async (assetId) => `/media/${assetId}`,
        resolveBuffer: async (assetId) => {
          const asset = await payload.findByID({
            collection: 'media-assets',
            id: assetId,
            depth: 0,
            overrideAccess: true,
          })
          if (id(asset.site) !== id(account.site)) throw new Error('Media belongs to another site.')
          const bytes = await mediaStorage(loadConfig()).get(String(asset.storageLocation))
          if (!bytes) throw new Error('Original media bytes are missing.')
          return {
            buffer: Buffer.from(bytes),
            mimeType: String(asset.mimeType),
            fileName: asset.originalFilename || 'attachment',
          }
        },
      }
      const issues = validateForProvider(approved, provider.capabilities)
      try {
        await assertMediaIdsPublishable(
          payload,
          attachments.map((row: any) => row.mediaAssetId),
        )
      } catch (error) {
        issues.push(error instanceof Error ? error.message : 'Attached media cannot publish.')
      }
      try {
        result = issues.length
          ? {
              status: 'failed',
              error: normalizeProviderError({ kind: 'validation', message: issues.join(' ') }),
            }
          : provider.publish
            ? await provider.publish(approved, context, resolver)
            : {
                status: 'failed',
                error: normalizeProviderError({
                  kind: 'unsupported',
                  message: 'This destination requires manual handoff; no automated post was sent.',
                }),
              }
      } catch (error) {
        // A thrown adapter exception may follow provider acceptance. Never invent a known failure.
        result = {
          status: 'unknown',
          error: normalizeProviderError({
            kind: 'remote-unknown',
            remoteOutcome: 'unknown',
            message: error instanceof Error ? error.message : String(error),
          }),
        }
      }
    }
    const nextAttemptAt =
      result.status === 'failed' &&
      shouldRetryProviderError(result.error) &&
      attempt < MAX_PROVIDER_ATTEMPTS
        ? new Date(Date.now() + retryDelayMs(result.error, attempt)).toISOString()
        : null
    await atomic(payload, async (tx) => {
      await tx.update({
        collection: 'social-publish-attempts',
        id: audit.id,
        data: {
          status: result.status,
          finishedAt: new Date().toISOString(),
          response:
            result.status === 'published'
              ? {
                  remoteId: result.remoteId,
                  remoteUrl: result.remoteUrl,
                  providerMode: result.receipt?.rawResponse?.providerMode ?? provider.mode,
                  receipt: result.receipt,
                }
              : null,
          error: result.status === 'published' ? null : result.error,
        },
        overrideAccess: true,
      })
      if (result.status === 'published') {
        const existing = await tx.find({
          collection: 'external-posts',
          where: {
            and: [{ account: { equals: account.id } }, { remoteId: { equals: result.remoteId } }],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        if (!existing.docs.length)
          await tx.create({
            collection: 'external-posts',
            data: {
              variant: variant.id,
              account: account.id,
              remoteId: result.remoteId,
              remoteUrl: result.remoteUrl,
              publishedAt: new Date().toISOString(),
              remoteState: 'published',
            },
            overrideAccess: true,
          })
      }
      await tx.update({
        collection: 'social-queue-items',
        id: queue.id,
        data: {
          status: result.status,
          attemptCount: attempt,
          leaseOwner: null,
          leaseUntil: null,
          nextAttemptAt,
          deadLetterReason: result.status === 'published' ? null : result.error,
        },
        overrideAccess: true,
      })
      await tx.update({
        collection: 'social-network-variants',
        id: variant.id,
        data: { status: result.status },
        overrideAccess: true,
      })
      await updateParent(tx, variant)
      if (nextAttemptAt)
        await tx.jobs.queue({
          task: 'social-publish',
          queue: 'operations',
          input: { queueItemId: String(queue.id), workerId: 'social-retry', mode: 'retry' },
          waitUntil: new Date(nextAttemptAt),
        })
    })
    return {
      output: {
        status: result.status,
        attemptCount: attempt,
        nextAttemptAt,
        ...(result.status === 'published'
          ? { remoteId: result.remoteId }
          : { error: result.error }),
      },
    }
  })
}

export const socialPublishTask = {
  slug: 'social-publish',
  label: 'Social publication',
  inputSchema: [
    { name: 'queueItemId', type: 'text', required: true },
    { name: 'workerId', type: 'text', required: true },
    {
      name: 'mode',
      type: 'select',
      options: ['dispatch', 'retry', 'reconcile'],
      defaultValue: 'dispatch',
    },
  ],
  outputSchema: [],
  retries: 0,
  concurrency: ({ input }: { input: SocialDispatchInput }) => 'social.publish:' + input.queueItemId,
  handler: async ({ input, req }: { input: SocialDispatchInput; req: { payload: Payload } }) =>
    executeSocialQueueItem(req.payload, input),
} as unknown as TaskConfig
export const socialTasks = [socialPublishTask]

/** Durable outbox sweep also recovers work whose job process died mid-delivery. */
export async function recoverSocialOutbox(payload: Payload) {
  const now = new Date().toISOString()
  const queues = await payload.find({
    collection: 'social-queue-items',
    depth: 0,
    limit: 20,
    overrideAccess: true,
    where: {
      or: [
        { and: [{ status: { equals: 'scheduled' } }, { scheduledFor: { less_than_equal: now } }] },
        { and: [{ status: { equals: 'failed' } }, { nextAttemptAt: { less_than_equal: now } }] },
        { and: [{ status: { equals: 'publishing' } }, { leaseUntil: { less_than_equal: now } }] },
      ],
    },
  })
  const results = []
  for (const queue of queues.docs)
    results.push(
      await executeSocialQueueItem(payload, {
        queueItemId: String(queue.id),
        workerId: 'social-outbox-recovery',
        mode: queue.status === 'failed' ? 'retry' : 'dispatch',
      }),
    )
  return results
}
