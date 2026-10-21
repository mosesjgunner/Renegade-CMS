import config from '@payload-config'
import { getPayload, type Where } from 'payload'
import {
  executeSocialQueueItem,
  MAX_PROVIDER_ATTEMPTS,
  type SocialDispatchInput,
} from '@/modules/social/tasks'
import {
  checkOperatorRecordAccess,
  resolveOperatorGrantContext,
} from '@/modules/operations/operator-grants'

async function context(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  const configured = process.env.SOCIAL_WORKER_SECRET
  const service = Boolean(configured && request.headers.get('x-worker-secret') === configured)
  const grant = await resolveOperatorGrantContext(payload, auth.user)
  return { payload, auth, grant, service, authorized: service || grant.authorized }
}

export async function GET(request: Request) {
  const { payload, grant, service, authorized } = await context(request)
  if (!authorized) return Response.json({ error: 'Unauthorized.' }, { status: 403 })
  const scope: Where[] =
    service || grant.isGlobalOwner
      ? []
      : [
          { 'account.site': { in: grant.authorizedSiteIds } },
          { 'variant.draft.site': { in: grant.authorizedSiteIds } },
        ]
  const entries = await Promise.all(
    ['scheduled', 'publishing', 'published', 'failed', 'unknown'].map(async (status) => [
      status,
      (
        await payload.count({
          collection: 'social-queue-items',
          where: { and: [{ status: { equals: status } }, ...scope] },
          overrideAccess: true,
        })
      ).totalDocs,
    ]),
  )
  const dueCount = await payload.count({
    collection: 'social-queue-items',
    where: {
      and: [
        { status: { equals: 'scheduled' } },
        { scheduledFor: { less_than_equal: new Date().toISOString() } },
        ...scope,
      ],
    },
    overrideAccess: true,
  })
  return Response.json({
    success: true,
    stats: { ...Object.fromEntries(entries), dueCount: dueCount.totalDocs },
  })
}

export async function POST(request: Request) {
  const { payload, auth, grant, service, authorized } = await context(request)
  if (!authorized) return Response.json({ error: 'Unauthorized.' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as {
    action?: string
    queueItemId?: string
    draftId?: string
  }
  const action = body.action ?? 'dispatch'
  if (!['dispatch', 'dispatch-item', 'retry-failed', 'reconcile'].includes(action))
    return Response.json({ error: 'Unsupported social worker action.' }, { status: 400 })
  if (action === 'dispatch-item' && !body.queueItemId)
    return Response.json({ error: 'queueItemId is required.' }, { status: 400 })
  const mode: SocialDispatchInput['mode'] =
    action === 'retry-failed' ? 'retry' : action === 'reconcile' ? 'reconcile' : 'dispatch'
  if (
    body.draftId &&
    !service &&
    !(await checkOperatorRecordAccess(payload, auth.user, 'social-drafts', body.draftId))
  )
    return Response.json({ error: 'Draft site access denied.' }, { status: 403 })
  if (
    body.queueItemId &&
    !service &&
    (!(await checkOperatorRecordAccess(
      payload,
      auth.user,
      'social-queue-items',
      body.queueItemId,
      'account.site',
    )) ||
      !(await checkOperatorRecordAccess(
        payload,
        auth.user,
        'social-queue-items',
        body.queueItemId,
        'variant.draft.site',
      )))
  )
    return Response.json({ error: 'Queue item site access denied.' }, { status: 403 })
  const now = new Date().toISOString()
  const expired: Where = {
    and: [
      { status: { equals: 'publishing' } },
      { or: [{ leaseUntil: { less_than_equal: now } }, { leaseUntil: { exists: false } }] },
    ],
  }
  const eligibility: Where =
    mode === 'retry'
      ? {
          and: [
            { status: { equals: 'failed' } },
            {
              or: [
                { attemptCount: { less_than: MAX_PROVIDER_ATTEMPTS } },
                { attemptCount: { exists: false } },
              ],
            },
            { nextAttemptAt: { less_than_equal: now } },
          ],
        }
      : mode === 'reconcile'
        ? { or: [{ status: { equals: 'unknown' } }, expired] }
        : {
            or: [
              {
                and: [
                  { status: { equals: 'scheduled' } },
                  { scheduledFor: { less_than_equal: now } },
                ],
              },
              expired,
            ],
          }

  try {
    const queues = body.queueItemId
      ? [
          await payload.findByID({
            collection: 'social-queue-items',
            id: body.queueItemId,
            depth: 0,
            overrideAccess: true,
          }),
        ]
      : (
          await payload.find({
            collection: 'social-queue-items',
            depth: 0,
            limit: 20,
            overrideAccess: true,
            where: {
              and: [
                eligibility,
                ...(body.draftId ? [{ 'variant.draft': { equals: body.draftId } }] : []),
                ...(service || grant.isGlobalOwner
                  ? []
                  : [
                      { 'account.site': { in: grant.authorizedSiteIds } },
                      { 'variant.draft.site': { in: grant.authorizedSiteIds } },
                    ]),
              ],
            },
          })
        ).docs
    const results = []
    for (const queue of queues) {
      const result = await executeSocialQueueItem(payload, {
        queueItemId: String(queue.id),
        workerId: 'operator-social',
        mode,
      })
      results.push({ queueItemId: queue.id, ...result.output })
    }
    const processed = results.filter((result) => !('skipped' in result && result.skipped))
    const succeededCount = processed.filter((result) => result.status === 'published').length
    const failedCount = processed.filter((result) => result.status === 'failed').length
    const unknownCount = processed.filter((result) => result.status === 'unknown').length
    const item = body.queueItemId
      ? await payload.findByID({
          collection: 'social-queue-items',
          id: body.queueItemId,
          depth: 1,
          overrideAccess: true,
        })
      : undefined
    return Response.json({
      success: true,
      action,
      item,
      results,
      summary: {
        processedCount: processed.length,
        skippedCount: results.length - processed.length,
        succeededCount,
        failedCount,
        unknownCount,
        retriedCount: mode === 'retry' ? processed.length : 0,
        failedAgainCount: mode === 'retry' ? failedCount : 0,
      },
    })
  } catch (error) {
    console.error('[worker-route-error]', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Social worker failed.' },
      { status: 422 },
    )
  }
}
