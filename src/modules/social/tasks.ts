import { videoAssetBody } from '../creator-studio/video-export'
import { youtubeApprovedSettings } from './adapters/youtube'
/* eslint-disable @typescript-eslint/no-explicit-any -- Payload relationship normalization at the worker boundary */
import { createLocalReq, type Payload, type TaskConfig } from 'payload'
import { withExecutionLock } from '../operations/execution-lock'
import { transactionPayload } from '../core/transaction-payload'
import { loadConfig } from '../core/config'
import { mediaStorage } from '../media/storage'
import { assertMediaIdsPublishable } from '../media/workflow'
import {
  assertSocialTransition,
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
  /**
   * True only for an operator's explicit per-item retry request (the admin
   * worker route with a queueItemId). Widens the retry gate past the
   * error-kind check — see canOperatorRetrySocialQueueItem — while the
   * automatic sweep keeps the strict gate.
   */
  operatorRequested?: boolean
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

/**
 * The operator's explicit retry gate (RC2-H-05). The automatic gate above
 * only retries error kinds that are safe to repeat blindly (transient,
 * rate-limit). That strands a real failure class forever: a provider
 * refusal classified 'validation' — e.g. a destination that was disabled
 * and later repaired — can never be recovered, even by the operator's
 * retry action, despite the provider's own "repair then retry" contract.
 * An explicit per-item operator request therefore skips only the
 * error-kind check. The duplicate-safety guards still bind: an item whose
 * remote outcome is unknown must be reconciled, never blind-retried, and
 * the provider attempt bound still applies.
 */
export function canOperatorRetrySocialQueueItem(queue: any, now = Date.now()): boolean {
  return (
    queue.status === 'failed' &&
    Number(queue.attemptCount ?? 0) < MAX_PROVIDER_ATTEMPTS &&
    queue.deadLetterReason?.remoteOutcome !== 'unknown' &&
    (!queue.nextAttemptAt || Date.parse(queue.nextAttemptAt) <= now)
  )
}

/**
 * RC2-DEBT-25: a bounded-out failed item (attempt bound spent) can still
 * diverge from provider truth — the measured case is a lose-response
 * provider that committed the post on the final attempt while the item
 * recorded a known failure. Retry is exhausted and must stay exhausted
 * (no blind resend), but a read-only reconcile lookup by the item's
 * deterministic key can settle the record from provider truth without
 * spending an attempt. Only the reconcile mode may take this path.
 */
export function canReconcileBoundedFailure(queue: any): boolean {
  return queue.status === 'failed' && Number(queue.attemptCount ?? 0) >= MAX_PROVIDER_ATTEMPTS
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
    const recovery =
      queue.status === 'unknown' ||
      queue.status === 'publishing' ||
      (mode === 'reconcile' && canReconcileBoundedFailure(queue))
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
      if (
        queue.status === 'failed' &&
        (mode !== 'retry' ||
          (!canRetrySocialQueueItem(queue) &&
            !(input.operatorRequested && canOperatorRetrySocialQueueItem(queue))))
      )
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
    const youtubeSettings = youtubeApprovedSettings(variant.network, variant.youtubeUpload)
    const approved: SocialVariant = {
      ...variant,
      accountId: id(account),
      attachments:
        variant.network === 'youtube'
          ? attachments.map(({ mediaAssetId }: { mediaAssetId: string }) => ({
              mediaAssetId,
              role: 'video' as const,
            }))
          : attachments,
      ...youtubeSettings,
      idempotencyKey: queue.idempotencyKey,
    }
    const hash = socialHash({
      network: variant.network,
      text: variant.text,
      linkUrl: variant.linkUrl,
      attachments,
      ...youtubeSettings,
    })
    // A queue item is bound to its approved content in one of two ways:
    // the standalone scheduling path embeds the approval hash as the key
    // suffix, while the release saga keys its outbox rows
    // `release:<releaseId>:<artifactId>:<variantId>` — bound to this
    // variant instead. Both are checked against the live records here;
    // the content-hash comparison above still applies to either path.
    const releaseKeyBound =
      queue.idempotencyKey.startsWith('release:') &&
      queue.idempotencyKey.split(':').pop() === id(variant)
    const invalid =
      id(variant.account) !== id(account) ||
      (variant.network === 'youtube' && account.network !== 'youtube') ||
      id(draft.site) !== id(account.site) ||
      !variant.approvalHash ||
      hash !== variant.approvalHash ||
      (!queue.idempotencyKey.endsWith(variant.approvalHash) && !releaseKeyBound) ||
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
      externalAccountId: account.externalAccountId,
      network: variant.network,
      credentials: credentials ?? {},
    }
    // RC3-16: a manual-handoff destination is never "attempted" against a
    // provider. Park the item in its own actionable state carrying the
    // approved copy, link and attachments, so an operator can post it by
    // hand and record completion via completeManualHandoff. No provider
    // request is made and no publish attempt is recorded.
    if (
      !recovery &&
      (provider.mode === 'manual-handoff' ||
        (variant.network === 'youtube' && !youtubeSettings.platformSettings))
    ) {
      const handoff = {
        network: variant.network,
        accountId: id(account),
        accountHandle: account.displayName,
        text: variant.text,
        linkUrl: variant.linkUrl ?? null,
        canonicalUrl: draft.canonicalUrl ?? null,
        attachments: attachments.map((row: any) => row.mediaAssetId),
        queuedAt: new Date().toISOString(),
      }
      await atomic(payload, async (tx) => {
        await tx.update({
          collection: 'social-queue-items',
          id: queue.id,
          data: {
            status: 'manual-handoff',
            leaseOwner: null,
            leaseUntil: null,
            nextAttemptAt: null,
            deadLetterReason: null,
            handoff,
          },
          overrideAccess: true,
        })
        await tx.update({
          collection: 'social-network-variants',
          id: variant.id,
          data: { status: 'manual-handoff' },
          overrideAccess: true,
        })
        await updateParent(tx, variant)
      })
      return { output: { status: 'manual-handoff', handoff } }
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
        resolveVideo: async (assetId) => {
          const asset = await payload.findByID({
            collection: 'media-assets',
            id: assetId,
            depth: 0,
            overrideAccess: true,
          })
          if (id(asset.site) !== id(account.site)) throw new Error('Media belongs to another site.')
          return videoAssetBody(asset)
        },
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
      // RC3-16 evergreen: a published recurring slot spawns its next
      // occurrence in the same transaction. The next slot is anchored to
      // this slot's scheduled time (cadence does not drift with publish
      // latency), carries the same approval (identical content hash), and
      // is keyed deterministically — the unique idempotency key makes a
      // duplicate spawn impossible even if completion is replayed.
      if (
        result.status === 'published' &&
        Number(queue.recurrenceIntervalDays ?? 0) > 0 &&
        queue.recurrenceSeriesKey
      ) {
        const occurrence = Number(queue.recurrenceOccurrence ?? 1) + 1
        const nextKey = `evergreen:${queue.recurrenceSeriesKey}:${occurrence}:${variant.approvalHash}`
        const existingNext = await tx.find({
          collection: 'social-queue-items',
          where: { idempotencyKey: { equals: nextKey } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        if (!existingNext.docs.length) {
          const nextVariant = await tx.create({
            collection: 'social-network-variants',
            data: {
              draft: id(variant.draft),
              account: id(variant.account),
              label: variant.label,
              network: variant.network,
              text: variant.text,
              linkUrl: variant.linkUrl,
              attachments: (variant.attachments ?? []).map((value: any) => id(value)),
              status: 'scheduled',
              approvalHash: variant.approvalHash,
              approvedAt: variant.approvedAt,
              idempotencyKey: `evergreen-variant:${queue.recurrenceSeriesKey}:${occurrence}`,
            },
            overrideAccess: true,
          })
          const nextScheduledFor = new Date(
            Date.parse(queue.scheduledFor) + Number(queue.recurrenceIntervalDays) * 86_400_000,
          ).toISOString()
          const nextQueue = await tx.create({
            collection: 'social-queue-items',
            data: {
              variant: String(nextVariant.id),
              account: id(queue.account),
              scheduledFor: nextScheduledFor,
              timeZone: queue.timeZone,
              status: 'scheduled',
              idempotencyKey: nextKey,
              recurrenceIntervalDays: queue.recurrenceIntervalDays,
              recurrenceSeriesKey: queue.recurrenceSeriesKey,
              recurrenceOccurrence: occurrence,
            },
            overrideAccess: true,
          })
          await tx.jobs.queue({
            task: 'social-publish',
            queue: 'operations',
            input: {
              queueItemId: String(nextQueue.id),
              workerId: 'social-evergreen',
              mode: 'dispatch',
            },
            waitUntil: new Date(nextScheduledFor),
          })
        }
      }
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

/** RC3-16: pause a queued/scheduled item. Paused items are invisible to
 * the outbox sweep (which only selects scheduled/failed/publishing rows)
 * and executeSocialQueueItem skips them, so a pause holds even if a
 * previously queued dispatch job fires late. */
export async function pauseSocialQueueItem(payload: Payload, queueItemId: string) {
  const queue: any = await payload.findByID({
    collection: 'social-queue-items',
    id: queueItemId,
    depth: 0,
    overrideAccess: true,
  })
  if (!queue) throw new Error('Social queue item not found.')
  assertSocialTransition(queue.status, 'paused')
  await payload.update({
    collection: 'social-queue-items',
    id: queueItemId,
    data: { status: 'paused' },
    overrideAccess: true,
  })
  return { status: 'paused' }
}

/** RC3-16: resume a paused item back to its scheduled slot. */
export async function resumeSocialQueueItem(payload: Payload, queueItemId: string) {
  const queue: any = await payload.findByID({
    collection: 'social-queue-items',
    id: queueItemId,
    depth: 0,
    overrideAccess: true,
  })
  if (!queue) throw new Error('Social queue item not found.')
  assertSocialTransition(queue.status, 'scheduled')
  await payload.update({
    collection: 'social-queue-items',
    id: queueItemId,
    data: { status: 'scheduled' },
    overrideAccess: true,
  })
  return { status: 'scheduled' }
}

/** RC3-16: record an operator's manual posting of a handed-off item.
 * The operator supplies the live post's URL (and provider id when the
 * network exposes one); the completion is recorded as the item's
 * receipt — an external-posts row plus the handoff completion stamp —
 * and the variant/draft states settle exactly like a provider publish. */
export async function completeManualHandoff(
  payload: Payload,
  input: { queueItemId: string; remoteUrl: string; remoteId?: string; note?: string },
) {
  const queue: any = await payload.findByID({
    collection: 'social-queue-items',
    id: input.queueItemId,
    depth: 0,
    overrideAccess: true,
  })
  if (!queue) throw new Error('Social queue item not found.')
  assertSocialTransition(queue.status, 'published')
  if (queue.status !== 'manual-handoff')
    throw new Error('Only a manual-handoff item can be completed by an operator.')
  if (!input.remoteUrl?.trim()) throw new Error('The live post URL is required.')
  const variant: any = await payload.findByID({
    collection: 'social-network-variants',
    id: id(queue.variant),
    depth: 0,
    overrideAccess: true,
  })
  const remoteId = input.remoteId?.trim() || `manual:${queue.id}`
  const completedAt = new Date().toISOString()
  await atomic(payload, async (tx) => {
    const existing = await tx.find({
      collection: 'external-posts',
      where: {
        and: [{ account: { equals: id(queue.account) } }, { remoteId: { equals: remoteId } }],
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
          account: id(queue.account),
          remoteId,
          remoteUrl: input.remoteUrl,
          publishedAt: completedAt,
          remoteState: 'published',
        },
        overrideAccess: true,
      })
    await tx.update({
      collection: 'social-queue-items',
      id: queue.id,
      data: {
        status: 'published',
        handoff: {
          ...(queue.handoff ?? {}),
          completedAt,
          completedBy: 'operator',
          remoteId,
          remoteUrl: input.remoteUrl,
          ...(input.note ? { note: input.note } : {}),
        },
      },
      overrideAccess: true,
    })
    await tx.update({
      collection: 'social-network-variants',
      id: variant.id,
      data: { status: 'published' },
      overrideAccess: true,
    })
    await updateParent(tx, variant)
  })
  return { status: 'published', remoteId, remoteUrl: input.remoteUrl }
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
        // RC2-DEBT-25: bounded-out failures are terminal (no nextAttemptAt),
        // so the retry clause above never sees them. They join the sweep in
        // reconcile mode — settled from provider truth, never re-sent.
        {
          and: [
            { status: { equals: 'failed' } },
            { attemptCount: { greater_than_equal: MAX_PROVIDER_ATTEMPTS } },
          ],
        },
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
        mode:
          queue.status === 'failed'
            ? canReconcileBoundedFailure(queue)
              ? 'reconcile'
              : 'retry'
            : 'dispatch',
      }),
    )
  return results
}
