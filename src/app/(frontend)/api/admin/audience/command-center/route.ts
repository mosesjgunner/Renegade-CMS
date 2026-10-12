import config from '@payload-config'
import { getPayload } from 'payload'
import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'
import { publicSiteForHost } from '@/modules/public/site-scope'
import { executeDbQuery } from '@/modules/community/comment-composer'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user?.id || !['owner', 'administrator', 'staff'].includes(String(user.role))) {
    return Response.json({ error: 'Staff access required.' }, { status: 403 })
  }
  try {
    const grant = await resolveOperatorGrantContext(payload, user)
    const siteId =
      new URL(request.url).searchParams.get('siteId') ??
      (await publicSiteForHost(payload, request.headers.get('host') ?? new URL(request.url).host))
    if (
      !siteId ||
      !grant.authorized ||
      (!grant.isGlobalOwner && !grant.authorizedSiteIds.includes(siteId))
    ) {
      return Response.json({ error: 'Staff site access required.' }, { status: 403 })
    }
    const where = { site: { equals: siteId } }
    const registered = (slug: keyof typeof payload.collections) =>
      Boolean(payload.collections[slug])
    const [subscribers, messages, experiments, telecomMsgs, telecomDelivs, automations] =
      await Promise.all([
        registered('subscribers')
          ? payload.count({ collection: 'subscribers', where, overrideAccess: true })
          : null,
        registered('email-messages')
          ? payload.find({
              collection: 'email-messages',
              where,
              depth: 0,
              limit: 50,
              sort: '-createdAt',
              overrideAccess: true,
            })
          : null,
        registered('audience-experiments')
          ? payload.find({
              collection: 'audience-experiments',
              where,
              depth: 0,
              limit: 50,
              sort: '-createdAt',
              overrideAccess: true,
            })
          : null,
        registered('telecom-messages')
          ? payload.find({
              collection: 'telecom-messages',
              where,
              depth: 0,
              limit: 50,
              sort: '-createdAt',
              overrideAccess: true,
            })
          : null,
        registered('telecom-deliveries')
          ? payload.find({
              collection: 'telecom-deliveries',
              where,
              depth: 0,
              limit: 50,
              sort: '-createdAt',
              overrideAccess: true,
            })
          : null,
        registered('automation-definitions')
          ? payload.find({
              collection: 'automation-definitions',
              where,
              depth: 0,
              limit: 50,
              sort: '-createdAt',
              overrideAccess: true,
            })
          : null,
      ])
    const outcomes = registered('email-deliveries')
      ? await executeDbQuery<{ status: string; count: number }>(
          payload,
          `SELECT d.status, count(*)::int AS count FROM email_deliveries d
       JOIN email_messages m ON m.id=d.message_id WHERE m.site_id=$1 GROUP BY d.status`,
          [siteId],
        )
      : null
    const telecomOutcomes = telecomDelivs
      ? Object.entries(
          telecomDelivs.docs.reduce(
            (acc, d) => {
              const st = String((d as { status?: string }).status ?? 'unknown')
              acc[st] = (acc[st] ?? 0) + 1
              return acc
            },
            {} as Record<string, number>,
          ),
        ).map(([status, count]) => ({ status, count }))
      : null
    return Response.json(
      {
        siteId,
        subscribers: subscribers?.totalDocs ?? null,
        emailOutcomes: outcomes,
        telecomOutcomes,
        messages:
          messages?.docs.map((message) => ({
            id: message.id,
            subject: message.subject,
            status: message.status,
            scheduledFor: message.scheduledFor,
          })) ?? null,
        telecomMessages:
          telecomMsgs?.docs.map((message) => ({
            id: message.id,
            title: message.title,
            channel: message.channel,
            status: message.status,
            scheduledFor: message.scheduledFor,
          })) ?? null,
        automations:
          automations?.docs.map((def) => ({
            id: def.id,
            name: def.name,
            status: def.status,
            version: def.version,
          })) ?? null,
        experiments:
          experiments?.docs.map((experiment) => ({
            id: experiment.id,
            title: experiment.title,
            status: experiment.status,
          })) ?? null,
        source:
          'Persisted site records; email and telecom outcomes are transport/provider observations, not inbox delivery, opens or conversions.',
      },
      { headers: { 'cache-control': 'private, no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'Saved audience reporting could not be loaded.' },
      { status: 503 },
    )
  }
}
