import { loadConfig } from '@/modules/core/config'
import { resolveSiteSettings } from '@/modules/core/site-settings'
import {
  boundedActivity,
  readBoundedActivityBody,
  relationshipActivity,
  remoteReply,
} from '@/modules/social/activitypub'
import {
  queueActivityDelivery,
  recordInbound,
  releaseInbound,
  verifyInboundActivity,
} from '@/modules/social/activitypub-runtime'
import { takeNetworkQuota } from '@/modules/network/experience'
import { activityJson, publicationActor } from '../actor'

export const dynamic = 'force-dynamic'
export async function POST(request: Request, context: { params: Promise<{ handle: string }> }) {
  const app = loadConfig()
  const actor = await publicationActor((await context.params).handle)
  if (!app.networking.enabled || !actor)
    return Response.json({ error: 'Actor not found.' }, { status: 404 })
  let body = ''
  let remoteActorId = 'unknown'
  let createdRecordId: string | null = null
  try {
    body = await readBoundedActivityBody(request)
    const sender =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('host') ??
      'unknown'
    if (!takeNetworkQuota('inboxPerMinute', sender))
      return activityJson({ error: 'Federation inbox is temporarily rate limited.' }, 429)
    const verified = await verifyInboundActivity({
      request,
      body,
      payload: actor.payload,
      allowPrivateDevelopment: app.networking.allowPrivateDevelopment,
    })
    remoteActorId = verified.activity.actor ?? remoteActorId
    const inbound = await recordInbound(actor.payload, {
      ...verified,
      envelope: {
        type: verified.activity.type,
        actor: verified.activity.actor,
        object: verified.activity.object,
      },
    })
    if (inbound.duplicate) return new Response(null, { status: 202 })
    if (inbound.record) createdRecordId = String(inbound.record.id)
    if (verified.activity.type === 'Follow' && verified.activity.object === actor.document.id) {
      const relationship = await actor.payload.find({
        collection: 'network-relationships',
        where: { idempotencyKey: { equals: verified.dedupeKey } },
        limit: 1,
        overrideAccess: true,
      })
      if (!relationship.docs[0])
        await actor.payload.create({
          collection: 'network-relationships',
          data: {
            localSubjectType: 'activitypub-actor',
            localSubjectId: actor.account.id,
            remoteActor: verified.remoteActor.id,
            kind: 'follow',
            direction: 'inbound',
            state: 'active',
            idempotencyKey: verified.dedupeKey,
          },
          overrideAccess: true,
        } as never)
      await queueActivityDelivery(actor.payload, {
        remoteActor: verified.remoteActor,
        envelope: relationshipActivity({
          type: 'Accept',
          id: `${actor.document.id}#accept-${encodeURIComponent(String(verified.activity.id ?? ''))}`,
          actor: actor.document.id,
          object: {
            id: verified.activity.id,
            type: 'Follow',
            actor: verified.activity.actor,
            object: actor.document.id,
          },
        }),
      })
    }
    if (
      verified.activity.type === 'Create' &&
      typeof verified.activity.object === 'object' &&
      verified.activity.object !== null
    ) {
      const object = verified.activity.object as Record<string, unknown>
      if (
        object.type === 'Note' &&
        typeof object.inReplyTo === 'string' &&
        typeof object.content === 'string'
      ) {
        // RC3-01: discussion paths are unique per site only, so the path
        // alone does not identify a tenant. A remote reply may attach
        // only to a discussion owned by the receiving actor's site,
        // cited under that site's canonical origin, and open to public
        // replies. Anything else fails closed: the delivery is still
        // acknowledged, but nothing is written.
        const replyTarget = new URL(object.inReplyTo)
        const actorSiteId = String((actor.publication as { site?: unknown }).site ?? '')
        const settings = await resolveSiteSettings(actor.payload, {
          includeTheme: false,
        })
        const canonicalOrigin =
          settings.canonicalOriginsBySite[actorSiteId] ?? settings.canonicalOrigin
        let targetOrigin = ''
        try {
          targetOrigin = new URL(canonicalOrigin).origin
        } catch {
          targetOrigin = ''
        }
        if (actorSiteId && targetOrigin && replyTarget.origin === targetOrigin) {
          const discussion = await actor.payload.find({
            collection: 'discussions',
            where: {
              and: [
                { canonicalPath: { equals: replyTarget.pathname } },
                { site: { equals: actorSiteId } },
                { status: { equals: 'open' } },
                { visibility: { equals: 'public' } },
                { commentsPolicy: { equals: 'open' } },
                { moderationState: { not_equals: 'removed' } },
              ],
            },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          })
          if (discussion.docs[0])
            await actor.payload.create({
              collection: 'discussion-posts',
              data: remoteReply({
                activityId: String(verified.activity.id),
                actor: String(verified.activity.actor),
                content: object.content.replace(/<[^>]*>/g, ''),
                inReplyTo: object.inReplyTo,
                discussionId: String(discussion.docs[0].id),
              }) as never,
              overrideAccess: true,
            })
        }
      }
    }
    if (inbound.record) {
      await actor.payload.update({
        collection: 'inbound-network-activities',
        id: inbound.record.id,
        data: { status: 'processed' },
        overrideAccess: true,
      })
    }
    createdRecordId = null
    return new Response(null, { status: 202 })
  } catch (error) {
    console.error('INBOX VERIFY ERROR:', error)
    // A failed processing must not burn the dedupe key (RC2-DEBT-22): roll
    // back the record this request created so the peer's legitimate retry
    // is processed fresh instead of acknowledged as a duplicate.
    if (createdRecordId) await releaseInbound(actor.payload, createdRecordId)
    try {
      remoteActorId = boundedActivity(body).actor ?? remoteActorId
    } catch {
      // Malformed input has no trustworthy actor identity; the source quota above still applies.
    }
    if (!takeNetworkQuota('invalidSignaturesPerHour', remoteActorId))
      return activityJson(
        { error: 'Federation source is temporarily blocked after invalid requests.' },
        429,
      )
    return activityJson({ error: 'Federation request rejected.' }, 401)
  }
}
