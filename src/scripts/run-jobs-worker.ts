import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import config from '../payload.config'
import { getPayload, type Where } from 'payload'

const pollInterval = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 10_000)
const mediaStaleClaimMs = Number(process.env.MEDIA_STALE_CLAIM_MS ?? 15 * 60_000)
const heartbeatFile = process.env.WORKER_HEARTBEAT_FILE ?? '/tmp/renegade-worker/heartbeat.json'
const workerProfile = process.env.WORKER_PROFILE ?? 'default'
const workerId = `worker-${randomUUID()}`

if (!Number.isInteger(pollInterval) || pollInterval < 1_000 || pollInterval > 60_000) {
  throw new Error('WORKER_POLL_INTERVAL_MS must be an integer between 1000 and 60000')
}
if (
  !Number.isInteger(mediaStaleClaimMs) ||
  mediaStaleClaimMs < 1_000 ||
  mediaStaleClaimMs > 24 * 60 * 60_000
) {
  throw new Error('MEDIA_STALE_CLAIM_MS must be an integer between 1000 and 86400000')
}

const payload = await getPayload({ config })
// Module switches may leave durable jobs from a previously enabled profile.
// Payload permanently fails unregistered task slugs if they reach its runner;
// leave those rows queued so re-enabling the module can resume them normally.
const registeredTasks = (payload.config.jobs.tasks ?? []).map(({ slug }) => slug)
const registeredWorkflows = (payload.config.jobs.workflows ?? []).map(({ slug }) => slug)
const registrations: Where[] = []
if (registeredTasks.length) registrations.push({ taskSlug: { in: registeredTasks } })
if (registeredWorkflows.length) registrations.push({ workflowSlug: { in: registeredWorkflows } })
const registeredJobs: Where = registrations.length
  ? { or: registrations }
  : { id: { exists: false } }
let nextExternalVideoSweep = 0
let stopping = false
let timer: NodeJS.Timeout | undefined

async function cycle(): Promise<void> {
  try {
    // RC3-EMAIL-01: dedicated account-mail profile. An account worker runs
    // ONLY the account/operational outbox sweep — it never loads audience
    // credentials, queues, or recovery, so an audience incident (flood,
    // revoked credentials, quota exhaustion) cannot consume its capacity.
    if (workerProfile === 'account') {
      if (payload.collections['email-intents']) {
        const { recoverAccountEmailOutbox } = await import('../modules/email/outbox')
        await recoverAccountEmailOutbox(payload as never)
      }
      await mkdir(path.dirname(heartbeatFile), { recursive: true }).catch(() => undefined)
      await writeFile(
        heartbeatFile,
        JSON.stringify({ observedAt: new Date().toISOString(), pid: process.pid }),
      )
      return
    }
    if (workerProfile !== 'commerce-only') {
      await payload.jobs.handleSchedules({ queue: 'operations' })
      // Execute a bounded batch serially: side-effect tasks retain spare database
      // connections, and all-enabled housekeeping does not starve ordinary intake.
      await payload.jobs.run({
        queue: 'operations',
        limit: 10,
        sequential: true,
        where: registeredJobs,
      })
      if (payload.collections['scheduled-publish-jobs']) {
        const { reconcileScheduleWorkerJobs } = await import('../modules/editorial/scheduler')
        await reconcileScheduleWorkerJobs(payload, { workerId })
      }
      if (payload.collections['email-deliveries']) {
        const { recoverEmailOutbox } = await import('../modules/audience/tasks')
        await recoverEmailOutbox(payload)
      }
      // The audience-profile worker never touches the account outbox; the
      // default profile runs both sweeps for small single-worker installs.
      if (workerProfile !== 'audience' && payload.collections['email-intents']) {
        const { recoverAccountEmailOutbox } = await import('../modules/email/outbox')
        await recoverAccountEmailOutbox(payload as never)
      }
      if (payload.collections['social-queue-items']) {
        const { recoverSocialOutbox } = await import('../modules/social/tasks')
        await recoverSocialOutbox(payload)
      }
      if (
        workerProfile !== 'audience' &&
        payload.collections['external-video-sources'] &&
        Date.now() >= nextExternalVideoSweep
      ) {
        nextExternalVideoSweep = Date.now() + 15 * 60 * 1000
        const { purgeExpiredVideoSnapshots, recheckYouTubeAuthorizations } = await import(
          '../modules/creator-studio/external-video'
        )
        await purgeExpiredVideoSnapshots(payload)
        await recheckYouTubeAuthorizations(payload)
      }
      if (payload.collections['media-assets']) {
        const { recoverStaleMediaVariantJobs } = await import('../modules/media/tasks')
        await recoverStaleMediaVariantJobs(payload as never, mediaStaleClaimMs).catch(
          () => undefined,
        )
      }
      await payload.jobs.run({ queue: 'media', where: registeredJobs }).catch(() => undefined)
    }
    if (payload.collections['payment-webhook-events']) {
      const { recoverStaleCommerceJobs } = await import('../modules/commerce/tasks')
      await recoverStaleCommerceJobs(payload).catch(() => undefined)
    }
    await payload.jobs.handleSchedules({ queue: 'commerce' })
    await payload.jobs.run({ queue: 'commerce', limit: 1, where: registeredJobs })
    if (workerProfile === 'media-heavy') {
<<<<<<< HEAD
      const { recoverCreatorCaptionJobs } = await import(
        '../modules/creator-studio/caption-worker-recovery'
      )
      await recoverCreatorCaptionJobs(payload).catch((error) => {
        payload.logger.error({ err: error, event: 'creator.caption_recovery_failed' })
      })
=======
>>>>>>> 65bd6bbb47a9fc4d664c2b3ee7264dc90e226df2
      const { recoverCreatorMediaExports } = await import(
        '../modules/creator-studio/media-edit-exports'
      )
      await recoverCreatorMediaExports(payload).catch((error) => {
        payload.logger.error({ err: error, event: 'creator.media_export_recovery_failed' })
      })
      const { recoverStaleVideoJobs } = await import('../modules/media/video-workflow')
      await recoverStaleVideoJobs(payload).catch(() => undefined)
      await payload.jobs
        .run({
          queue: 'media-heavy',
          limit: Number(process.env.VIDEO_JOB_CONCURRENCY || 1),
          where: registeredJobs,
        })
        .catch(() => undefined)
    }
    // Presence is intentionally short-lived operational state, never an analytics log.
    const stalePresence = await payload
      .find({
        collection: 'realtime-presence',
        where: { expiresAt: { less_than_equal: new Date().toISOString() } },
        limit: 100,
        overrideAccess: true,
      } as never)
      .catch(() => null)
    if (stalePresence)
      for (const entry of stalePresence.docs)
        await payload.delete({
          collection: 'realtime-presence',
          id: entry.id,
          overrideAccess: true,
        } as never)
    await mkdir(path.dirname(heartbeatFile), { recursive: true }).catch(() => undefined)
    await writeFile(
      heartbeatFile,
      JSON.stringify({ observedAt: new Date().toISOString(), pid: process.pid }),
    )
  } catch (error) {
    payload.logger.error({ err: error, event: 'operations.worker.cycle_failed' })
  } finally {
    if (!stopping) timer = setTimeout(cycle, pollInterval)
  }
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return
  stopping = true
  if (timer) clearTimeout(timer)
  payload.logger.info({ event: 'operations.worker.stopping', signal })
  await payload.destroy()
  process.exit(0)
}

process.once('SIGTERM', () => void shutdown('SIGTERM'))
process.once('SIGINT', () => void shutdown('SIGINT'))
await cycle()
