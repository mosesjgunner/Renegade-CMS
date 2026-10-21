import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { executeSocialQueueItem } from '@/modules/social/tasks'
import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'

const staffOnly = (user: { role?: string } | null | undefined) =>
  ['owner', 'administrator', 'publisher', 'staff'].includes(String(user?.role))

export async function GET(request: Request) {
  try {
    const payload = await getPayload({ config: configPromise })
    const auth = await payload.auth({ headers: request.headers })

    const workerSecretHeader = request.headers.get('x-worker-secret')
    const configuredSecret = process.env.SOCIAL_WORKER_SECRET
    const isAuthorizedSecret =
      configuredSecret && workerSecretHeader && configuredSecret === workerSecretHeader

    const grant = await resolveOperatorGrantContext(payload, auth.user)
    if (!isAuthorizedSecret && (!staffOnly(auth.user) || !grant.authorized)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
    }

    const baseWhere =
      !isAuthorizedSecret && !grant.isGlobalOwner
        ? [{ 'account.site': { in: grant.authorizedSiteIds } }]
        : []

    const [scheduledRes, publishingRes, publishedRes, failedRes, dueRes] = await Promise.all([
      payload.count({
        collection: 'social-queue-items',
        where: { and: [{ status: { equals: 'scheduled' } }, ...baseWhere] },
        overrideAccess: true,
      }),
      payload.count({
        collection: 'social-queue-items',
        where: { and: [{ status: { equals: 'publishing' } }, ...baseWhere] },
        overrideAccess: true,
      }),
      payload.count({
        collection: 'social-queue-items',
        where: { and: [{ status: { equals: 'published' } }, ...baseWhere] },
        overrideAccess: true,
      }),
      payload.count({
        collection: 'social-queue-items',
        where: { and: [{ status: { equals: 'failed' } }, ...baseWhere] },
        overrideAccess: true,
      }),
      payload.count({
        collection: 'social-queue-items',
        where: {
          and: [
            { status: { equals: 'scheduled' } },
            { scheduledFor: { less_than_equal: new Date().toISOString() } },
            ...baseWhere,
          ],
        },
        overrideAccess: true,
      }),
    ])

    return NextResponse.json({
      success: true,
      stats: {
        scheduled: scheduledRes.totalDocs,
        publishing: publishingRes.totalDocs,
        published: publishedRes.totalDocs,
        failed: failedRes.totalDocs,
        dueCount: dueRes.totalDocs,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: `Queue worker stats failed: ${message}` },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config: configPromise })
    const auth = await payload.auth({ headers: request.headers })

    const workerSecretHeader = request.headers.get('x-worker-secret')
    const configuredSecret = process.env.SOCIAL_WORKER_SECRET

    const isAuthorizedSecret =
      configuredSecret && workerSecretHeader && configuredSecret === workerSecretHeader

    const grant = await resolveOperatorGrantContext(payload, auth.user)
    if (!isAuthorizedSecret && (!staffOnly(auth.user) || !grant.authorized)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
    }

    let body: {
      action?: 'dispatch' | 'retry-failed' | 'dispatch-item' | 'reconcile'
      queueItemId?: string
      draftId?: string
    } = {}
    try {
      body = (await request.json()) as typeof body
    } catch {
      // Body may be empty on plain POST
    }

    const action = body.action || 'dispatch'

    // ==========================================
    // ACTION: DISPATCH SINGLE QUEUE ITEM
    // ==========================================
    if (action === 'dispatch-item') {
      if (!body.queueItemId) {
        return NextResponse.json({ error: 'queueItemId is required for dispatch-item' }, { status: 400 })
      }
      const item = await payload.findByID({
        collection: 'social-queue-items',
        id: body.queueItemId,
        depth: 0,
        overrideAccess: true,
      })
      if (!item) {
        return NextResponse.json({ error: 'Queue item not found' }, { status: 404 })
      }

      await executeSocialQueueItem(payload, {
        queueItemId: body.queueItemId,
        workerId: 'admin-manual',
      }).catch(() => undefined)

      const updated = await payload.findByID({
        collection: 'social-queue-items',
        id: body.queueItemId,
        depth: 1,
        overrideAccess: true,
      })

      return NextResponse.json({
        success: true,
        action: 'dispatch-item',
        item: updated,
      })
    }

    // ==========================================
    // ACTION: RETRY FAILED (BOUNDED RETRIES)
    // ==========================================
    if (action === 'retry-failed') {
      const failedItems = await payload.find({
        collection: 'social-queue-items',
        where: {
          and: [
            { status: { equals: 'failed' } },
            { attemptCount: { less_than: 3 } },
            ...(!isAuthorizedSecret && !grant.isGlobalOwner
              ? [{ 'account.site': { in: grant.authorizedSiteIds } }]
              : []),
          ],
        },
        limit: 20,
        depth: 0,
        overrideAccess: true,
      })

      let retriedCount = 0
      let succeededCount = 0
      let failedAgainCount = 0

      for (const queue of failedItems.docs) {
        retriedCount++
        // Reset item to scheduled for immediate processing
        await payload.update({
          collection: 'social-queue-items',
          id: queue.id,
          data: {
            status: 'scheduled',
            scheduledFor: new Date().toISOString(),
            leaseUntil: null,
            leaseOwner: null,
          } as never,
          overrideAccess: true,
        })

        await executeSocialQueueItem(payload, {
          queueItemId: String(queue.id),
          workerId: 'admin-retry',
        }).catch(() => undefined)

        const updated = await payload.findByID({
          collection: 'social-queue-items',
          id: queue.id,
          depth: 0,
          overrideAccess: true,
        })

        if (updated.status === 'published') {
          succeededCount++
        } else if (updated.status === 'failed') {
          failedAgainCount++
        }
      }

      return NextResponse.json({
        success: true,
        action: 'retry-failed',
        summary: { retriedCount, succeededCount, failedAgainCount },
      })
    }

    // ==========================================
    // ACTION: DISPATCH DUE QUEUE
    // ==========================================
    const queues = await payload.find({
      collection: 'social-queue-items',
      where: {
        and: [
          { status: { equals: 'scheduled' } },
          { scheduledFor: { less_than_equal: new Date().toISOString() } },
          ...(!isAuthorizedSecret && !grant.isGlobalOwner
            ? [{ 'account.site': { in: grant.authorizedSiteIds } }]
            : []),
        ],
      },
      limit: 20,
      depth: 0,
      overrideAccess: true,
    })

    let succeededCount = 0
    let failedCount = 0
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
      if (updated.status === 'published') {
        succeededCount++
      } else if (updated.status === 'failed') {
        failedCount++
      }
    }
    return NextResponse.json({
      success: true,
      summary: { processedCount: queues.docs.length, succeededCount, failedCount },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: `Queue worker execution failed: ${message}` },
      { status: 500 },
    )
  }
}
