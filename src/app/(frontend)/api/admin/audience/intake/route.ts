import { executeDbQuery } from '@/modules/community/comment-composer'
import { retryCommunityDelivery } from '@/modules/community/external-notifications'
import config from '@payload-config'
import { getPayload } from 'payload'
import { publicSiteForHost, samePublicOrigin } from '@/modules/public/site-scope'
import { withExecutionLock } from '@/modules/operations/execution-lock'

import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'

type Doc = Record<string, unknown>
async function scope(request: Request) {
  const payload = await getPayload({ config }),
    { user } = await payload.auth({ headers: request.headers })
  const site = await publicSiteForHost(payload, request.headers.get('host'))
  if (!user || !site) return null
  const grant = await resolveOperatorGrantContext(payload, user)
  if (!grant.authorized || (!grant.isGlobalOwner && !grant.authorizedSiteIds.includes(site))) {
    return null
  }
  return { payload, user, site }
}
export async function GET(request: Request) {
  const context = await scope(request)
  if (!context) return Response.json({ error: 'Staff site access required.' }, { status: 403 })
  const { payload, site } = context
  if (!payload.collections['form-submissions'])
    return Response.json({ error: 'Forms module unavailable.' }, { status: 404 })
  const [received, held, triaged] = await Promise.all(
    ['received', 'held', 'triaged'].map((status) =>
      payload.count({
        collection: 'form-submissions',
        where: { and: [{ site: { equals: site } }, { status: { equals: status } }] },
        overrideAccess: true,
      }),
    ),
  )
  const records = await payload.find({
    collection: 'form-submissions',
    where: { and: [{ site: { equals: site } }, { status: { in: ['received', 'held'] } }] },
    sort: 'submittedAt',
    limit: 25,
    depth: 0,
    overrideAccess: true,
  })
  const communityDeliveries = await executeDbQuery(
    payload,
    `SELECT id,status,attempts,error,provider,provider_message_id,created_at FROM audience_delivery_outbox WHERE site_id=$1 AND envelope->>'kind'='community-notification' ORDER BY created_at DESC LIMIT 25`,
    [site],
  )
  return Response.json(
    {
      communityDeliveries,
      siteId: site,
      counts: {
        received: (received as { totalDocs: number }).totalDocs,
        held: (held as { totalDocs: number }).totalDocs,
        triaged: (triaged as { totalDocs: number }).totalDocs,
      },
      submissions: records.docs.map((row) => ({
        id: row.id,
        status: row.status,
        submittedAt: row.submittedAt,
        actionState: Array.isArray(row.actionState)
          ? (row.actionState as Doc[]).map((step: Doc) => ({
              index: step.index,
              type: step.type,
              status: step.status,
              attempts: step.attempts,
              error: step.error,
              resultId: step.resultId,
            }))
          : [],
      })),
    },
    { headers: { 'cache-control': 'private, no-store' } },
  )
}
export async function POST(request: Request) {
  const context = await scope(request)
  if (!context) return Response.json({ error: 'Staff site access required.' }, { status: 403 })
  if (!(await samePublicOrigin(context.payload, request, true)))
    return Response.json({ error: 'Same-origin recovery required.' }, { status: 403 })
  const { payload, user, site } = context,
    body = await request.json().catch(() => ({}))
  if (typeof body.deliveryId === 'string' && /^[a-f0-9-]{36}$/i.test(body.deliveryId))
    return Response.json({
      queued: await retryCommunityDelivery(payload, site, body.deliveryId, String(user.id)),
    })
  if (typeof body.submissionId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.submissionId))
    return Response.json({ error: 'Submission ID required.' }, { status: 400 })
  return withExecutionLock(payload, `form-actions:${body.submissionId}`, async () => {
    const row = await payload.findByID({
      collection: 'form-submissions',
      id: body.submissionId,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
    })
    if (!row || String(row.site) !== site)
      return Response.json({ error: 'Submission unavailable.' }, { status: 404 })
    const states = Array.isArray(row.actionState) ? (row.actionState as Doc[]) : []
    if (
      !['held', 'received'].includes(row.status) ||
      !states.some((state) => state.status === 'failed')
    )
      return Response.json({ error: 'No failed intake steps to retry.' }, { status: 409 })
    if (
      states.some(
        (state) =>
          state.status !== 'completed' &&
          (!state.action || !['create-contact', 'create-task'].includes(String(state.type))),
      )
    )
      return Response.json(
        { error: 'Unsupported historical action requires operator migration.' },
        { status: 409 },
      )
    const notes = Array.isArray(row.reviewNotes) ? row.reviewNotes : []
    await payload.update({
      collection: 'form-submissions',
      id: row.id,
      data: {
        status: 'received',
        actionState: states.map((state) =>
          state.status === 'failed' ? { ...state, attempts: 0, status: 'pending' } : state,
        ),
        reviewNotes: [
          ...notes,
          { kind: 'retry-failed-intake', actorUserId: user.id, at: new Date().toISOString() },
        ],
      },
      overrideAccess: true,
    })
    return Response.json({
      status: 'received',
      message: 'Failed steps queued for worker recovery.',
    })
  })
}
