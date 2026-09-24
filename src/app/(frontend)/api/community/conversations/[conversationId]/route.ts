import config from '@payload-config'
import { getPayload } from 'payload'
import { resolveCommunityActor } from '@/modules/community/service'
import {
  administerGroupConversation,
  ConversationError,
} from '@/modules/community/conversation-composer'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const payload = await getPayload({ config })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const siteId = String(body.siteId ?? request.headers.get('x-site-id') ?? 'default')
  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || !actor.memberId)
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  const action = String(body.action ?? '')
  if (!['invite', 'remove', 'promote', 'demote', 'leave', 'update_metadata'].includes(action))
    return Response.json({ error: 'A valid group action is required' }, { status: 400 })
  try {
    const { conversationId } = await params
    const result = await administerGroupConversation(payload, {
      siteId,
      conversationId,
      actorMemberId: actor.memberId,
      action: action as 'invite' | 'remove' | 'promote' | 'demote' | 'leave' | 'update_metadata',
      targetMemberId: body.targetMemberId ? String(body.targetMemberId) : undefined,
      title: body.title === undefined ? undefined : String(body.title),
      avatarUrl:
        body.avatarUrl === undefined ? undefined : body.avatarUrl ? String(body.avatarUrl) : null,
    })
    return Response.json({ success: true, ...result })
  } catch (err: unknown) {
    if (err instanceof ConversationError)
      return Response.json({ error: err.message, code: err.code }, { status: err.status })
    return Response.json({ error: 'Failed to update group' }, { status: 500 })
  }
}
