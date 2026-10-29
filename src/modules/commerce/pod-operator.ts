/* eslint-disable @typescript-eslint/no-explicit-any -- canonical Payload snapshots */
import { withExecutionLock } from '../operations/execution-lock'
import { adapterForPodConnection } from './pod-adapters'
import { assertFulfillmentOrderEligible, fulfillmentId as id } from './fulfillment-mapping'
import { checkAndCompleteOrderFulfillment } from './fulfillment-operator'
import { isPodJobEligibleForSubmission, type PODJob } from './fulfillment-plan'
import { submitPodJobWithRetry, cancelPodJob, releasePodJobHold } from './pod-operations'
import { reconcilePodJobWithProvider } from './pod-reconciliation'
import { PodProviderError } from './pod-contract'
import { loadConfig } from '../core/config'

const jobFrom = (doc: any): PODJob => ({
  ...doc,
  orderId: id(doc.order),
  siteId: id(doc.site),
  connectionId: id(doc.connection),
  auditTrail: doc.auditTrail ?? [],
  attemptCount: doc.attemptCount ?? 0,
  itemsSnapshot: doc.itemsSnapshot ?? [],
})

/** Shared lock + durable uncertainty marker precede external I/O. A crash requires reconciliation. */
export async function executePodOperatorAction(
  payload: any,
  jobId: string,
  action: string,
  actor: string,
  assertSiteAccess: (site: string) => void,
  repairReason?: string,
) {
  const initial = await payload.findByID({
    collection: 'pod-jobs',
    id: jobId,
    depth: 0,
    overrideAccess: true,
  })
  assertSiteAccess(id(initial.site))
  return withExecutionLock(payload, `commerce.fulfillment.order:${id(initial.order)}`, async () => {
    const doc = await payload.findByID({
      collection: 'pod-jobs',
      id: jobId,
      depth: 0,
      overrideAccess: true,
    })
    let job = jobFrom(doc)
    assertSiteAccess(job.siteId)
    const connection = await payload.findByID({
      collection: 'pod-connections',
      id: job.connectionId,
      depth: 0,
      overrideAccess: true,
    })
    const order = await payload.findByID({
      collection: 'orders',
      id: job.orderId,
      depth: 0,
      overrideAccess: true,
    })
    if (
      id(connection.site) !== job.siteId ||
      id(order.site) !== job.siteId ||
      id(connection.merchantConnection) !== id(order.merchantConnection) ||
      connection.providerKey !== job.providerKey
    )
      throw new Error('Forbidden. Provider/site/merchant binding does not match the order.')
    const adapter = adapterForPodConnection(connection, 'orders')
    if (
      adapter.metadata.mode !== 'deterministic-emulator' &&
      job.itemsSnapshot.some(
        (item: any) => item.podMapping?.providerMode === 'deterministic-emulator',
      )
    )
      throw new PodProviderError(
        'configuration',
        'Simulator-sold instructions cannot authorize real provider fulfillment.',
        false,
        true,
      )
    const now = new Date().toISOString()
    let updated: PODJob
    let success = true
    let retryable = false
    if (action === 'submit-pod-job' || action === 'retry-pod-job') {
      if (action === 'retry-pod-job') {
        const failure = [...job.auditTrail]
          .reverse()
          .find((a) => a.action.startsWith('job_submission_'))
        if (
          job.state !== 'failed' ||
          job.externalOrderId ||
          failure?.details?.outcomeKnown !== true ||
          job.attemptCount >= 3 ||
          !repairReason?.trim()
        )
          return {
            success: false,
            error:
              'Only a known rejected request below the retry limit can be retried with an audited repair reason.',
            job: doc,
            retryable: false,
          }
        job = {
          ...job,
          state: 'created',
          auditTrail: [
            ...job.auditTrail,
            {
              timestamp: now,
              action: 'operator_retry_authorized',
              actor,
              previousState: job.state,
              newState: 'created',
              details: { reason: repairReason.trim().slice(0, 500) },
            },
          ],
        }
      }
      await assertFulfillmentOrderEligible(payload, order)
      if (!isPodJobEligibleForSubmission(job))
        return {
          success: false,
          error: 'Job requires reconciliation or hold release before submission.',
          job: doc,
          retryable: false,
        }
      // Configuration/health failures happen before reserving an attempt; no provider order was sent.
      const health = await adapter.health()
      if (!health.ready)
        return {
          success: false,
          error: 'Provider unavailable; repair configuration and check health.',
          job: doc,
          retryable: false,
        }
      const reserved = {
        timestamp: now,
        action: 'provider_request_reserved',
        actor,
        previousState: job.state,
        newState: 'exception' as const,
        details: {
          idempotencyKey: job.idempotencyKey,
          attempt: job.attemptCount + 1,
          evidenceClass: adapter.metadata.mode,
          providerKey: adapter.key,
        },
      }
      await payload.update({
        collection: 'pod-jobs',
        id: jobId,
        depth: 0,
        data: {
          state: 'exception',
          attemptCount: job.attemptCount + 1,
          lastError: 'Submission outcome not yet recorded; reconcile before retry.',
          auditTrail: [...job.auditTrail, reserved],
        },
        overrideAccess: true,
      })
      const outcome = await submitPodJobWithRetry({
        job: { ...job, auditTrail: [...job.auditTrail, reserved] },
        adapter,
        actor,
        privateAssetSigningSecret: loadConfig().payloadSecret,
      })
      updated = outcome.job
      success = outcome.success
      retryable = !outcome.success && outcome.retryable
    } else if (action === 'cancel-pod-job') {
      updated = await cancelPodJob(job, adapter, 'Operator cancellation', actor)
    } else if (action === 'release-pod-hold') {
      await assertFulfillmentOrderEligible(payload, order)
      updated = releasePodJobHold(job, actor)
    } else {
      try {
        let recovered = job
        if (!job.externalOrderId) {
          if (!adapter.findOrderByIdempotencyKey)
            return {
              success: false,
              error:
                'Provider lookup by request identity unavailable. Keep on hold and inspect the provider dashboard; do not resubmit.',
              job: doc,
              retryable: false,
            }
          const found = await adapter.findOrderByIdempotencyKey(job.idempotencyKey)
          if (!found)
            return {
              success: false,
              error: 'Provider has not confirmed this request. No resubmission authorized.',
              job: doc,
              retryable: false,
            }
          recovered = { ...job, externalOrderId: found.externalOrderId }
        }
        updated = await reconcilePodJobWithProvider(recovered, adapter)
        success = !updated.lastError
      } catch {
        updated = {
          ...job,
          lastError: 'Provider reconciliation unavailable; saved outcome remains unresolved.',
          auditTrail: [
            ...job.auditTrail,
            {
              timestamp: now,
              action: 'provider_reconciliation_unavailable',
              actor,
              previousState: job.state,
              newState: job.state,
              details: { idempotencyKey: job.idempotencyKey, evidenceClass: adapter.metadata.mode },
            },
          ],
        }
        success = false
      }
    }
    const saved = await payload.update({
      collection: 'pod-jobs',
      id: jobId,
      depth: 0,
      data: {
        state: updated.state,
        externalOrderId: updated.externalOrderId,
        attemptCount: updated.attemptCount,
        lastError: success ? null : updated.lastError,
        auditTrail: updated.auditTrail,
        fulfillments: (updated as any).fulfillments ?? [],
      },
      overrideAccess: true,
    })
    await checkAndCompleteOrderFulfillment(payload, job.orderId, actor)
    return {
      success,
      job: { ...saved, lastReconciledAt: updated.lastReconciledAt },
      retryable,
      error: success ? undefined : updated.lastError,
      evidenceClass: adapter.metadata.mode,
    }
  })
}
