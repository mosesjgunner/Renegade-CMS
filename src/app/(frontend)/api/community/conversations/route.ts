import config from '@payload-config'
import { getPayload } from 'payload'
import { resolveCommunityActor } from '@/modules/community/service'
import {
  ConversationError,
  createGroupConversation,
  startDirectConversation,
} from '@/modules/community/conversation-composer'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId') ?? request.headers.get('x-site-id') ?? 'default'

  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || !actor.memberId) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const res = await (payload.db as any).pool.query(
      `SELECT c.* FROM "conversations" c
       JOIN "conversation_memberships" cm ON cm.conversation_id = c.id AND cm.left_at IS NULL
       WHERE cm.member_id = $1 AND c.site_id = $2
       ORDER BY c.last_message_at DESC NULLS LAST, c.updated_at DESC
       LIMIT 50`,
      [actor.memberId, siteId],
    )
    return Response.json({ conversations: res.rows })
  } catch (err: unknown) {
    if (err instanceof CommunityError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status })
    }
    return Response.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const siteId = String(body.siteId ?? request.headers.get('x-site-id') ?? 'default')

  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || !actor.memberId) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const memberIds = Array.isArray(body.memberIds) ? body.memberIds.map(String) : []
    const conversation =
      body.kind === 'group'
        ? await createGroupConversation(payload, {
            siteId,
            creatorMemberId: actor.memberId,
            memberIds,
            title: String(body.title ?? ''),
            avatarUrl: body.avatarUrl ? String(body.avatarUrl) : null,
          })
        : await startDirectConversation(payload, {
            siteId,
            memberId: actor.memberId,
            recipientMemberId: String(body.targetMemberId ?? ''),
          })
    return Response.json({ success: true, conversation }, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof ConversationError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status })
    }
    return Response.json({ error: 'Failed to start conversation' }, { status: 500 })
  }
}
