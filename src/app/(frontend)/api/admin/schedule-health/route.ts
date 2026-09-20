import { NextResponse, type NextRequest } from 'next/server'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { reconcileScheduleWorkerJobs, sanitizeErrorLog } from '@/modules/editorial/scheduler'

type Doc = Record<string, any>

const idOf = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return String(value.id)
  return String(value ?? '')
}

export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config: configPromise })
    const { searchParams } = new URL(req.url)
    const siteId = searchParams.get('siteId')
    const limit = parseInt(searchParams.get('limit') ?? '50', 10)

    const now = new Date()
    const nowIso = now.toISOString()

    // Query scheduled publish jobs
    const jobsResult = (await payload.find({
      collection: 'scheduled-publish-jobs',
      limit,
      sort: '-scheduledFor',
      overrideAccess: true,
    } as never)) as { docs: Doc[] }

    // Map jobs with sanitized logs and exact revision metadata
    const jobs = jobsResult.docs.map((job) => {
      const scheduledForDate = new Date(job.scheduledFor)
      const isLate = job.status === 'queued' && scheduledForDate < now

      return {
        id: String(job.id),
        articleId: idOf(job.article),
        articleTitle:
          job.article && typeof job.article === 'object'
            ? String(job.article.title ?? 'Article')
            : 'Article',
        revisionId: idOf(job.revision),
        revisionSequence:
          job.revision && typeof job.revision === 'object' ? Number(job.revision.sequence ?? 1) : 1,
        revisionHash:
          job.revision && typeof job.revision === 'object' ? String(job.revision.hash ?? '') : '',
        scheduledFor: String(job.scheduledFor),
        timeZone: String(job.timeZone ?? 'UTC'),
        idempotencyKey: String(job.idempotencyKey),
        status: isLate ? 'late' : String(job.status),
        rawStatus: String(job.status),
        leaseOwner: job.leaseOwner ? String(job.leaseOwner) : null,
        leaseExpiresAt: job.leaseExpiresAt ? String(job.leaseExpiresAt) : null,
        retryCount: Number(job.retryCount ?? 0),
        maxRetries: Number(job.maxRetries ?? 3),
        lastError: sanitizeErrorLog(job.lastError ? String(job.lastError) : null),
      }
    })

    const counts = {
      nextJobs: jobs.filter((j) => j.rawStatus === 'queued' && new Date(j.scheduledFor) >= now)
        .length,
      lateJobs: jobs.filter((j) => j.status === 'late').length,
      retryingJobs: jobs.filter((j) => j.rawStatus === 'queued' && j.retryCount > 0).length,
      failedJobs: jobs.filter((j) => j.rawStatus === 'failed').length,
      completedJobs: jobs.filter((j) => j.rawStatus === 'completed').length,
    }

    const workerHealth = {
      status: counts.failedJobs > 0 ? 'degraded' : 'healthy',
      activeWorkerId: 'worker-primary-node',
      lastHeartbeat: nowIso,
      clockDriftBufferSeconds: 30,
      catchUpThresholdMinutes: 60,
    }

    return NextResponse.json({
      counts,
      workerHealth,
      jobs,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await getPayload({ config: configPromise })
    const body = await req.json()
    const { action, jobId, workerId = 'worker-admin' } = body

    if (action === 'reconcile') {
      const result = await reconcileScheduleWorkerJobs(payload, {
        workerId,
        limit: 50,
      })
      return NextResponse.json({ ok: true, result })
    }

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId is required for single-job actions.' },
        { status: 400 },
      )
    }

    if (action === 'retry') {
      await payload.update({
        collection: 'scheduled-publish-jobs',
        id: jobId,
        data: {
          status: 'queued',
          retryCount: 0,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: null,
        },
        overrideAccess: true,
      } as never)
      return NextResponse.json({ ok: true, message: `Job ${jobId} reset for retry.` })
    }

    if (action === 'cancel') {
      await payload.update({
        collection: 'scheduled-publish-jobs',
        id: jobId,
        data: {
          status: 'cancelled',
          leaseOwner: null,
          leaseExpiresAt: null,
        },
        overrideAccess: true,
      } as never)
      return NextResponse.json({ ok: true, message: `Job ${jobId} cancelled.` })
    }

    return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
