import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { executeSocialQueueItem } from '@/modules/social/tasks'

const staffOnly = (user: { role?: string } | null | undefined) =>
  ['owner', 'administrator', 'publisher', 'staff'].includes(String(user?.role))

export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config: configPromise })
    const auth = await payload.auth({ headers: request.headers })

    const workerSecretHeader = request.headers.get('x-worker-secret')
    const configuredSecret = process.env.SOCIAL_WORKER_SECRET

    const isAuthorizedSecret =
      configuredSecret && workerSecretHeader && configuredSecret === workerSecretHeader

    if (!isAuthorizedSecret && !staffOnly(auth.user)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
    }

    const queues = await payload.find({
      collection: 'social-queue-items',
      where: {
        and: [
          { status: { equals: 'scheduled' } },
          { scheduledFor: { less_than_equal: new Date().toISOString() } },
        ],
      },
      limit: 20,
      depth: 0,
      overrideAccess: true,
    })
    let succeededCount = 0
    for (const queue of queues.docs) {
      if (queue.nextAttemptAt && Date.parse(queue.nextAttemptAt) > Date.now()) continue
      await executeSocialQueueItem(payload, {
        queueItemId: String(queue.id),
        workerId: 'admin-recovery',
      }).catch(() => undefined)
      const updated = await payload.findByID({
        collection: 'social-queue-items',
        id: queue.id,
        depth: 0,
        overrideAccess: true,
      })
      if (updated.status === 'published') succeededCount++
    }
    return NextResponse.json({
      success: true,
      summary: { processedCount: queues.docs.length, succeededCount },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: `Queue worker execution failed: ${message}` },
      { status: 500 },
    )
  }
}
