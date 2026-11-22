import type { Payload } from 'payload'
import { requireRoomAccess } from '../community/rooms'
import { assertMemberCanPost } from '../community/moderation-actions'
import { MediaWorkflowError } from '../media/workflow'
import { canDiscoverPublic } from '../public/contracts'

export type SubmissionActor = { siteId: string; memberId: string }
export const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
export const relationId = (value: unknown) =>
  typeof value === 'string' ? value : String((value as { id?: unknown } | null)?.id ?? '')
const targetFormat = /^(gallery|content|theater|room):(.+)$/
const targetUnavailable = () => new MediaWorkflowError('Submission target unavailable.', 404)

export async function submissionSite(payload: Payload, siteId: string) {
  const site = await payload.findByID({
    collection: 'sites',
    id: siteId,
    depth: 0,
    overrideAccess: true,
  })
  const policy = site.creatorPolicy as { enabled?: boolean; submissionTargets?: unknown } | null
  if (site.lifecycle !== 'active' || policy?.enabled !== true) throw targetUnavailable()
  return Array.isArray(policy.submissionTargets)
    ? policy.submissionTargets
        .filter((value): value is string => typeof value === 'string')
        .slice(0, 100)
    : []
}

export async function submissionTarget(
  payload: Payload,
  actor: SubmissionActor,
  key: string,
  mode: 'read' | 'write',
  allowed?: string[],
) {
  const match = targetFormat.exec(key)
  if (
    !match ||
    !uuid.test(match[2]) ||
    !(allowed ?? (await submissionSite(payload, actor.siteId))).includes(key)
  )
    throw targetUnavailable()
  const [, kind, id] = match
  try {
    if (mode === 'write') await assertMemberCanPost(payload, { ...actor, objectId: id })
    if (kind === 'room') {
      if (!actor.memberId) throw targetUnavailable()
      const audience = await requireRoomAccess(
        payload.db.pool.query.bind(payload.db.pool) as never,
        {
          siteId: actor.siteId,
          conversationId: id,
          memberId: actor.memberId,
        },
        mode,
      )
      if (audience.binding?.lifecycle !== 'open') throw targetUnavailable()
      const { rows } = await payload.db.pool.query<{ title: string | null }>(
        'SELECT title FROM conversations WHERE id=$1 AND site_id=$2',
        [id, actor.siteId],
      )
      return { key, title: rows[0]?.title || 'Community room', kind }
    }
    const collection = kind === 'gallery' ? 'albums' : kind === 'theater' ? 'videos' : 'content'
    const doc = await payload.findByID({ collection, id, depth: 0, overrideAccess: true })
    if (
      relationId(doc.site) !== actor.siteId ||
      doc.visibility !== 'public' ||
      !canDiscoverPublic(doc as Parameters<typeof canDiscoverPublic>[0]) ||
      ('requiredEntitlement' in doc && doc.requiredEntitlement)
    )
      throw targetUnavailable()
    if (collection !== 'albums') {
      const content = doc as import('@/payload-types').Content | import('@/payload-types').Video
      if (
        !['published', 'updated'].includes(content.status) ||
        (content.publishedAt && Date.parse(content.publishedAt) > Date.now())
      )
        throw targetUnavailable()
      if (
        collection === 'videos' &&
        (content as import('@/payload-types').Video).availability !== 'available'
      )
        throw targetUnavailable()
    }
    return { key, title: doc.title, kind }
  } catch {
    throw targetUnavailable()
  }
}

export async function canReviewSubmissions(payload: Payload, actor: SubmissionActor) {
  const [member, roles] = await Promise.all([
    payload.findByID({ collection: 'members', id: actor.memberId, depth: 0, overrideAccess: true }),
    payload.find({
      collection: 'member-site-roles',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { and: [{ site: { equals: actor.siteId } }, { member: { equals: actor.memberId } }] },
    }),
  ])
  return (
    member.status === 'active' && ['moderator', 'community-manager'].includes(roles.docs[0]?.role)
  )
}
