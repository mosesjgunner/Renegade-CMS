import type { Payload } from 'payload'
import { loadBundleByArticleId, persistWorkflow, hydrateWorkflow } from './persistence'
import type { EditorialActor } from './workflow'
import { assertMediaIdsPublishable, assertUsageTargetsPublishable, reconcileMediaUsages } from '../media/workflow'

export type CatchUpPolicyMode = 'publish-immediately' | 'expire-and-fail' | 'manual-reconcile'

export type CatchUpPolicyConfig = {
  mode: CatchUpPolicyMode
  thresholdMinutes: number
}

export type JobLeaseOptions = {
  workerId: string
  leaseDurationSeconds?: number
  catchUpPolicy?: CatchUpPolicyConfig
  now?: string
}

export type ReconcileOptions = JobLeaseOptions & {
  limit?: number
}

export type SanitizedJobLog = {
  jobId: string
  articleId: string
  targetRevisionId: string
  scheduledFor: string
  timeZone: string
  status: string
  retryCount: number
  maxRetries: number
  leaseOwner: string | null
  leaseExpiresAt: string | null
  lastErrorSanitized: string | null
  updatedAt: string
}

type Doc = Record<string, any>

const idOf = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return String(value.id)
  return String(value ?? '')
}

/**
 * Redacts potential secrets, passwords, tokens, and database URIs from error log strings.
 */
export function sanitizeErrorLog(errorStr: string | null | undefined): string | null {
  if (!errorStr) return null
  return errorStr
    .replace(/(?:postgres|mysql|mongodb|redis|http|https):\/\/[^\s@]+@/gi, 'scheme://***REDACTED***@')
    .replace(/(?:bearer|token|secret|password|key|auth)=["']?[^"'\s]+["']?/gi, '$1=***REDACTED***')
    .replace(/["']?(?:secret|password|privateKey|accessToken|apiKey)["']?\s*:\s*["']?[^"'\s,]+["']?/gi, '"secret":"***REDACTED***"')
}

/**
 * Robust execution engine for scheduled publication jobs.
 * Enforces worker lease locking, clock drift buffers, catch-up policy enforcement,
 * revision immutability verification, and idempotent finalization.
 */
export async function executeScheduledPublishJob(
  payload: Payload,
  jobId: string,
  options: JobLeaseOptions,
): Promise<{ success: boolean; published: boolean; catchUpTriggered: boolean; error?: string }> {
  const nowMs = options.now ? new Date(options.now).getTime() : Date.now()
  const nowIso = new Date(nowMs).toISOString()
  const leaseDurationSec = options.leaseDurationSeconds ?? 300
  const catchUpPolicy: CatchUpPolicyConfig = options.catchUpPolicy ?? {
    mode: 'publish-immediately',
    thresholdMinutes: 60,
  }

  // 1. Fetch job
  const job = (await payload.findByID({
    collection: 'scheduled-publish-jobs',
    id: jobId,
    depth: 1,
    overrideAccess: true,
  })) as Doc

  if (!job) throw new Error(`Scheduled job "${jobId}" was not found.`)

  // Idempotency check: if job is already completed or cancelled, return immediately
  if (job.status === 'completed') {
    return { success: true, published: true, catchUpTriggered: false }
  }
  if (job.status === 'cancelled') {
    return { success: false, published: false, catchUpTriggered: false, error: 'Job was cancelled' }
  }

  // Check active lease from another live worker
  if (job.status === 'processing' && job.leaseOwner && job.leaseOwner !== options.workerId) {
    if (job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() > nowMs) {
      return { success: false, published: false, catchUpTriggered: false, error: `Job is leased by worker "${job.leaseOwner}"` }
    }
  }

  // Clock drift buffer (allow up to 30 seconds clock skew before scheduled time)
  const scheduledTimeMs = new Date(job.scheduledFor).getTime()
  const clockDriftBufferMs = 30 * 1000
  if (nowMs < scheduledTimeMs - clockDriftBufferMs) {
    return { success: false, published: false, catchUpTriggered: false, error: 'Schedule window not yet reached' }
  }

  // Check catch-up policy if job is late
  const lateMinutes = (nowMs - scheduledTimeMs) / (60 * 1000)
  let catchUpTriggered = false

  if (lateMinutes > catchUpPolicy.thresholdMinutes) {
    catchUpTriggered = true
    if (catchUpPolicy.mode === 'expire-and-fail') {
      const errorMsg = `Missed schedule window by ${Math.round(lateMinutes)}m (threshold: ${catchUpPolicy.thresholdMinutes}m). Job expired under catch-up policy.`
      await payload.update({
        collection: 'scheduled-publish-jobs',
        id: jobId,
        data: {
          status: 'failed',
          lastError: errorMsg,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
        overrideAccess: true,
      } as never)
      return { success: false, published: false, catchUpTriggered: true, error: errorMsg }
    }
  }

  // 2. Acquire Lease Lock
  const leaseExpiresAt = new Date(nowMs + leaseDurationSec * 1000).toISOString()
  await payload.update({
    collection: 'scheduled-publish-jobs',
    id: jobId,
    data: {
      status: 'processing',
      leaseOwner: options.workerId,
      leaseExpiresAt,
    },
    overrideAccess: true,
  } as never)

  const articleId = idOf(job.article)

  try {
    // 3. Verify Exact Revision Immutability
    const bundle = await loadBundleByArticleId(payload, articleId)
    const scheduledRevisionId = idOf(job.revision)

    if (!bundle.revisions.some((rev: Doc) => String(rev.id) === scheduledRevisionId)) {
      throw new Error(`Scheduled target revision "${scheduledRevisionId}" no longer exists.`)
    }

    // Ensure usage & media readiness
    await reconcileMediaUsages(payload, idOf(bundle.content.site))
    await assertUsageTargetsPublishable(payload, [articleId, idOf(bundle.content.id)])
    const heroMediaId = idOf(bundle.content.heroMedia)
    if (heroMediaId) await assertMediaIdsPublishable(payload, [heroMediaId])

    // Execute state transition strictly publishing the approved revision `scheduledRevisionId`
    const actor: EditorialActor = { id: options.workerId, role: 'publisher' }
    const workflow = hydrateWorkflow(bundle)

    const published = workflow.publishScheduled(actor, String(job.idempotencyKey), nowIso)
    const latestPublishedRevisionId = published ? scheduledRevisionId : idOf(bundle.article.latestPublishedRevision)

    await persistWorkflow(payload, bundle, workflow, {
      reason: 'published',
      actorUserId: options.workerId,
      latestPublishedRevisionId,
    })

    // 4. Finalize Job
    await payload.update({
      collection: 'scheduled-publish-jobs',
      id: jobId,
      data: {
        status: 'completed',
        leaseOwner: null,
        leaseExpiresAt: null,
      },
      overrideAccess: true,
    } as never)

    return { success: true, published: true, catchUpTriggered }
  } catch (err) {
    // 5. Handle Failure & Retries
    const errorMessage = err instanceof Error ? err.message : String(err)
    const sanitizedMsg = sanitizeErrorLog(errorMessage) ?? 'Unknown execution failure'

    const currentRetries = Number(job.retryCount ?? 0) + 1
    const maxRetries = Number(job.maxRetries ?? 3)
    const failedFinal = currentRetries >= maxRetries

    await payload.update({
      collection: 'scheduled-publish-jobs',
      id: jobId,
      data: {
        status: failedFinal ? 'failed' : 'queued',
        retryCount: currentRetries,
        lastError: sanitizedMsg,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
      overrideAccess: true,
    } as never)

    return { success: false, published: false, catchUpTriggered, error: sanitizedMsg }
  }
}

/**
 * Reconciles and executes due scheduled publication jobs.
 */
export async function reconcileScheduleWorkerJobs(
  payload: Payload,
  options: ReconcileOptions,
): Promise<{
  processedCount: number
  successCount: number
  failedCount: number
  jobs: Array<{ jobId: string; success: boolean; published: boolean; error?: string }>
}> {
  const nowMs = options.now ? new Date(options.now).getTime() : Date.now()
  const limit = options.limit ?? 50

  const pendingJobs = (
    (await payload.find({
      collection: 'scheduled-publish-jobs',
      where: {
        and: [
          { status: { in: ['queued', 'processing'] } },
          { scheduledFor: { less_than_equal: new Date(nowMs + 30000).toISOString() } }, // clock drift buffer
        ],
      },
      limit,
      overrideAccess: true,
    } as never)) as { docs: Doc[] }
  ).docs

  const results: Array<{ jobId: string; success: boolean; published: boolean; error?: string }> = []
  let successCount = 0
  let failedCount = 0

  for (const job of pendingJobs) {
    const res = await executeScheduledPublishJob(payload, String(job.id), options)
    results.push({
      jobId: String(job.id),
      success: res.success,
      published: res.published,
      error: res.error,
    })
    if (res.success) successCount++
    else failedCount++
  }

  return {
    processedCount: results.length,
    successCount,
    failedCount,
    jobs: results,
  }
}
