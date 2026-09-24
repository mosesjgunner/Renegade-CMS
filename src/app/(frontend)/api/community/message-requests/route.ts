import config from '@payload-config'
import { getPayload } from 'payload'
import { resolveCommunityActor } from '@/modules/community/service'
import { ConversationError, actOnMessageRequest } from '@/modules/community/conversation-composer'

/** Recipient-only request decisions. Pending requests deliberately have no delivery side effect. */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const siteId = String(body.siteId ?? request.headers.get('x-site-id') ?? 'default')
  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || !actor.memberId)
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  const action = String(body.action ?? '')
  if (!body.conversationId || !['accept', 'decline', 'block_and_report'].includes(action))
    return Response.json(
      { error: 'conversationId and a valid action are required' },
      { status: 400 },
    )
  try {
    const result = await actOnMessageRequest(payload, {
      siteId,
      conversationId: String(body.conversationId),
      recipientMemberId: actor.memberId,
      action: action as 'accept' | 'decline' | 'block_and_report',
      reason: body.reason ? String(body.reason) : undefined,
      details: body.details ? String(body.details) : undefined,
    })
    return Response.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof ConversationError)
      return Response.json({ error: error.message, code: error.code }, { status: error.status })
    return Response.json({ error: 'Failed to process message request' }, { status: 500 })
  }
}
